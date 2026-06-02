---
name: esbuild externalized transitive deps
description: Why an externalized native dep can crash at runtime under pnpm even when the build succeeds, and how to fix it.
---

# esbuild externalized native deps must be direct deps under pnpm

The api-server bundles via esbuild (`artifacts/api-server/build.mjs`) with a large
`external: [...]` list of native/unbundleable packages (e.g. `ssh2`, `sharp`,
`bcrypt`, `@aws-sdk/*`). Externalized packages are **not** bundled — they are
`require()`d at runtime relative to `dist/index.mjs`.

**Rule:** any externalized package that your code reaches must be resolvable from
the artifact's own `node_modules`. Under pnpm's strict (symlinked) layout, a
**transitive** dep is NOT resolvable from the artifact root — only its direct
dependents can see it. So if you add a package whose native sub-dependency is in
the external list, you must add that sub-dependency as a **direct** dependency too.

**Why:** `ssh2-sftp-client` pulls in `ssh2` (in the external list). The build
succeeded, but boot crashed with `Cannot find module 'ssh2'` because `ssh2` lived
under `.pnpm/...` and was not linked into `artifacts/api-server/node_modules`. Fix
was `pnpm --filter @workspace/api-server add ssh2`. Direct deps like
`@aws-sdk/client-s3` and `@google-cloud/storage` already resolved fine.

**How to apply:** when adding a dependency, check `build.mjs` `external`. If the
new dep (or any of its transitive deps) appears there, add that exact package as a
direct dependency of the artifact. A clean `pnpm run build` does NOT prove the
server boots — externalized requires only fail at runtime. Always boot the built
`dist/index.mjs` (or restart the workflow) to confirm.
