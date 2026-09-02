/**
 * Provider-agnostic payroll abstraction.
 *
 * KoaPOS integrates an EXTERNAL payroll provider (Xero Payroll first) that owns
 * pay calculation, STP/ATO lodgement, superannuation and multi-region
 * compliance. Each provider is implemented as a `PayrollProvider` adapter; the
 * route layer talks only to this interface and never to a provider's API
 * directly, so adding Deputy or other providers later is purely additive.
 *
 * Monetary amounts in DTOs are integer cents to match the DB mirror tables.
 */

export type PayrollRegion = "AU" | "NZ" | "UK";

/** Authenticated context passed to every adapter call. The route obtains this
 *  by refreshing the merchant's stored OAuth token before delegating.
 *
 *  `tenantId` is the provider's connection identifier interpreted by each
 *  adapter (e.g. a Xero tenant GUID). `apiKey` carries the OAuth client id
 *  where a provider requires it as an API header. */
export interface PayrollAuth {
  accessToken: string;
  tenantId: string;
  region: PayrollRegion;
  apiKey?: string;
}

export interface ProviderEmployee {
  employeeId: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface ProviderPayRun {
  payRunId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  paymentDate?: string; // YYYY-MM-DD
  status: string; // provider status, normalised by the route to draft|posted|filed|paid
  grossCents: number;
  paygCents: number;
  superCents: number;
  netCents: number;
  employeeCount: number;
}

export interface ProviderPayslip {
  payslipId: string;
  employeeId: string;
  employeeName: string;
  grossCents: number;
  paygCents: number;
  superCents: number;
  netCents: number;
  leaveAccruedHours?: string;
}

export interface ProviderLeaveBalance {
  employeeId: string;
  employeeName: string;
  leaveType: string; // normalised: annual|personal|long_service|other
  leaveTypeName: string;
  balanceHours: string;
  accruedHours?: string;
  asAtDate?: string;
}

export interface TimesheetLine {
  employeeId: string;
  date: string; // YYYY-MM-DD
  hours: number;
}

export interface CreatePayRunArgs {
  periodStart: string;
  periodEnd: string;
  paymentDate?: string;
  payCalendarId?: string;
}

/** A payroll provider adapter. All methods may throw on transport/API errors;
 *  the route layer is responsible for translating failures into HTTP results. */
export interface PayrollProvider {
  readonly key: string;
  listEmployees(auth: PayrollAuth): Promise<ProviderEmployee[]>;
  pushTimesheets(auth: PayrollAuth, lines: TimesheetLine[]): Promise<{ pushed: number }>;
  createPayRun(auth: PayrollAuth, args: CreatePayRunArgs): Promise<ProviderPayRun>;
  getPayRun(auth: PayrollAuth, payRunId: string): Promise<ProviderPayRun | null>;
  postPayRun(auth: PayrollAuth, payRunId: string): Promise<ProviderPayRun>;
  getPayslips(auth: PayrollAuth, payRunId: string): Promise<ProviderPayslip[]>;
  getLeaveBalances(auth: PayrollAuth): Promise<ProviderLeaveBalance[]>;
}
