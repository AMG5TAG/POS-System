import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";

/* One-off, idempotent backfill: bcrypt-hash any staff register PIN still stored
 * as plaintext. Already-hashed rows (starting with `$2a$`/`$2b$`/`$2y$`) and
 * null PINs are skipped, so this is safe to re-run on every `db:push`. Login
 * tolerates plaintext during the transition, so running this never locks anyone
 * out — it only removes the plaintext at rest. */
function isHashed(pin: string): boolean {
  return /^\$2[aby]\$/.test(pin);
}

async function main() {
  try {
    const { rows } = await pool.query<{ id: number; pin: string }>(
      "SELECT id, pin FROM staff WHERE pin IS NOT NULL AND pin <> ''",
    );
    let hashed = 0;
    for (const row of rows) {
      if (isHashed(row.pin)) continue;
      const hash = await bcrypt.hash(row.pin, 10);
      await pool.query("UPDATE staff SET pin = $1 WHERE id = $2", [hash, row.id]);
      hashed++;
    }
    console.log(`Staff PINs hashed: ${hashed} (of ${rows.length} with a PIN; rest already hashed)`);
  } catch (e: unknown) {
    console.error((e as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
