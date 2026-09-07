{ pkgs }: {
  # Provide a Nix-wired Chromium so headless PDF rendering (invoice/quote
  # templates via Puppeteer) works in the autoscale deployment. A plain
  # `puppeteer install` Chrome fails on Nix (missing shared libs); the Nix
  # package has its dependencies resolved and lands on PATH, where htmlToPdf's
  # resolver finds it via `command -v chromium`.
  deps = [
    pkgs.chromium
  ];
}
