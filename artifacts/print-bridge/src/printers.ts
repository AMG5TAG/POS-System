/* ─── OS printer discovery ────────────────────────────────────────────────────
 * Windows uses the Win32_Printer WMI class (present on every Windows build,
 * unlike the PrintManagement module's Get-Printer). POSIX shells out to CUPS.
 */
import { isWindows, run } from "./exec.js";

export interface OsPrinter {
  name: string;
  isDefault: boolean;
  /**
   * A queue that reaches the printer over the network — either a printer shared
   * from another PC or one on a TCP/IP port. Surfaced because a shared queue
   * connected under a user's login is invisible when the bridge runs as a
   * Windows service; see `isRunningAsSystem`.
   */
  isNetwork: boolean;
  /** Free-text driver/queue status, when the platform reports one. */
  status?: string;
}

const WMI_QUERY =
  "Get-CimInstance Win32_Printer | Select-Object Name,Default,Network,WorkOffline,PrinterStatus,PortName | ConvertTo-Json -Compress";

interface WmiPrinter {
  Name?: string;
  Default?: boolean;
  Network?: boolean;
  WorkOffline?: boolean;
  PrinterStatus?: number;
  PortName?: string;
}

/** Win32_Printer.PrinterStatus enumeration (subset that matters to a till). */
const WMI_STATUS: Record<number, string> = {
  1: "Other", 2: "Unknown", 3: "Idle", 4: "Printing", 5: "Warming up",
  6: "Stopped", 7: "Offline",
};

async function listWindows(): Promise<OsPrinter[]> {
  const { stdout } = await run(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", WMI_QUERY],
    { timeoutMs: 30_000 },
  );
  const text = stdout.trim();
  if (!text) return [];
  const parsed = JSON.parse(text) as WmiPrinter | WmiPrinter[];
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .filter((r) => typeof r.Name === "string" && r.Name.length > 0)
    .map((r) => ({
      name: r.Name as string,
      isDefault: r.Default === true,
      // `Network` covers printers shared from another PC. A queue on a raw
      // TCP/IP port is local to Windows but still reaches the device over the
      // LAN, so treat those as network too — it's what the operator means.
      isNetwork: r.Network === true || /^(IP_|WSD-|\\\\)/i.test(r.PortName ?? ""),
      status: r.WorkOffline ? "Offline" : WMI_STATUS[r.PrinterStatus ?? 2] ?? "Unknown",
    }));
}

async function listCups(): Promise<OsPrinter[]> {
  const [names, def] = await Promise.all([
    run("lpstat", ["-e"], { timeoutMs: 15_000 }).then((r) => r.stdout).catch(() => ""),
    run("lpstat", ["-d"], { timeoutMs: 15_000 }).then((r) => r.stdout).catch(() => ""),
  ]);
  const defaultName = /:\s*(\S+)/.exec(def)?.[1] ?? "";
  return names
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    // CUPS doesn't distinguish local from network queues in `lpstat -e`, and the
    // service-account caveat this flags is Windows-only, so report false.
    .map((name) => ({ name, isDefault: name === defaultName, isNetwork: false }));
}

/**
 * True when the bridge is running as the Windows SYSTEM account — i.e. installed
 * as a service. That matters for LAN printing: printers *shared from another PC*
 * are per-user connections stored in HKCU, so SYSTEM cannot see them and they
 * never appear in `listPrinters`. Printers on a TCP/IP port are installed
 * machine-wide and work fine either way.
 */
let systemAccountCache: boolean | null = null;

export async function isRunningAsSystem(): Promise<boolean> {
  if (systemAccountCache !== null) return systemAccountCache;
  if (!isWindows) {
    systemAccountCache = false;
    return false;
  }
  try {
    const { stdout } = await run("whoami", [], { timeoutMs: 10_000 });
    systemAccountCache = stdout.trim().toLowerCase() === "nt authority\\system";
  } catch {
    systemAccountCache = false;
  }
  return systemAccountCache;
}

export async function listPrinters(): Promise<OsPrinter[]> {
  const printers = isWindows ? await listWindows() : await listCups();
  // Stable, human-friendly ordering: default first, then alphabetical.
  return printers.sort((a, b) =>
    a.isDefault === b.isDefault ? a.name.localeCompare(b.name) : a.isDefault ? -1 : 1,
  );
}

/** Resolve "" / undefined to the OS default queue. Throws if there isn't one. */
export async function resolvePrinterName(requested: string | undefined): Promise<string> {
  const wanted = (requested ?? "").trim();
  const printers = await listPrinters();
  if (wanted) {
    const hit = printers.find((p) => p.name.toLowerCase() === wanted.toLowerCase());
    if (!hit) {
      throw new Error(
        `Printer "${wanted}" not found on this machine. Available: ${printers.map((p) => p.name).join(", ") || "(none)"}`,
      );
    }
    return hit.name;
  }
  const fallback = printers.find((p) => p.isDefault) ?? printers[0];
  if (!fallback) throw new Error("No printers are installed on this machine.");
  return fallback.name;
}
