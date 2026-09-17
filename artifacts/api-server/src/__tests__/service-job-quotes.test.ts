import { describe, it, expect } from "vitest";
import { summariseJobQuotes, NO_QUOTE } from "../lib/service-job-quotes";

/* The jobs list shows what each job was quoted, and adds the column up. What
   goes in the column is the price the customer is currently looking at. */
describe("summariseJobQuotes", () => {
  it("reports the most recent quote, not the sum of every quote on the job", () => {
    // Newest first, as the query returns them: the job was quoted $370, that
    // quote was declined, and it was re-quoted at $420.
    const byJob = summariseJobQuotes([
      { serviceJobId: 3, total: "420.00" },
      { serviceJobId: 3, total: "370.00" },
    ]);

    expect(byJob.get(3)).toEqual({ hasQuote: true, quoteTotal: 420 });
    // $790 would be two prices for one repair, only one of which stands.
    expect(byJob.get(3)?.quoteTotal).not.toBe(790);
  });

  it("summarises each job independently", () => {
    const byJob = summariseJobQuotes([
      { serviceJobId: 3, total: "420.00" },
      { serviceJobId: 8, total: "95.50" },
      { serviceJobId: 3, total: "370.00" },
    ]);
    expect(byJob.get(3)?.quoteTotal).toBe(420);
    expect(byJob.get(8)?.quoteTotal).toBe(95.5);
    expect(byJob.size).toBe(2);
  });

  it("counts a quote of any status — being declined is still being quoted", () => {
    // Status never reaches here: every row the query returns counts, which is
    // what keeps the money column in step with the quoted/not-quoted tick.
    expect(summariseJobQuotes([{ serviceJobId: 3, total: "0.00" }]).get(3))
      .toEqual({ hasQuote: true, quoteTotal: 0 });
  });

  it("ignores quotes not raised against a job", () => {
    const byJob = summariseJobQuotes([
      { serviceJobId: null, total: "1000.00" },
      { serviceJobId: 3, total: "420.00" },
    ]);
    expect(byJob.size).toBe(1);
    expect(byJob.get(3)?.quoteTotal).toBe(420);
  });

  it("marks a total it cannot read as unknown rather than zero", () => {
    // A blank column would otherwise add $0 to the footer and read as "quoted
    // at nothing".
    expect(summariseJobQuotes([{ serviceJobId: 3, total: null }]).get(3))
      .toEqual({ hasQuote: true, quoteTotal: null });
  });

  it("leaves an unquoted job with nothing to show", () => {
    expect(summariseJobQuotes([]).get(3) ?? NO_QUOTE).toEqual({ hasQuote: false, quoteTotal: null });
  });
});
