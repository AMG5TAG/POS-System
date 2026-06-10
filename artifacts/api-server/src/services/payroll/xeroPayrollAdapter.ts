import type {
  PayrollProvider,
  PayrollAuth,
  PayrollRegion,
  ProviderEmployee,
  ProviderPayRun,
  ProviderPayslip,
  ProviderLeaveBalance,
  TimesheetLine,
  CreatePayRunArgs,
} from "./types";

/**
 * Xero Payroll adapter.
 *
 * Xero's payroll API is region-split: AU is `payroll.xro/1.0`, while NZ/UK use
 * `payroll.xro/2.0` with different payload shapes. v1 implements AU concretely;
 * NZ/UK resolve the correct base URL through the same interface and are wired
 * for follow-up payload mapping (flagged inline).
 */

const XERO_OAUTH_SCOPES =
  "openid profile email payroll.employees payroll.payruns payroll.payslip payroll.timesheets payroll.settings offline_access";

function payrollBase(region: PayrollRegion): string {
  // AU: v1.0; NZ/UK: v2.0
  return region === "AU"
    ? "https://api.xero.com/payroll.xro/1.0"
    : "https://api.xero.com/payroll.xro/2.0";
}

/** Xero AU serialises money as decimal dollars; the rest of KoaPOS uses cents. */
function dollarsToCents(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Xero AU dates arrive as "/Date(1640995200000+0000)/" or ISO; normalise to YYYY-MM-DD. */
function parseXeroDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const ms = /\/Date\((\d+)/.exec(value);
  const d = ms ? new Date(Number(ms[1])) : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().split("T")[0];
}

/** Map a Xero leave-type name to KoaPOS's normalised leave types. */
function normaliseLeaveType(name: string): ProviderLeaveBalance["leaveType"] {
  const n = name.toLowerCase();
  if (n.includes("annual") || n.includes("holiday")) return "annual";
  if (n.includes("personal") || n.includes("sick") || n.includes("carer")) return "personal";
  if (n.includes("long service")) return "long_service";
  return "other";
}

async function xeroFetch<T>(auth: PayrollAuth, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${payrollBase(auth.region)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "xero-tenant-id": auth.tenantId,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Xero Payroll API ${r.status}: ${body.slice(0, 300)}`);
  }
  return (await r.json()) as T;
}

interface XeroEmployee {
  EmployeeID: string;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  LeaveBalances?: Array<{ LeaveName?: string; LeaveTypeID?: string; NumberOfUnits?: number }>;
}
interface XeroPayRun {
  PayRunID: string;
  PayRunPeriodStartDate?: string;
  PayRunPeriodEndDate?: string;
  PaymentDate?: string;
  PayRunStatus?: string;
  Wages?: number;
  Tax?: number;
  Super?: number;
  NetPay?: number;
  Payslips?: Array<{ PayslipID: string; EmployeeID: string; FirstName?: string; LastName?: string }>;
}
interface XeroPayslip {
  PayslipID: string;
  EmployeeID: string;
  FirstName?: string;
  LastName?: string;
  Wages?: number;
  Tax?: number;
  Super?: number;
  NetPay?: number;
}

function mapPayRun(p: XeroPayRun): ProviderPayRun {
  return {
    payRunId: p.PayRunID,
    periodStart: parseXeroDate(p.PayRunPeriodStartDate) ?? "",
    periodEnd: parseXeroDate(p.PayRunPeriodEndDate) ?? "",
    paymentDate: parseXeroDate(p.PaymentDate),
    status: p.PayRunStatus ?? "DRAFT",
    grossCents: dollarsToCents(p.Wages),
    paygCents: dollarsToCents(p.Tax),
    superCents: dollarsToCents(p.Super),
    netCents: dollarsToCents(p.NetPay),
    employeeCount: p.Payslips?.length ?? 0,
  };
}

export const xeroPayrollAdapter: PayrollProvider = {
  key: "xero_payroll",

  async listEmployees(auth) {
    const data = await xeroFetch<{ Employees?: XeroEmployee[] }>(auth, "/Employees");
    return (data.Employees ?? []).map<ProviderEmployee>((e) => ({
      employeeId: e.EmployeeID,
      firstName: e.FirstName ?? "",
      lastName: e.LastName ?? "",
      email: e.Email,
    }));
  },

  async pushTimesheets(auth, lines: TimesheetLine[]) {
    if (lines.length === 0) return { pushed: 0 };
    // Group hours per employee into a single timesheet payload per period.
    const byEmployee = new Map<string, TimesheetLine[]>();
    for (const l of lines) {
      const bucket = byEmployee.get(l.employeeId) ?? [];
      bucket.push(l);
      byEmployee.set(l.employeeId, bucket);
    }
    const dates = lines.map((l) => l.date).sort();
    const Timesheets = [...byEmployee.entries()].map(([employeeId, ls]) => ({
      EmployeeID: employeeId,
      StartDate: dates[0],
      EndDate: dates[dates.length - 1],
      Status: "DRAFT",
      TimesheetLines: ls.map((l) => ({ Date: l.date, NumberOfUnits: [l.hours] })),
    }));
    await xeroFetch(auth, "/Timesheets", { method: "POST", body: JSON.stringify({ Timesheets }) });
    return { pushed: Timesheets.length };
  },

  async createPayRun(auth, args: CreatePayRunArgs) {
    const body = {
      PayRuns: [
        {
          ...(args.payCalendarId ? { PayrollCalendarID: args.payCalendarId } : {}),
          PayRunPeriodStartDate: args.periodStart,
          PayRunPeriodEndDate: args.periodEnd,
          ...(args.paymentDate ? { PaymentDate: args.paymentDate } : {}),
          PayRunStatus: "DRAFT",
        },
      ],
    };
    const data = await xeroFetch<{ PayRuns?: XeroPayRun[] }>(auth, "/PayRuns", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const created = data.PayRuns?.[0];
    if (!created) throw new Error("Xero did not return a created pay run");
    return mapPayRun(created);
  },

  async getPayRun(auth, payRunId: string) {
    const data = await xeroFetch<{ PayRuns?: XeroPayRun[] }>(auth, `/PayRuns/${payRunId}`);
    const p = data.PayRuns?.[0];
    return p ? mapPayRun(p) : null;
  },

  async postPayRun(auth, payRunId: string) {
    const data = await xeroFetch<{ PayRuns?: XeroPayRun[] }>(auth, `/PayRuns/${payRunId}`, {
      method: "POST",
      body: JSON.stringify({ PayRuns: [{ PayRunID: payRunId, PayRunStatus: "POSTED" }] }),
    });
    const p = data.PayRuns?.[0];
    if (!p) throw new Error("Xero did not return the posted pay run");
    return mapPayRun(p);
  },

  async getPayslips(auth, payRunId: string) {
    // The pay run carries payslip stubs; fetch each for the money breakdown.
    const runData = await xeroFetch<{ PayRuns?: XeroPayRun[] }>(auth, `/PayRuns/${payRunId}`);
    const stubs = runData.PayRuns?.[0]?.Payslips ?? [];
    const slips: ProviderPayslip[] = [];
    for (const stub of stubs) {
      const d = await xeroFetch<{ Payslip?: XeroPayslip }>(auth, `/Payslip/${stub.PayslipID}`);
      const s = d.Payslip;
      slips.push({
        payslipId: stub.PayslipID,
        employeeId: stub.EmployeeID,
        employeeName: `${stub.FirstName ?? s?.FirstName ?? ""} ${stub.LastName ?? s?.LastName ?? ""}`.trim(),
        grossCents: dollarsToCents(s?.Wages),
        paygCents: dollarsToCents(s?.Tax),
        superCents: dollarsToCents(s?.Super),
        netCents: dollarsToCents(s?.NetPay),
      });
    }
    return slips;
  },

  async getLeaveBalances(auth) {
    const data = await xeroFetch<{ Employees?: XeroEmployee[] }>(auth, "/Employees");
    const out: ProviderLeaveBalance[] = [];
    for (const e of data.Employees ?? []) {
      const name = `${e.FirstName ?? ""} ${e.LastName ?? ""}`.trim();
      for (const b of e.LeaveBalances ?? []) {
        const label = b.LeaveName ?? "Leave";
        out.push({
          employeeId: e.EmployeeID,
          employeeName: name,
          leaveType: normaliseLeaveType(label),
          leaveTypeName: label,
          balanceHours: String(b.NumberOfUnits ?? 0),
        });
      }
    }
    return out;
  },
};

export { XERO_OAUTH_SCOPES };
