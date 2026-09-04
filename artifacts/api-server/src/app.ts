import express, { type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler } from "./middlewares/errorHandler";
import { publicOrigin } from "./lib/publicUrl";
import { SHORT_DOMAIN } from "@workspace/shortlinks-shared";

const PgSession = connectPgSimple(session);

const app: Express = express();

app.set("trust proxy", 1);

// Security headers. CSP is disabled here because this is a JSON/redirect API —
// the SPA is served (and sets its own CSP) elsewhere, and a restrictive default
// CSP would risk breaking HTML/redirect responses. CORP is set to cross-origin
// so the SPA (a different origin, behind the proxy) can load API-served
// resources like generated PDFs and QR images.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !process.env.SESSION_SECRET) {
  // Fail fast: the hardcoded fallback secret is public (it's in the repo), so
  // running production with it would let anyone forge session cookies and
  // impersonate any merchant. Mirror the VAULT_ENCRYPTION_KEY boot guard.
  throw new Error(
    "Fatal: SESSION_SECRET environment variable is required in production mode.",
  );
}
if (isProduction && !process.env.UNSUBSCRIBE_SECRET) {
  logger.warn("UNSUBSCRIBE_SECRET env var is not set — unsubscribe tokens fall back to SESSION_SECRET or an insecure default. Set a strong random value in production.");
}

const allowedOrigins: Set<string> = new Set();
if (isProduction) {
  // The app's public origin (koapos.com.au, or APP_BASE_URL/PUBLIC_DOMAIN override).
  allowedOrigins.add(publicOrigin());
  // The branded short-link domain serves the SPA, which calls the API
  // cross-origin to resolve a slug → destination before redirecting.
  allowedOrigins.add(`https://${SHORT_DOMAIN}`);
  // The internal hosting domain, so same-host requests keep working post-deploy.
  if (process.env.REPLIT_DOMAINS) {
    for (const domain of process.env.REPLIT_DOMAINS.split(",")) {
      const d = domain.trim();
      if (d) allowedOrigins.add(`https://${d}`);
    }
  }
}

app.use(
  cors({
    origin: isProduction
      ? (origin, callback) => {
          if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
          } else {
            callback(new Error("Not allowed by CORS"));
          }
        }
      : true,
    credentials: true,
  })
);

app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      ttl: 7 * 24 * 60 * 60, // 7 days in seconds
    }),
    secret: process.env.SESSION_SECRET ?? "koapos-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// Capture the raw request body so webhook handlers (e.g. Zip Pay) can verify
// provider HMAC signatures over the exact bytes received.
app.use(express.json({
  limit: "10mb",
  verify: (req, _res, buf) => { (req as express.Request & { rawBody?: string }).rawBody = buf.toString("utf8"); },
}));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

/* ── The built SPA ────────────────────────────────────────────────────────────
 *
 * In production this one process serves both halves of the app: the API under
 * `/api` and the React bundle at everything else. That is not a convenience —
 * the frontend calls the API on *relative* paths (`custom-fetch.ts` sets no base
 * URL), so the two have to answer on the same origin or every request is
 * cross-origin and the session cookie stops flowing.
 *
 * Mounted after the API router so `/api/whatever` can still 404 as JSON rather
 * than being answered with index.html, and before the error handler so that
 * stays last.
 *
 * Registered only when a build is actually present. In development the SPA is
 * served by Vite on its own port, and the test suite imports this module with no
 * frontend build on disk — in both cases the block is skipped and the server
 * behaves exactly as it did before.
 */
const spaDir =
  process.env.SPA_DIST_DIR?.trim() ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../koapos/dist/public");
const spaIndex = path.join(spaDir, "index.html");

if (existsSync(spaIndex)) {
  logger.info({ spaDir }, "Serving built frontend");

  /* Vite fingerprints everything under /assets, so those filenames change
     whenever their content does and can be cached permanently. The rest of the
     build root (icons, manifest, robots.txt, logo) keeps its name across
     deploys, so it only gets a short cache — a year-long one would strand a
     merchant's replaced logo in every till's browser. */
  app.use("/assets", express.static(path.join(spaDir, "assets"), {
    immutable: true,
    maxAge: "1y",
  }));

  app.use(express.static(spaDir, {
    index: false,
    maxAge: "1h",
    setHeaders: (res, filePath) => {
      // index.html names the hashed bundles, so caching it is what would pin a
      // till to the previous deploy.
      if (filePath === spaIndex) res.setHeader("Cache-Control", "no-cache");
    },
  }));

  // Client-side routing: any GET the static handlers didn't answer is a deep
  // link into the SPA (/pos/sell, /app/customers …) and gets index.html. Non-GET
  // verbs fall through to the 404/error handler — a stray POST is a bug, not a
  // route.
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(spaIndex, { headers: { "Cache-Control": "no-cache" } }, (err) => {
      if (err) next(err);
    });
  });
} else {
  logger.info({ spaDir }, "No frontend build found — serving API only");
}

app.use(errorHandler);

export default app;
