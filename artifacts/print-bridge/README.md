# KoaPOS Print Bridge

A tiny local service that runs on the till and gives the KoaPOS browser tab the one
thing a browser cannot do on its own: **send a document to a named printer with no
print dialog.**

Without it, browsers can only print silently to a USB/serial ESC/POS receipt printer
(via WebUSB/Web Serial). Everything else — A4 job sheets, purchase orders, reports,
LAN printers, and *routing different documents to different printers* — goes through
the operating system's print dialog. The bridge removes that dialog and adds
per-purpose printer routing.

## What it does

| Endpoint | Purpose |
|---|---|
| `GET /v1/health` | Discovery. No auth, no secrets. |
| `POST /v1/pair` | Hands the browser the pairing token, but only while the pairing window is open. |
| `GET /v1/printers` | Lists the printers this machine can see. |
| `POST /v1/print/raw` | Sends raw ESC/POS bytes to a named queue (thermal receipts, dockets, drawer kicks). |
| `POST /v1/print/html` | Renders HTML and prints it silently (A4 sheets, POs, reports). |
| `POST /v1/drawer` | Fires a cash-drawer kick through a named printer. |
| `GET /v1/diagnostics` | Reports which helper binaries were found. |

## Security

* **Loopback only.** The bridge binds `127.0.0.1`, so nothing on the LAN — or the
  internet — can reach it.
* **Origin allow-list.** Only the KoaPOS origins listed in the config may call it.
* **Bearer token.** Every print endpoint needs the pairing token.
* **Pairing window.** The token is only handed out while a local operator has opened
  the pairing window — automatically for 10 minutes at startup, or by pressing `p` in
  the bridge window. A malicious site cannot pair itself.

Browsers treat `http://127.0.0.1` as a *trustworthy origin*, so an HTTPS KoaPOS page
can call the bridge without a mixed-content block. Chrome and Edge are supported;
Safari blocks loopback requests from HTTPS pages.

## Install (Windows till)

1. Install [Node.js 20+](https://nodejs.org) (LTS).
2. Copy the built `dist/` folder to the till, e.g. `C:\Program Files\KoaPOS\print-bridge\`.
3. For **silent A4 printing**, install one PDF helper:
   * [SumatraPDF](https://www.sumatrapdfreader.org) (recommended, free), or
   * `PDFtoPrinter.exe` dropped in `C:\Program Files\KoaPOS\`.

   Receipts and 80 mm dockets print as raw ESC/POS and need **no** helper.
   Microsoft Edge (preinstalled on Windows 10/11) handles the HTML→PDF step.
4. Start it:

   ```
   node "C:\Program Files\KoaPOS\print-bridge\index.mjs"
   ```

5. In KoaPOS: **Settings › Registers › Hardware › Print Bridge → Pair this device**.

### Network / shared printers (label printers especially)

The bridge prints to a printer by its **Windows queue name**, not by IP. A printer
on the LAN therefore works — Windows does the networking — but *how* it is installed
decides whether the bridge can see it:

| How the printer is installed | Visible to the bridge? |
|---|---|
| USB / locally attached | Always (machine-wide) |
| TCP/IP or WSD port on this PC | Always (machine-wide) |
| Shared from another PC (`\\PC\Printer`) | **Only when the bridge runs as the logged-in user** |

A connection to a printer shared from another PC is stored per-user, so a bridge
running as a Windows service (`SYSTEM`) cannot see it, and it simply won't appear in
`node index.mjs printers` or in KoaPOS. For a shared label printer, pick one:

* **Install it machine-wide** — add it locally on a *Standard TCP/IP Port* pointing at
  the printer or print-server address, rather than browsing to `\\PC\Printer`. Then a
  service install works. This is the recommended setup.
* **Or run the bridge from the Startup folder** as the operator's login, not as a service.

`GET /v1/health` reports `runningAsService`, and KoaPOS shows a warning in
Settings › Registers › Hardware when the bridge is running as `SYSTEM`, so this is
visible rather than a silent missing printer.

### Run it at login

Create a shortcut to the command above in:

```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
```

Set the shortcut to **Run: Minimized** so it sits out of the way. To run it as a
proper Windows service instead, wrap it with [NSSM](https://nssm.cc):

```
nssm install KoaPOSPrintBridge "C:\Program Files\nodejs\node.exe" "C:\Program Files\KoaPOS\print-bridge\index.mjs"
nssm start KoaPOSPrintBridge
```

Note that a service has no console, so pair the browser **before** installing it as a
service (or read the token with `node index.mjs token`).

## Commands

```
node index.mjs             start the bridge
node index.mjs pair        start with a 30-minute pairing window
node index.mjs token       print the pairing token
node index.mjs printers    list this machine's printers
node index.mjs rotate      issue a new token (unpairs every browser)
node index.mjs config      show the config file path
```

While running: `p` reopens pairing, `t` shows the token, `q` quits.

## Configuration

`%APPDATA%\KoaPOS\print-bridge.json` on Windows
(`~/Library/Application Support/KoaPOS/` on macOS, `~/.config/koapos/` on Linux):

```jsonc
{
  "port": 17777,
  "token": "…",                       // pairing secret; `rotate` replaces it
  "allowedOrigins": [                 // one leading "*." wildcard is supported
    "https://*.replit.app",
    "https://*.koapos.com"
  ],
  "chromePath": "",                   // blank = auto-detect Edge/Chrome
  "pdfPrinterPath": "",               // blank = auto-detect SumatraPDF/PDFtoPrinter
  "debug": false
}
```

Environment overrides: `KOAPOS_BRIDGE_PORT`, `KOAPOS_BRIDGE_CHROME`,
`KOAPOS_BRIDGE_PDF_PRINTER`, `KOAPOS_BRIDGE_DEBUG=1`.

**Add your production origin** to `allowedOrigins` and restart the bridge — the
defaults cover `*.replit.app`, `*.replit.dev` and `*.koapos.com` only.

## How each document type prints

| Document | Path | Helper needed |
|---|---|---|
| Receipt / refund (80 mm) | raw ESC/POS | none |
| Service docket (80 mm) | raw ESC/POS | none |
| Cash-drawer kick | raw ESC/POS | none |
| Service job sheet (A4) | HTML → PDF → queue | Edge/Chrome + SumatraPDF |
| Purchase orders, reports | HTML → PDF → queue | Edge/Chrome + SumatraPDF |
| Labels / stickers (DYMO) | HTML → PDF → queue | Edge/Chrome + SumatraPDF |

Label printers don't speak ESC/POS, so labels always take the HTML path even on a
USB printer. The label markup declares its own exact die-cut size in `@page`
(e.g. `size: 54mm 101mm`), and the bridge passes that through untouched by sending
`paper: "auto"` — so labels come out at true size with no scaling.

## Paper sizes

`POST /v1/print/html` takes a `paper` of `A4`, `A4-landscape`, `A5`, `Letter`, `80mm`,
`58mm`, or `auto` (leave whatever the document declares).

Chrome's `--print-to-pdf` honours named page sizes and explicit two-value
dimensions, but **not** `size: <width> auto` — given `auto` it silently falls back
to US Letter. A thermal roll therefore needs an explicit page length: pass
`heightMm` with the document's measured height, or the bridge uses a 200 mm
default. This only affects the HTML path; raw ESC/POS has no page concept and
feeds exactly as much paper as the content needs, which is why dockets and
receipts go out that way.

## Troubleshooting

**"This browser is not paired"** — press `p` in the bridge window, then Pair again in
KoaPOS.

**"Origin … is not allowed"** — add the KoaPOS URL to `allowedOrigins` and restart.

**"Printer … not found"** — run `node index.mjs printers` to see the exact queue names
Windows reports, then pick that name in KoaPOS Hardware settings.

**"Silent PDF printing needs a helper"** — install SumatraPDF, or set `pdfPrinterPath`
to your own tool. Raw ESC/POS printing is unaffected.

**A shared network printer is missing from the list** — see *Network / shared
printers* above. Almost always a service install (`SYSTEM`) plus a printer connected
under a user login. Reinstall it on a TCP/IP port, or run the bridge at login.

**`Failed to execute 'open' on 'USBDevice'. Access denied.`** — this is the browser's
WebUSB path, not the bridge. The printer already has a Windows driver bound to it
(usbprint.sys, installed with the print queue), and Chrome can't take it over: a
printer can be driven by WebUSB *or* be installed as a Windows printer, not both.
Set that printer's connection to **Print Bridge** in Hardware settings — the bridge
prints raw ESC/POS through the Windows queue, so the driver stays where it is and
nothing needs replacing.

**Nothing happens on an 80 mm queue** — the Windows driver must be the printer's own
ESC/POS driver (or a generic "Generic / Text Only" queue). Raw bytes bypass driver
rendering entirely, so a driver that expects graphics will discard them.
