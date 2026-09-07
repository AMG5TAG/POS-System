/**
 * backfill-linked-work-completion — close service jobs and appointments that
 * were billed but left open by the pre-fix linking bugs.
 *
 * Selling the work is what finishes it, but three paths used to lose the link
 * before the server could act on it:
 *   - a POS sale recovered its link by re-parsing the `[Service #...]` marker
 *     out of the sale's free-text notes, keyed on the mutable jobNumber;
 *   - a quote converted to a sale never carried its serviceJobId across;
 *   - every sale-driven completion skipped `completedAt`, so even the jobs that
 *     did close never started their repair-warranty window.
 * This finds the records that evidence says were billed and closes them.
 *
 * EVIDENCE (a record is only touched when one of these holds):
 *   invoice      a PAID invoice references it via invoices.service_job_id /
 *                appointment_id
 *   sale         a COMPLETED transaction's notes carry its [Service #<jobNumber>]
 *                / [Appt #<id>] marker
 *   quote        a CONVERTED quote references the job and its converted
 *                transaction exists and is completed
 *
 * SAFETY:
 *   - Only ever moves a record FORWARD into "completed". Never deletes, never
 *     touches any other column (beyond service_jobs.completed_at, below).
 *   - Skips anything already "completed" or "cancelled" — a cancelled job is
 *     left cancelled rather than being resurrected as work that happened.
 *   - Fills service_jobs.completed_at only when it is NULL, dated from the
 *     billing document (invoices.paid_at, else the sale's created_at) rather
 *     than "now", so repair warranties start from when the work was actually
 *     paid for instead of from the day this script happened to run.
 *   - Dry-run by DEFAULT (rolled back). Pass --commit to actually write.
 *   - Prints the DB host it's connected to so you can't backfill the wrong DB.
 *
 * Usage:
 *   # dry-run against dev (DATABASE_URL)
 *   pnpm exec tsx scripts/backfill-linked-work-completion.ts
 *   # dry-run against production (rolled back)
 *   DATABASE_URL="$PROD_DATABASE_URL" pnpm exec tsx scripts/backfill-linked-work-completion.ts
 *   # COMMIT against production
 *   DATABASE_URL="$PROD_DATABASE_URL" pnpm exec tsx scripts/backfill-linked-work-completion.ts --commit
 *
 * Options:
 *   --merchant <id>   limit to one merchant
 *   --verbose         list every record, not just a sample
 */
import { parseArgs } from "node:util";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

type Source = "invoice" | "sale" | "quote";

interface JobRow {
  id: number;
  merchantId: number;
  jobNumber: string;
  status: string;
  completedAt: Date | null;
  billedAt: Date;
  source: Source;
  reference: string;
}

interface ApptRow {
  id: number;
  merchantId: number;
  title: string;
  status: string;
  source: Source;
  reference: string;
}

/** Terminal statuses, matching lib/linked-work.ts. Kept in SQL as a literal
 *  list so the query does the filtering rather than pulling every job back. */
const TERMINAL = sql`('completed', 'cancelled')`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      commit: { type: "boolean", default: false },
      merchant: { type: "string" },
      verbose: { type: "boolean", default: false },
    },
  });
  const commit = values.commit === true;
  const verbose = values.verbose === true;
  const merchantId = values.merchant ? Number(values.merchant) : null;
  if (values.merchant && !Number.isInteger(merchantId)) {
    throw new Error(`--merchant must be an integer, got "${values.merchant}"`);
  }
  const merchantFilter = merchantId != null ? sql`AND j.merchant_id = ${merchantId}` : sql``;
  const apptMerchantFilter = merchantId != null ? sql`AND a.merchant_id = ${merchantId}` : sql``;

  const dbHost = process.env.DATABASE_URL?.replace(/^.*@/, "").replace(/\/.*$/, "") ?? "(unknown)";
  const [{ host }] = (await db.execute(sql`SELECT inet_server_addr()::text AS host`)).rows as { host: string | null }[];
  console.log(`DB: ${dbHost}  (server addr: ${host ?? "n/a"})`);
  console.log(merchantId != null ? `SCOPE: merchant ${merchantId}` : "SCOPE: all merchants");
  console.log(commit ? "MODE: COMMIT (writes will be applied)\n" : "MODE: DRY-RUN (rolled back)\n");

  /* ── Service jobs ────────────────────────────────────────────────────────
     One row per (job, evidence). DISTINCT ON keeps the EARLIEST billing date
     per job, so completed_at reflects when the work was first paid for rather
     than the most recent document that happens to mention it. */
  const jobRows = (await db.execute(sql`
    SELECT DISTINCT ON (id) *
    FROM (
      -- Billed by a paid invoice (linked by FK).
      SELECT j.id, j.merchant_id, j.job_number, j.status, j.completed_at,
             COALESCE(i.paid_at, i.updated_at, i.created_at) AS billed_at,
             'invoice' AS source, i.invoice_number AS reference
        FROM service_jobs j
        JOIN invoices i ON i.service_job_id = j.id AND i.merchant_id = j.merchant_id
       WHERE i.status = 'paid'
         AND j.status NOT IN ${TERMINAL}
         ${merchantFilter}

      UNION ALL

      -- Billed by a completed POS sale (linked by the notes marker). Matched on
      -- the exact marker text so a job number that is a prefix of another one
      -- can't steal the match.
      SELECT j.id, j.merchant_id, j.job_number, j.status, j.completed_at,
             t.created_at AS billed_at,
             'sale' AS source, t.receipt_number AS reference
        FROM service_jobs j
        JOIN transactions t
          ON t.merchant_id = j.merchant_id
         AND t.status = 'completed'
         AND (t.notes LIKE '%[Service #' || j.job_number || ':%'
           OR t.notes LIKE '%[Service #' || j.job_number || ']%')
       WHERE j.status NOT IN ${TERMINAL}
         ${merchantFilter}

      UNION ALL

      -- Billed by a quote that was converted into a completed sale. This is the
      -- link that was dropped entirely at conversion, so there is no marker to
      -- find on the sale — the quote is the only record of it.
      SELECT j.id, j.merchant_id, j.job_number, j.status, j.completed_at,
             t.created_at AS billed_at,
             'quote' AS source, q.quote_number AS reference
        FROM service_jobs j
        JOIN quotes q ON q.service_job_id = j.id AND q.merchant_id = j.merchant_id
        JOIN transactions t ON t.id = q.converted_transaction_id
         AND t.merchant_id = j.merchant_id AND t.status = 'completed'
       WHERE q.status = 'converted'
         AND j.status NOT IN ${TERMINAL}
         ${merchantFilter}
    ) evidence
    ORDER BY id, billed_at ASC
  `)).rows as Array<Record<string, unknown>>;

  const jobs: JobRow[] = jobRows.map((r) => ({
    id: Number(r.id),
    merchantId: Number(r.merchant_id),
    jobNumber: String(r.job_number),
    status: String(r.status),
    completedAt: r.completed_at ? new Date(r.completed_at as string) : null,
    billedAt: new Date(r.billed_at as string),
    source: r.source as Source,
    reference: String(r.reference ?? ""),
  }));

  /* ── Appointments ──────────────────────────────────────────────────────── */
  const apptRows = (await db.execute(sql`
    SELECT DISTINCT ON (id) *
    FROM (
      SELECT a.id, a.merchant_id, a.title, a.status,
             COALESCE(i.paid_at, i.updated_at, i.created_at) AS billed_at,
             'invoice' AS source, i.invoice_number AS reference
        FROM appointments a
        JOIN invoices i ON i.appointment_id = a.id AND i.merchant_id = a.merchant_id
       WHERE i.status = 'paid'
         AND a.status NOT IN ${TERMINAL}
         ${apptMerchantFilter}

      UNION ALL

      SELECT a.id, a.merchant_id, a.title, a.status,
             t.created_at AS billed_at,
             'sale' AS source, t.receipt_number AS reference
        FROM appointments a
        JOIN transactions t
          ON t.merchant_id = a.merchant_id
         AND t.status = 'completed'
         AND (t.notes LIKE '%[Appt #' || a.id::text || ':%'
           OR t.notes LIKE '%[Appt #' || a.id::text || ']%')
       WHERE a.status NOT IN ${TERMINAL}
         ${apptMerchantFilter}
    ) evidence
    ORDER BY id, billed_at ASC
  `)).rows as Array<Record<string, unknown>>;

  const appts: ApptRow[] = apptRows.map((r) => ({
    id: Number(r.id),
    merchantId: Number(r.merchant_id),
    title: String(r.title ?? ""),
    status: String(r.status),
    source: r.source as Source,
    reference: String(r.reference ?? ""),
  }));

  /* ── Report ─────────────────────────────────────────────────────────────── */
  const tally = <T extends { source: Source }>(rows: T[]) => {
    const by: Record<Source, number> = { invoice: 0, sale: 0, quote: 0 };
    for (const r of rows) by[r.source]++;
    return by;
  };
  const jobBy = tally(jobs);
  const apptBy = tally(appts);
  const needStamp = jobs.filter((j) => j.completedAt == null).length;

  console.log(`Service jobs to complete: ${jobs.length}`
    + `  (invoice: ${jobBy.invoice}, sale: ${jobBy.sale}, quote: ${jobBy.quote})`);
  console.log(`  ...of which need completed_at stamped: ${needStamp}`);
  console.log(`Appointments to complete: ${appts.length}`
    + `  (invoice: ${apptBy.invoice}, sale: ${apptBy.sale})\n`);

  const statusBreakdown = (rows: Array<{ status: string }>) => {
    const by = new Map<string, number>();
    for (const r of rows) by.set(r.status, (by.get(r.status) ?? 0) + 1);
    return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}: ${n}`).join(", ");
  };
  if (jobs.length) console.log(`Job statuses being replaced → ${statusBreakdown(jobs)}`);
  if (appts.length) console.log(`Appointment statuses being replaced → ${statusBreakdown(appts)}`);

  const show = verbose ? Number.MAX_SAFE_INTEGER : 15;
  if (jobs.length) {
    console.log(`\nService jobs${verbose ? "" : ` (first ${Math.min(show, jobs.length)})`}:`);
    for (const j of jobs.slice(0, show)) {
      console.log(`  m${j.merchantId} job #${j.id} ${j.jobNumber}  ${j.status} → completed`
        + `  [${j.source} ${j.reference}, billed ${j.billedAt.toISOString().slice(0, 10)}]`
        + (j.completedAt == null ? "  +completed_at" : "  (completed_at already set)"));
    }
  }
  if (appts.length) {
    console.log(`\nAppointments${verbose ? "" : ` (first ${Math.min(show, appts.length)})`}:`);
    for (const a of appts.slice(0, show)) {
      console.log(`  m${a.merchantId} appt #${a.id} "${a.title}"  ${a.status} → completed`
        + `  [${a.source} ${a.reference}]`);
    }
  }

  if (jobs.length === 0 && appts.length === 0) {
    console.log("\nNothing to do — no billed work is left open.");
    return;
  }

  /* ── Write ──────────────────────────────────────────────────────────────── */
  await db.transaction(async (tx) => {
    for (const j of jobs) {
      // completed_at is only filled when absent, and dated from the billing
      // document — never "now", which would give a two-year-old repair a
      // warranty starting today.
      if (j.completedAt == null) {
        await tx.execute(sql`
          UPDATE service_jobs SET status = 'completed', completed_at = ${j.billedAt}
           WHERE id = ${j.id} AND merchant_id = ${j.merchantId}`);
      } else {
        await tx.execute(sql`
          UPDATE service_jobs SET status = 'completed'
           WHERE id = ${j.id} AND merchant_id = ${j.merchantId}`);
      }
    }
    for (const a of appts) {
      await tx.execute(sql`
        UPDATE appointments SET status = 'completed'
         WHERE id = ${a.id} AND merchant_id = ${a.merchantId}`);
    }
    if (!commit) {
      console.log(`\nDRY-RUN: rolling back ${jobs.length} job + ${appts.length} appointment updates.`
        + " Re-run with --commit to apply.");
      throw new Error("__dry_run_rollback__");
    }
    console.log(`\nCOMMITTED ${jobs.length} service job + ${appts.length} appointment completions.`);
  }).catch((e) => { if ((e as Error).message !== "__dry_run_rollback__") throw e; });
}

main()
  .catch((err) => { console.error("backfill failed:", err); process.exitCode = 1; })
  .finally(() => pool.end());
