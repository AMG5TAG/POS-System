import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { publicOrigin } from "./lib/publicUrl";

const PgSession = connectPgSimple(session);

const app: Express = express();

app.set("trust proxy", 1);

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

export default app;
