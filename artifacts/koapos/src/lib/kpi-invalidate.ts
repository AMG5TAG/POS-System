import type { QueryClient } from "@tanstack/react-query";

/**
 * Refresh every KPI / sales-summary surface after revenue changes (a sale or
 * an invoice payment) so on-screen numbers update immediately instead of
 * waiting for the next poll or remount.
 *
 * Query keys are prefix-matched, so ["transactions"] also covers
 * ["transactions", <fromDate>] used by the KPI progress trackers.
 */
export function invalidateSalesKpiQueries(queryClient: QueryClient): void {
  const keys: string[][] = [
    ["kpi-invoices-paid"],       // Management → KPIs progress tracker (paid invoices)
    ["staff-kpi-invoices"],      // Staff → KPIs page (paid invoices)
    ["dashboard-kpi"],           // Dashboard KPI tile
    ["dashboard-summary-today"], // Dashboard summary tiles
    ["transactions"],            // transaction-derived KPI metrics
  ];
  for (const queryKey of keys) queryClient.invalidateQueries({ queryKey });
}
