/* ─── KoaPOS Print Bridge ─────────────────────────────────────────────────────
 * Runs on the till. Gives the KoaPOS browser tab the one thing a browser can't
 * do on its own: send a document to a *named* printer with no print dialog.
 *
 *   koapos-print-bridge          start the bridge (default)
 *   koapos-print-bridge token    print the pairing token and exit
 *   koapos-print-bridge pair     start with a 30-minute pairing window
 *   koapos-print-bridge printers list the printers this machine can see
 *   koapos-print-bridge rotate   issue a new token (unpairs every browser)
 *   koapos-print-bridge config   show the config file path
 */
import { BRIDGE_VERSION, configPath, loadConfig, rotateToken, type BridgeConfig } from "./config.js";
import { isRunningAsSystem, listPrinters } from "./printers.js";
import { createBridgeServer, createPairingWindow } from "./server.js";
import { findChrome, findPdfPrinter } from "./render.js";

const STARTUP_PAIR_WINDOW_MS = 10 * 60 * 1000;
const MANUAL_PAIR_WINDOW_MS = 30 * 60 * 1000;
/** Raw-mode stdin delivers Ctrl-C as ETX rather than raising SIGINT. */
const CTRL_C = "\u0003";

async function main(): Promise<void> {
  const command = (process.argv[2] ?? "start").toLowerCase();
  let cfg = loadConfig();

  switch (command) {
    case "token":
      console.log(cfg.token);
      return;
    case "config":
      console.log(configPath());
      return;
    case "rotate":
      cfg = rotateToken(cfg);
      console.log(`New pairing token: ${cfg.token}`);
      console.log("Every previously paired browser must pair again.");
      return;
    case "printers": {
      const printers = await listPrinters();
      if (!printers.length) {
        console.log("No printers found.");
        return;
      }
      for (const p of printers) {
        const tags = [p.isNetwork ? "network" : "", p.status ?? ""].filter(Boolean).join(", ");
        console.log(`${p.isDefault ? "*" : " "} ${p.name}${tags ? `  (${tags})` : ""}`);
      }
      if (await isRunningAsSystem()) {
        console.log("\nRunning as SYSTEM: printers shared from another PC are not listed.");
      }
      return;
    }
    case "start":
    case "pair":
      break;
    default:
      console.error(`Unknown command "${command}". Try: start | pair | token | printers | rotate | config`);
      process.exitCode = 1;
      return;
  }

  const pairing = createPairingWindow();
  pairing.open(command === "pair" ? MANUAL_PAIR_WINDOW_MS : STARTUP_PAIR_WINDOW_MS);

  const server = createBridgeServer(() => cfg, pairing);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\nPort ${cfg.port} is already in use — the bridge may already be running.`);
      console.error(`Change "port" in ${configPath()} if you need a different one.\n`);
    } else {
      console.error("Print bridge failed:", err.message);
    }
    process.exit(1);
  });

  // Loopback only: nothing on the LAN can reach the bridge.
  server.listen(cfg.port, "127.0.0.1", () => {
    banner(cfg, pairing.isOpen());
  });

  // Pressing "p" reopens the pairing window so a new till browser can be paired
  // without restarting (and without the token ever going over the network
  // unprompted). Only available when a real terminal is attached.
  if (process.stdin.isTTY) {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (key: string) => {
      if (key === CTRL_C || key.toLowerCase() === "q") {
        console.log("\nStopping print bridge...");
        process.exit(0);
      }
      if (key.toLowerCase() === "p") {
        pairing.open(MANUAL_PAIR_WINDOW_MS);
        console.log(`\nPairing window open for ${MANUAL_PAIR_WINDOW_MS / 60000} minutes.`);
        console.log("In KoaPOS: Settings > Registers > Hardware > Print Bridge -> Pair.\n");
      }
      if (key.toLowerCase() === "t") console.log(`\nPairing token: ${cfg.token}\n`);
    });
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
    });
  }
}

function banner(cfg: BridgeConfig, pairingOpen: boolean): void {
  const chrome = findChrome(cfg);
  const pdfTool = findPdfPrinter(cfg);
  console.log("");
  console.log(`  KoaPOS Print Bridge v${BRIDGE_VERSION}`);
  console.log(`  Listening on http://127.0.0.1:${cfg.port} (this machine only)`);
  console.log(`  Config:       ${configPath()}`);
  console.log(`  HTML render:  ${chrome || "NOT FOUND - install Microsoft Edge or Chrome for A4 printing"}`);
  if (process.platform === "win32") {
    console.log(`  PDF printer:  ${pdfTool || "NOT FOUND - install SumatraPDF for silent A4 printing"}`);
  }
  console.log("");
  if (pairingOpen) {
    console.log("  Pairing is OPEN. In KoaPOS go to");
    console.log("    Settings > Registers > Hardware > Print Bridge -> Pair this device");
  } else {
    console.log('  Pairing is closed. Press "p" to reopen it.');
  }
  console.log("  Keys: p = open pairing | t = show token | q = quit");
  console.log("");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
