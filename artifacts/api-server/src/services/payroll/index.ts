import type { PayrollProvider } from "./types";
import { xeroPayrollAdapter, XERO_OAUTH_SCOPES } from "./xeroPayrollAdapter";
import { myobPayrollAdapter } from "./myobPayrollAdapter";

export * from "./types";
export * from "./oauth";
export { XERO_OAUTH_SCOPES };

/**
 * Resolve the adapter for a provider key. v1 ships Xero Payroll and MYOB;
 * QuickBooks / Deputy slot in here behind the same `PayrollProvider` interface.
 */
export function getPayrollProvider(providerKey: string): PayrollProvider | null {
  switch (providerKey) {
    case "xero_payroll":
      return xeroPayrollAdapter;
    case "myob_payroll":
      return myobPayrollAdapter;
    default:
      return null;
  }
}
