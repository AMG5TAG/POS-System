/**
 * db-env-guard — fail-closed confirmation that a destructive maintenance script
 * is connected to the database the operator actually intends to modify.
 *
 * KoaPOS selects dev vs prod purely by the value of `DATABASE_URL`, so nothing
 * normally stops a restore/transfer from running against the wrong database. The
 * guard requires an explicit `EXPECTED_DB` opt-in and cross-checks it against a
 * fingerprint of the live connection. It throws (never prompts) so it is safe in
 * non-interactive `tsx` runs.
 *
 *   EXPECTED_DB=development|production   (required — forces a conscious choice)
 *   DB_FINGERPRINT_DEVELOPMENT=<hash>    (optional — locks dev to one DB)
 *   DB_FINGERPRINT_PRODUCTION=<hash>     (optional — locks prod to one DB)
 *
 * The fingerprint is a short sha256 of the connection's host + database name, so
 * it identifies a database without committing any secret. On first run leave the
 * fingerprint env unset; the guard prints the live fingerprint so you can lock
 * it in.
 */
import crypto from "crypto";

export type DbEnv = "development" | "production";

/** Short, secret-free identifier for the database `url` points at (host + db name). */
export function databaseFingerprint(url = process.env.DATABASE_URL): string {
  if (!url) {
    throw new Error("DATABASE_URL is not set — cannot fingerprint the database.");
  }
  const u = new URL(url);
  const material = `${u.host}${u.pathname}`; // host:port + /dbname
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 12);
}

/**
 * Assert the connected database matches the operator's stated `EXPECTED_DB`.
 * Throws if `EXPECTED_DB` is unset/invalid, or if a configured fingerprint does
 * not match the live connection. Returns the confirmed environment.
 */
export function assertExpectedEnv(): DbEnv {
  const expected = process.env.EXPECTED_DB as DbEnv | undefined;
  if (expected !== "development" && expected !== "production") {
    throw new Error(
      "Refusing to run: set EXPECTED_DB=development or EXPECTED_DB=production to " +
        "confirm which database you intend to modify.",
    );
  }

  const fp = databaseFingerprint();
  const envKey = `DB_FINGERPRINT_${expected.toUpperCase()}` as const;
  const expectedFp = process.env[envKey];

  if (expectedFp) {
    if (fp !== expectedFp) {
      throw new Error(
        `Refusing to run: EXPECTED_DB=${expected} but the live DATABASE_URL fingerprint ` +
          `(${fp}) does not match ${envKey} (${expectedFp}). You may be pointed at the ` +
          "wrong database — aborting.",
      );
    }
  } else {
    console.warn(
      `[db-env-guard] ${envKey} is not set; skipping fingerprint check. The live ` +
        `database fingerprint is ${fp}. Set ${envKey}=${fp} to lock this in.`,
    );
  }

  const nodeEnv = process.env.NODE_ENV;
  if (expected === "production" && nodeEnv !== "production") {
    console.warn(
      `[db-env-guard] EXPECTED_DB=production but NODE_ENV=${nodeEnv ?? "(unset)"}.`,
    );
  }
  if (expected === "development" && nodeEnv === "production") {
    console.warn("[db-env-guard] EXPECTED_DB=development but NODE_ENV=production.");
  }

  return expected;
}
