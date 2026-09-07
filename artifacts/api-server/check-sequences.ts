/**
 * Sequence health check.
 *
 * The merchant-4 restores (restore-merchant4.ts / restore-merchant4-prod.ts)
 * insert rows with EXPLICIT ids shifted by +1,000,000. Inserting an explicit id
 * does not advance the table's identity sequence, and neither script calls
 * setval afterwards. Any table whose sequence now sits at or below an id that
 * already exists will fail EVERY subsequent insert with a duplicate-key error
 * on the primary key — not intermittently, but every time, until nextval
 * finally climbs past the occupied range.
 *
 * That is what a "can't create X, every time" report looks like from the UI:
 * the route throws a pg 23505 on the pkey (not on any business-rule unique
 * index, so the job-number retry helper doesn't catch it) and the client sees
 * a bare failure.
 *
 * Read-only by default: it reports. Run with DO_FIX=1 to repair, which calls
 * setval(seq, max(id)) on the affected tables only. That touches no row data —
 * it only moves each sequence forward past the ids already in use, so no
 * existing record is altered, deleted, or renumbered.
 *
 *   pnpm --filter @workspace/api-server exec tsx check-sequences.ts
 *   DO_FIX=1 pnpm --filter @workspace/api-server exec tsx check-sequences.ts
 */
import { pool } from "@workspace/db";

const DO_FIX = process.env.DO_FIX === "1";

type Row = {
  table_name: string;
  column_name: string;
  sequence_name: string;
  last_value: string | null;
  max_id: string | null;
};

async function main(): Promise<void> {
  // Every integer column backed by a sequence, paired with that sequence's
  // current value and the table's highest live id.
  const { rows } = await pool.query<Row>(`
    SELECT
      c.table_name,
      c.column_name,
      pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) AS sequence_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) IS NOT NULL
    ORDER BY c.table_name
  `);

  type Finding = {
    table: string; column: string; seq: string;
    last: number; max: number; nextId: number; blockedFor: number;
  };
  const colliding: Finding[] = [];  // an insert fails right now
  const atRisk: Finding[] = [];     // next id is free, but the sequence is behind
  let checked = 0;

  for (const r of rows) {
    if (!r.sequence_name) continue;
    const seq = r.sequence_name;

    const [{ rows: [{ last_value, is_called }] }, { rows: [{ max_id }] }] = await Promise.all([
      pool.query<{ last_value: string; is_called: boolean }>(
        `SELECT last_value, is_called FROM ${seq}`,
      ),
      pool.query<{ max_id: string | null }>(
        `SELECT max(${r.column_name})::text AS max_id FROM ${r.table_name}`,
      ),
    ]);

    checked++;
    if (max_id == null) continue;

    const max = Number(max_id);
    const last = Number(last_value);
    // `is_called = false` means nextval will return last_value itself rather
    // than last_value + 1, so the next id is one lower than it looks.
    const nextId = is_called ? last + 1 : last;

    if (nextId > max) continue;

    /* Being behind max is not itself a failure: after an id-shifted restore the
       sequence sits in the low range while the restored rows live at 1,000,000+,
       so nextval returns a low id that is simply free. It breaks only when the
       id nextval is about to hand out is already taken. `blockedFor` is how many
       consecutive ids from there are occupied — i.e. how many inserts fail in a
       row before one finally lands on a free id. */
    const { rows: [{ blocked }] } = await pool.query<{ blocked: string }>(
      `WITH RECURSIVE run(i) AS (
         SELECT $1::bigint
         UNION ALL
         SELECT i + 1 FROM run
          WHERE EXISTS (SELECT 1 FROM ${r.table_name} t WHERE t.${r.column_name} = run.i)
       )
       SELECT (count(*) - 1)::text AS blocked FROM run`,
      [nextId],
    );

    const finding: Finding = {
      table: r.table_name, column: r.column_name, seq,
      last, max, nextId, blockedFor: Number(blocked),
    };
    if (finding.blockedFor > 0) colliding.push(finding);
    else atRisk.push(finding);
  }

  console.log(`Checked ${checked} sequences.\n`);

  if (colliding.length === 0 && atRisk.length === 0) {
    console.log("All sequences are ahead of their table's max id — no insert can collide.");
    await pool.end();
    return;
  }

  if (colliding.length > 0) {
    console.log(`BROKEN NOW — ${colliding.length} table(s) where the next id is already taken.`);
    console.log("Every insert here fails with a duplicate-key error on the primary key:\n");
    for (const b of colliding) {
      console.log(`  ${b.table}.${b.column}  next id ${b.nextId} is taken — ${b.blockedFor} consecutive id(s) blocked (max id ${b.max})`);
    }
    console.log("");
  }

  if (atRisk.length > 0) {
    console.log(`AT RISK — ${atRisk.length} table(s) whose sequence is behind the data but whose`);
    console.log("next id happens to be free. Inserts work today and collide once the gap fills:\n");
    for (const b of atRisk) {
      console.log(`  ${b.table}.${b.column}  sequence at ${b.last}, max id ${b.max}`);
    }
  }

  const behind = [...colliding, ...atRisk];

  if (!DO_FIX) {
    console.log("\nRead-only run — nothing changed. Re-run with DO_FIX=1 to repair.");
    await pool.end();
    return;
  }

  console.log("\nDO_FIX=1 — advancing each sequence past the ids already in use.");
  for (const b of behind) {
    await pool.query(`SELECT setval('${b.seq}', (SELECT max(${b.column}) FROM ${b.table}))`);
    console.log(`  ${b.table}.${b.column} -> ${b.max}`);
  }
  console.log("\nDone. No row data was read, written, or deleted — only sequence positions moved.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
