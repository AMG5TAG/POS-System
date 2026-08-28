import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { build as esbuild } from "esbuild";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(artifactDir, "dist");

await rm(distDir, { recursive: true, force: true });

// The bridge runs on merchant hardware, so it bundles to a single dependency-free
// .mjs that `node dist/index.mjs` can run straight from a USB stick.
await esbuild({
  entryPoints: [path.resolve(artifactDir, "src/index.ts")],
  platform: "node",
  target: "node20",
  bundle: true,
  format: "esm",
  outdir: distDir,
  outExtension: { ".js": ".mjs" },
  banner: { js: "#!/usr/bin/env node" },
  sourcemap: "linked",
  logLevel: "info",
});
