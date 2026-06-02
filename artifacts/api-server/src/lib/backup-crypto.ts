/**
 * backup-crypto — password-based AES-256-GCM encryption for backup archives.
 *
 * A backup file is self-contained: it begins with a header carrying the random
 * salt and IV used to derive/seed the cipher, so the file alone (plus the
 * password) is enough to decrypt. AES-256-GCM carries an authentication tag, so
 * a wrong password or a tampered file fails loudly on decryption rather than
 * returning garbage.
 *
 * File layout: [salt(16)] [iv(12)] [ciphertext...] [authTag(16)]
 *
 * Uses only Node.js built-ins.
 */
import crypto from "crypto";
import { createReadStream, createWriteStream } from "fs";
import bcrypt from "bcryptjs";

const ALGORITHM = "aes-256-gcm";
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PBKDF2_ITERATIONS = 200_000;
const KEY_BYTES = 32;

/** PBKDF2-SHA256, 200k iterations → 32-byte key. */
export function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_BYTES, "sha256");
}

/**
 * Encrypt `inputPath` to `outputPath` using a password-derived key. Streams the
 * input so large archives never load fully into memory. Writes the salt and IV
 * as a header, then the ciphertext, then appends the GCM auth tag.
 */
export function encryptStream(
  inputPath: string,
  outputPath: string,
  password: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_BYTES);
    const iv = crypto.randomBytes(IV_BYTES);
    const key = deriveKey(password, salt);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const output = createWriteStream(outputPath);
    const input = createReadStream(inputPath);

    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      input.destroy();
      output.destroy();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    input.on("error", fail);
    cipher.on("error", fail);
    output.on("error", fail);

    output.on("finish", () => {
      if (settled) return;
      settled = true;
      resolve();
    });

    output.write(salt);
    output.write(iv);

    cipher.on("data", (chunk: Buffer) => output.write(chunk));
    cipher.on("end", () => {
      try {
        output.write(cipher.getAuthTag());
        output.end();
      } catch (err) {
        fail(err);
      }
    });

    input.pipe(cipher);
  });
}

/**
 * Read an encrypted backup file, re-derive the key from the password + stored
 * salt, and decrypt it. Throws on auth-tag mismatch (wrong password or tampered
 * file) — callers should treat that as an "invalid password" condition.
 */
export async function decryptBuffer(
  encryptedPath: string,
  password: string,
): Promise<Buffer> {
  const { readFile } = await import("fs/promises");
  const file = await readFile(encryptedPath);
  if (file.length < SALT_BYTES + IV_BYTES + TAG_BYTES) {
    throw new Error("Backup file is too small or corrupted");
  }

  const salt = file.subarray(0, SALT_BYTES);
  const iv = file.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const tag = file.subarray(file.length - TAG_BYTES);
  const ciphertext = file.subarray(SALT_BYTES + IV_BYTES, file.length - TAG_BYTES);

  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  // .final() throws if the auth tag doesn't verify.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** bcrypt hash for storing the admin's chosen backup password (verification only). */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/** Verify a password against a stored bcrypt hash. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
