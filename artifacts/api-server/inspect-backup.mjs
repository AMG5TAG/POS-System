import { Storage } from "@google-cloud/storage";
import crypto from "crypto";
import os from "os";
import path from "path";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const PASSWORD = process.env.BK_PASS;
const OBJECT = "backup-4-12-1781358414468.koapos.enc";

// ---- object storage client (Replit sidecar creds, same as the app) ----
const SIDE = "http://127.0.0.1:1106";
const client = new Storage({
  credentials: {
    audience: "replit", subject_token_type: "access_token",
    token_url: `${SIDE}/token`, type: "external_account",
    credential_source: { url: `${SIDE}/credential`, format: { type: "json", subject_token_field_name: "access_token" } },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});
const privateDir = process.env.PRIVATE_OBJECT_DIR; // /<bucket>/.private
const [, bucketName, ...rest] = privateDir.split("/");
const objectName = `${rest.join("/")}/uploads/${OBJECT}`;

// ---- crypto (mirror of backup-crypto.ts) ----
const SALT = 16, IV = 12, TAG = 16, ITER = 200_000, KEYB = 32;
function decryptBuffer(file, password) {
  const salt = file.subarray(0, SALT);
  const iv = file.subarray(SALT, SALT + IV);
  const tag = file.subarray(file.length - TAG);
  const ct = file.subarray(SALT + IV, file.length - TAG);
  const key = crypto.pbkdf2Sync(password, salt, ITER, KEYB, "sha256");
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

const work = await mkdtemp(path.join(os.tmpdir(), "bk-inspect-"));
try {
  console.log(`downloading gs://${bucketName}/${objectName} ...`);
  const [buf] = await client.bucket(bucketName).file(objectName).download();
  console.log(`downloaded ${buf.length} bytes`);

  let tarBuf;
  try {
    tarBuf = decryptBuffer(buf, PASSWORD);
  } catch (e) {
    console.error("\nDECRYPT FAILED — wrong password or corrupt file:", e.message);
    process.exit(2);
  }
  console.log("decrypt OK (GCM auth tag verified) — password is correct\n");

  const tarPath = path.join(work, "a.tar.gz");
  await writeFile(tarPath, tarBuf);
  await execFileAsync("tar", ["-xzf", tarPath, "-C", work]);
  const snap = JSON.parse(await readFile(path.join(work, "backup.json"), "utf8"));

  console.log("== snapshot header ==");
  console.log("schemaVersion:", snap.schemaVersion);
  console.log("merchantId:   ", snap.merchantId);
  console.log("exportedAt:   ", snap.exportedAt);

  const tables = snap.tables || {};
  const names = Object.keys(tables).sort();
  let total = 0;
  console.log(`\n== non-empty tables (of ${names.length}) ==`);
  const idRanges = {};
  for (const n of names) {
    const rows = tables[n];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    total += rows.length;
    const ids = rows.map((r) => r && r.id).filter((x) => typeof x === "number");
    const range = ids.length ? ` ids[${Math.min(...ids)}..${Math.max(...ids)}]` : "";
    if (ids.length) idRanges[n] = ids;
    console.log(`${n.padEnd(28)} ${String(rows.length).padStart(5)}${range}`);
  }
  console.log(`\ntotal rows across all tables: ${total}`);

  // expose id ranges for collision checking
  await writeFile("/tmp/bk-idranges.json", JSON.stringify(idRanges));
  console.log("\n(id ranges written to /tmp/bk-idranges.json for collision check)");
} finally {
  await rm(work, { recursive: true, force: true }).catch(() => {});
}
