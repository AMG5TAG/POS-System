/* Small promise wrapper around child_process.execFile with a hard timeout, so a
 * wedged PowerShell or Chromium can never hang a print request forever. */
import { execFile } from "node:child_process";

export interface RunResult { stdout: string; stderr: string }

export function run(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      {
        timeout: opts.timeoutMs ?? 60_000,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, ...opts.env },
      },
      (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr || stdout || err.message).toString().trim();
          reject(new Error(detail.slice(0, 2000) || err.message));
          return;
        }
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      },
    );
  });
}

export const isWindows = process.platform === "win32";
