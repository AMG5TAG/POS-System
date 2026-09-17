/**
 * What a service job has been quoted, for the jobs list.
 *
 * Kept out of the route (and away from `db`) because the rule is a judgement
 * about money, not a query: a job's quote is revised in place and only re-raised
 * once the last one has been converted or declined, so the price the customer is
 * currently looking at is the **most recent** quote — not the sum of every quote
 * the job has ever carried, which would add a superseded price to the one that
 * replaced it.
 *
 * Any status counts, matching the quoted/not-quoted column beside it: a declined
 * or expired quote still means the customer was given a price.
 */
export interface JobQuoteSummary {
  hasQuote: boolean;
  /** The most recent quote's total; null when it could not be read as a number. */
  quoteTotal: number | null;
}

/**
 * Fold quote rows — **newest first** — into one summary per job. The first row
 * seen for a job is the one that counts; later (older) rows are skipped.
 */
export function summariseJobQuotes(
  rows: Array<{ serviceJobId: number | null; total: string | number | null }>,
): Map<number, JobQuoteSummary> {
  const byJob = new Map<number, JobQuoteSummary>();
  for (const row of rows) {
    if (row.serviceJobId == null || byJob.has(row.serviceJobId)) continue;
    const total = typeof row.total === "number" ? row.total : parseFloat(row.total ?? "");
    byJob.set(row.serviceJobId, {
      hasQuote: true,
      quoteTotal: Number.isFinite(total) ? total : null,
    });
  }
  return byJob;
}

/** A job nothing was ever quoted for. */
export const NO_QUOTE: JobQuoteSummary = { hasQuote: false, quoteTotal: null };
