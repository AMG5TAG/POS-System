import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HeardFromAnalytics } from "../heard-from-analytics";

// ── Mock contacts-export so we can capture what dl() receives ─────────────────
// We provide a real csvRow implementation so the CSV output is testable.
const mockDl = vi.fn<[string, string, string], void>();

vi.mock("../contacts-export", () => ({
  dl: mockDl,
  csvRow: (fields: (string | number | null | undefined)[]) =>
    fields
      .map((f) => {
        const s = String(f ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      })
      .join(","),
}));

// Import AFTER vi.mock so the mock is already in place.
const {
  exportHeardFromCSV,
  heardFromCsvFilename,
  heardFromXlsxFilename,
  heardFromPdfFilename,
} = await import("../heard-from-export");

// ─── fixtures ─────────────────────────────────────────────────────────────────

function makeAnalytics(
  overrides: Partial<HeardFromAnalytics> = {},
): HeardFromAnalytics {
  return {
    metric: "customers",
    breakdown: [
      {
        name: "Instagram",
        customers: 10,
        revenue: 500,
        avgSpend: 50,
        value: 10,
        fill: "#3b82f6",
      },
      {
        name: "Google",
        customers: 5,
        revenue: 300,
        avgSpend: 60,
        value: 5,
        fill: "#f59e0b",
      },
    ],
    comparison: [
      {
        name: "Instagram",
        current: 10,
        previous: 8,
        delta: 2,
        fill: "#3b82f6",
      },
      {
        name: "Google",
        current: 5,
        previous: 7,
        delta: -2,
        fill: "#f59e0b",
      },
    ],
    trend: {
      data: [
        { label: "1 Jan", Instagram: 3, Google: 2 },
        { label: "6 Jan", Instagram: 7, Google: 3 },
      ],
      sources: ["Instagram", "Google"],
    },
    colorMap: { Instagram: "#3b82f6", Google: "#f59e0b" },
    windowTotal: 15,
    windowRevenue: 800,
    highlights: [],
    ...overrides,
  };
}

// Parse the CSV string captured by the mock dl() into a 2-D string array.
function parseCSV(csv: string): string[][] {
  return csv
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) =>
      line.split(",").map((cell) => cell.replace(/^"|"$/g, "").trim()),
    );
}

function capturedCSV(): string[][] {
  const call = mockDl.mock.calls[0];
  if (!call) throw new Error("dl() was not called");
  return parseCSV(call[1]);
}

beforeEach(() => {
  mockDl.mockClear();
});

// ─── filename helpers ─────────────────────────────────────────────────────────

describe("filename helpers", () => {
  it("heardFromCsvFilename: all time", () => {
    expect(heardFromCsvFilename("all")).toBe("heard-from-all-time.csv");
  });

  it("heardFromCsvFilename: 30d", () => {
    expect(heardFromCsvFilename("30d")).toBe("heard-from-last-30-days.csv");
  });

  it("heardFromCsvFilename: 90d", () => {
    expect(heardFromCsvFilename("90d")).toBe("heard-from-last-90-days.csv");
  });

  it("heardFromCsvFilename: 12m", () => {
    expect(heardFromCsvFilename("12m")).toBe("heard-from-last-12-months.csv");
  });

  it("heardFromXlsxFilename matches csv but with .xlsx extension", () => {
    expect(heardFromXlsxFilename("30d")).toBe("heard-from-last-30-days.xlsx");
  });

  it("heardFromPdfFilename matches csv but with .pdf extension", () => {
    expect(heardFromPdfFilename("30d")).toBe("heard-from-last-30-days.pdf");
  });
});

// ─── exportHeardFromCSV – customers metric ────────────────────────────────────

describe("exportHeardFromCSV – customers metric", () => {
  it("calls dl() with the expected filename", () => {
    exportHeardFromCSV(makeAnalytics(), "30d");
    expect(mockDl.mock.calls[0][0]).toBe("heard-from-last-30-days.csv");
  });

  it("calls dl() with text/csv mime type", () => {
    exportHeardFromCSV(makeAnalytics(), "30d");
    expect(mockDl.mock.calls[0][2]).toContain("text/csv");
  });

  it("includes period label in the metadata rows", () => {
    exportHeardFromCSV(makeAnalytics(), "30d");
    const csv = capturedCSV();
    const periodRow = csv.find((r) => r[0] === "Period");
    expect(periodRow?.[1]).toBe("Last 30 days");
  });

  it("view row shows 'By customers' when metric is customers", () => {
    exportHeardFromCSV(makeAnalytics({ metric: "customers" }), "30d");
    const csv = capturedCSV();
    const viewRow = csv.find((r) => r[0] === "View");
    expect(viewRow?.[1]).toBe("By customers");
  });

  it("per-source totals header has 'Previous customers' column when comparison exists", () => {
    exportHeardFromCSV(makeAnalytics({ metric: "customers" }), "30d");
    const csv = capturedCSV();
    const headerRow = csv.find(
      (r) => r[0] === "Source" && r[1] === "Customers",
    );
    expect(headerRow).toBeDefined();
    expect(headerRow).toContain("Previous customers");
  });

  it("per-source totals header has correct Share % label for customers metric", () => {
    exportHeardFromCSV(makeAnalytics({ metric: "customers" }), "30d");
    const csv = capturedCSV();
    const headerRow = csv.find(
      (r) => r[0] === "Source" && r[1] === "Customers",
    );
    const shareCol = headerRow?.find((c) => c.startsWith("Share %"));
    expect(shareCol).toContain("by customers");
  });

  it("trend section header contains 'by customers' for customers metric", () => {
    exportHeardFromCSV(makeAnalytics({ metric: "customers" }), "30d");
    const csv = capturedCSV();
    const trendRow = csv.find((r) => r[0]?.startsWith("Trend over time"));
    expect(trendRow?.[0]).toContain("by customers");
  });

  it("per-source data rows contain customer count, revenue, avgSpend", () => {
    exportHeardFromCSV(makeAnalytics({ metric: "customers" }), "30d");
    const csv = capturedCSV();
    const igRow = csv.find((r) => r[0] === "Instagram");
    expect(igRow).toBeDefined();
    expect(igRow?.[1]).toBe("10"); // customers
    expect(igRow?.[2]).toBe("500.00"); // revenue
    expect(igRow?.[3]).toBe("50.00"); // avgSpend
  });

  it("previous column uses raw count (not money) for customers metric", () => {
    exportHeardFromCSV(makeAnalytics({ metric: "customers" }), "30d");
    const csv = capturedCSV();
    // Instagram: previous=8, delta=2 from comparison
    const igRow = csv.find((r) => r[0] === "Instagram");
    expect(igRow?.[5]).toBe("8"); // previous customers (not formatted as money)
    expect(igRow?.[6]).toBe("2"); // delta
  });

  it("no comparison columns when comparison is null", () => {
    exportHeardFromCSV(
      makeAnalytics({ comparison: null, metric: "customers" }),
      "all",
    );
    const csv = capturedCSV();
    const headerRow = csv.find(
      (r) => r[0] === "Source" && r[1] === "Customers",
    );
    expect(headerRow?.length).toBe(5); // Source,Customers,Total spent,Avg spend,Share%
  });

  it("windowTotal and windowRevenue appear in the summary rows", () => {
    exportHeardFromCSV(makeAnalytics(), "30d");
    const csv = capturedCSV();
    const custRow = csv.find((r) => r[0] === "Customers in window");
    const revRow = csv.find((r) => r[0] === "Revenue in window");
    expect(custRow?.[1]).toBe("15");
    expect(revRow?.[1]).toBe("800.00");
  });

  it("share % is rounded to nearest integer", () => {
    exportHeardFromCSV(makeAnalytics({ metric: "customers" }), "30d");
    const csv = capturedCSV();
    // Instagram: 10 customers out of 15 = 67%
    const igRow = csv.find((r) => r[0] === "Instagram");
    expect(igRow?.[4]).toBe("67");
  });
});

// ─── exportHeardFromCSV – revenue metric ─────────────────────────────────────

describe("exportHeardFromCSV – revenue metric", () => {
  const revenueAnalytics = makeAnalytics({
    metric: "revenue",
    breakdown: [
      {
        name: "Instagram",
        customers: 10,
        revenue: 500,
        avgSpend: 50,
        value: 500,
        fill: "#3b82f6",
      },
      {
        name: "Google",
        customers: 5,
        revenue: 300,
        avgSpend: 60,
        value: 300,
        fill: "#f59e0b",
      },
    ],
    comparison: [
      {
        name: "Instagram",
        current: 500,
        previous: 400,
        delta: 100,
        fill: "#3b82f6",
      },
      {
        name: "Google",
        current: 300,
        previous: 350,
        delta: -50,
        fill: "#f59e0b",
      },
    ],
  });

  it("view row shows 'By revenue' when metric is revenue", () => {
    exportHeardFromCSV(revenueAnalytics, "30d");
    const csv = capturedCSV();
    const viewRow = csv.find((r) => r[0] === "View");
    expect(viewRow?.[1]).toBe("By revenue");
  });

  it("per-source totals header has 'Previous spend' column when metric is revenue", () => {
    exportHeardFromCSV(revenueAnalytics, "30d");
    const csv = capturedCSV();
    const headerRow = csv.find(
      (r) => r[0] === "Source" && r[1] === "Customers",
    );
    expect(headerRow).toContain("Previous spend");
  });

  it("per-source totals header does NOT have 'Previous customers' for revenue metric", () => {
    exportHeardFromCSV(revenueAnalytics, "30d");
    const csv = capturedCSV();
    const headerRow = csv.find(
      (r) => r[0] === "Source" && r[1] === "Customers",
    );
    expect(headerRow).not.toContain("Previous customers");
  });

  it("share % is based on revenue when metric is revenue", () => {
    exportHeardFromCSV(revenueAnalytics, "30d");
    const csv = capturedCSV();
    // Instagram: 500 / 800 = 62.5 → 63%
    const igRow = csv.find((r) => r[0] === "Instagram");
    expect(igRow?.[4]).toBe("63");
  });

  it("previous column is formatted as money for revenue metric", () => {
    exportHeardFromCSV(revenueAnalytics, "30d");
    const csv = capturedCSV();
    const igRow = csv.find((r) => r[0] === "Instagram");
    expect(igRow?.[5]).toBe("400.00"); // previous revenue formatted
    expect(igRow?.[6]).toBe("100.00"); // delta formatted
  });

  it("trend section header contains 'by revenue' for revenue metric", () => {
    exportHeardFromCSV(revenueAnalytics, "30d");
    const csv = capturedCSV();
    const trendRow = csv.find((r) => r[0]?.startsWith("Trend over time"));
    expect(trendRow?.[0]).toContain("by revenue");
  });

  it("trend data rows use money format for revenue metric", () => {
    exportHeardFromCSV(revenueAnalytics, "30d");
    const csv = capturedCSV();
    // First trend data row (label '1 Jan'): Instagram=3, Google=2, Total=5
    // In revenue mode those 3/2/5 are rendered as "3.00"/"2.00"/"5.00"
    const dataRow = csv.find(
      (r) => r[0] === "1 Jan" || r[0].includes("Jan"),
    );
    // Each count cell should look like N.NN
    const countCells = dataRow?.slice(1);
    countCells?.forEach((cell) => {
      expect(cell).toMatch(/^\d+\.\d{2}$/);
    });
  });

  it("trend data rows use plain integers for customers metric", () => {
    exportHeardFromCSV(makeAnalytics({ metric: "customers" }), "30d");
    const csv = capturedCSV();
    const dataRow = csv.find(
      (r) => r[0] === "1 Jan" || r[0].includes("Jan"),
    );
    const countCells = dataRow?.slice(1);
    countCells?.forEach((cell) => {
      // plain integer: no dot
      expect(cell).toMatch(/^\d+$/);
    });
  });
});
