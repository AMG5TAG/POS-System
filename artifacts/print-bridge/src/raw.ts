/* ─── Raw byte printing ───────────────────────────────────────────────────────
 * Sends ESC/POS command bytes to a *named* OS print queue with no dialog and no
 * driver rendering — the whole point of the bridge, and the piece a browser
 * cannot do on its own.
 *
 * Windows: a generated PowerShell script P/Invokes the winspool.drv spooler API
 * (OpenPrinter → StartDocPrinter with datatype "RAW" → WritePrinter). This is the
 * documented way to push raw data through a Windows queue and needs nothing
 * installed — PowerShell 5.1 ships with Windows 10/11.
 * POSIX: CUPS `lp -o raw`.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isWindows, run } from "./exec.js";

/** PowerShell + C# shim. Arguments arrive via env vars so nothing needs quoting. */
const RAW_PRINT_PS1 = String.raw`
$ErrorActionPreference = "Stop"
$src = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class KoaRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOW {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static void SendFile(string printerName, string filePath, string docName) {
    byte[] bytes = File.ReadAllBytes(filePath);
    IntPtr hPrinter = IntPtr.Zero;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
      throw new Exception("OpenPrinter failed (" + Marshal.GetLastWin32Error() + ") for '" + printerName + "'");
    try {
      DOCINFOW di = new DOCINFOW();
      di.pDocName = docName;
      di.pDataType = "RAW";
      if (!StartDocPrinter(hPrinter, 1, di))
        throw new Exception("StartDocPrinter failed (" + Marshal.GetLastWin32Error() + ")");
      try {
        if (!StartPagePrinter(hPrinter))
          throw new Exception("StartPagePrinter failed (" + Marshal.GetLastWin32Error() + ")");
        IntPtr buf = Marshal.AllocCoTaskMem(bytes.Length);
        try {
          Marshal.Copy(bytes, 0, buf, bytes.Length);
          int written = 0;
          if (!WritePrinter(hPrinter, buf, bytes.Length, out written))
            throw new Exception("WritePrinter failed (" + Marshal.GetLastWin32Error() + ")");
          if (written != bytes.Length)
            throw new Exception("Short write: " + written + " of " + bytes.Length + " bytes");
        } finally {
          Marshal.FreeCoTaskMem(buf);
        }
        EndPagePrinter(hPrinter);
      } finally {
        EndDocPrinter(hPrinter);
      }
    } finally {
      ClosePrinter(hPrinter);
    }
  }
}
"@

if (-not ("KoaRawPrint" -as [type])) { Add-Type -TypeDefinition $src -Language CSharp }
[KoaRawPrint]::SendFile($env:KOA_PRINTER, $env:KOA_FILE, $env:KOA_DOC)
Write-Output "ok"
`;

let cachedScriptPath: string | null = null;

function rawPrintScript(): string {
  if (cachedScriptPath) return cachedScriptPath;
  const dir = mkdtempSync(path.join(os.tmpdir(), "koapos-bridge-"));
  const file = path.join(dir, "raw-print.ps1");
  // BOM keeps PowerShell from mis-reading the C# block on legacy code pages.
  writeFileSync(file, `﻿${RAW_PRINT_PS1}`, "utf8");
  cachedScriptPath = file;
  return file;
}

/** Write `data` to a scratch file and push it through the named queue verbatim. */
export async function printRaw(printerName: string, data: Buffer, jobName: string): Promise<void> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "koapos-raw-"));
  const file = path.join(dir, "job.bin");
  writeFileSync(file, data);

  if (isWindows) {
    await run(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", rawPrintScript()],
      {
        timeoutMs: 60_000,
        env: { KOA_PRINTER: printerName, KOA_FILE: file, KOA_DOC: jobName },
      },
    );
    return;
  }
  await run("lp", ["-d", printerName, "-o", "raw", "-t", jobName, file], { timeoutMs: 60_000 });
}
