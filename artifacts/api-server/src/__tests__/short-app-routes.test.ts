import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, merchantsTable: {} }));
import { matchAppRoute } from "../routes/pwa";

/* The staff apps and the dashboard moved to short addresses. Each must still be
   recognised as an installable app, and the old addresses must keep matching. */
describe("short app addresses", () => {
  it.each([
    ["/a/tech", "Tech"],
    ["/a/mobile", "POS"],
    ["/d/dashboard/19851986", "Dashboard"],
    ["/b/koastal/t/techapp", "Tech"],
    ["/b/koastal/t/posapp", "POS"],
    ["/d/f074f005466aa438", "Dashboard"],
  ])("%s is the %s app", (path, suffix) => {
    expect(matchAppRoute(path)?.route.suffix).toBe(suffix);
  });

  it("brands the short staff addresses with the one business", () => {
    expect(matchAppRoute("/a/tech")?.route.soleBusiness).toBe(true);
    expect(matchAppRoute("/a/mobile")?.route.soleBusiness).toBe(true);
  });
});
