import type {
  PayrollProvider,
  PayrollAuth,
  ProviderEmployee,
  ProviderPayRun,
  ProviderPayslip,
  ProviderLeaveBalance,
  TimesheetLine,
  CreatePayRunArgs,
} from "./types";

/**
 * MYOB adapter (AccountRight cloud company files).
 *
 * MYOB's API exposes employees, timesheets and leave entitlements, which this
 * adapter implements. It does NOT expose pay-run *creation/posting* — pay runs
 * are processed inside MYOB — so those methods throw a descriptive error that
 * the route surfaces to the merchant. listEmployees / pushTimesheets /
 * getLeaveBalances are the supported surface for v1.
 *
 * Calls go to the company-file URI carried in `auth.tenantId`, with the OAuth
 * client id sent as the `x-myobapi-key` header (`auth.apiKey`). Cloud files
 * also require an `x-myobapi-cftoken` (base64 of the file's username:password);
 * supply it via the MYOB_CF_TOKEN env var when the file is credentialed.
 */

class MyobUnsupportedError extends Error {
  constructor(feature: string) {
    super(`${feature} is processed inside MYOB and is not available via the MYOB API`);
    this.name = "MyobUnsupportedError";
  }
}

function myobHeaders(auth: PayrollAuth): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.accessToken}`,
    "x-myobapi-key": auth.apiKey ?? "",
    "x-myobapi-version": "v2",
    "x-myobapi-cftoken": process.env.MYOB_CF_TOKEN ?? "",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function myobFetch<T>(auth: PayrollAuth, path: string, init?: RequestInit): Promise<T> {
  // tenantId is the absolute company-file URI; path is appended.
  const url = `${auth.tenantId.replace(/\/$/, "")}${path}`;
  const r = await fetch(url, { ...init, headers: { ...myobHeaders(auth), ...(init?.headers ?? {}) } });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`MYOB API ${r.status}: ${body.slice(0, 300)}`);
  }
  return (await r.json()) as T;
}

function leaveTypeFromName(name: string): ProviderLeaveBalance["leaveType"] {
  const n = name.toLowerCase();
  if (n.includes("annual") || n.includes("holiday")) return "annual";
  if (n.includes("personal") || n.includes("sick") || n.includes("carer")) return "personal";
  if (n.includes("long service")) return "long_service";
  return "other";
}

interface MyobEmployee {
  UID: string;
  FirstName?: string;
  LastName?: string;
  Addresses?: Array<{ Email?: string }>;
}
interface MyobPayrollDetails {
  Employee?: { UID: string; Name?: string };
  LeaveDetails?: Array<{ PayrollCategory?: { Name?: string }; CarryOver?: number; AccruedHours?: number }>;
}

export const myobPayrollAdapter: PayrollProvider = {
  key: "myob_payroll",

  async listEmployees(auth) {
    const data = await myobFetch<{ Items?: MyobEmployee[] }>(auth, "/Contact/Employee");
    return (data.Items ?? []).map<ProviderEmployee>((e) => ({
      employeeId: e.UID,
      firstName: e.FirstName ?? "",
      lastName: e.LastName ?? "",
      email: e.Addresses?.[0]?.Email,
    }));
  },

  async pushTimesheets(auth, lines: TimesheetLine[]) {
    if (lines.length === 0) return { pushed: 0 };
    const byEmployee = new Map<string, TimesheetLine[]>();
    for (const l of lines) {
      const bucket = byEmployee.get(l.employeeId) ?? [];
      bucket.push(l);
      byEmployee.set(l.employeeId, bucket);
    }
    let pushed = 0;
    for (const [employeeId, ls] of byEmployee) {
      const dates = ls.map((l) => l.date).sort();
      await myobFetch(auth, "/Payroll/Timesheet", {
        method: "POST",
        body: JSON.stringify({
          Employee: { UID: employeeId },
          StartDate: dates[0],
          EndDate: dates[dates.length - 1],
          Lines: ls.map((l) => ({ Date: l.date, Hours: l.hours })),
        }),
      });
      pushed++;
    }
    return { pushed };
  },

  async getLeaveBalances(auth) {
    const data = await myobFetch<{ Items?: MyobPayrollDetails[] }>(auth, "/Contact/EmployeePayrollDetails");
    const out: ProviderLeaveBalance[] = [];
    for (const d of data.Items ?? []) {
      const name = d.Employee?.Name ?? "";
      for (const ld of d.LeaveDetails ?? []) {
        const label = ld.PayrollCategory?.Name ?? "Leave";
        out.push({
          employeeId: d.Employee?.UID ?? "",
          employeeName: name,
          leaveType: leaveTypeFromName(label),
          leaveTypeName: label,
          balanceHours: String(ld.CarryOver ?? 0),
          accruedHours: ld.AccruedHours != null ? String(ld.AccruedHours) : undefined,
        });
      }
    }
    return out;
  },

  // Pay runs are processed inside MYOB; the API does not expose create/post/payslips.
  async createPayRun(_auth: PayrollAuth, _args: CreatePayRunArgs): Promise<ProviderPayRun> {
    throw new MyobUnsupportedError("Creating a pay run");
  },
  async getPayRun(): Promise<ProviderPayRun | null> {
    return null;
  },
  async postPayRun(): Promise<ProviderPayRun> {
    throw new MyobUnsupportedError("Posting a pay run");
  },
  async getPayslips(): Promise<ProviderPayslip[]> {
    return [];
  },
};
