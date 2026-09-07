import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

/** An error as it reaches the terminal handler: an Express/body-parser error
 *  carries a status and a `type`; a pg error carries `code`/`constraint`, which
 *  is what actually identifies a bad insert in the logs. */
type HandledError = Error & {
  status?: number;
  statusCode?: number;
  code?: string;
  constraint?: string;
  type?: string;
};

/**
 * Terminal error handler.
 *
 * Without one, Express 5 answers a thrown or rejected route with an HTML error
 * page. The SPA's fetch layer parses JSON, so every server-side failure reached
 * the operator as a bare "HTTP 500" — a failed book-in looked identical whether
 * the photos blew the request-size limit or an insert hit a constraint.
 *
 * So: log every 5xx in full (including the pg `code`/`constraint`), and answer
 * with JSON the client can display. The message itself is only sent outside
 * production; in production the client gets the request id to quote instead, so
 * internal detail stays in the logs.
 */
export function errorHandler(
  err: HandledError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = err.status ?? err.statusCode ?? 500;
  const requestId = String((req as Request & { id?: string | number }).id ?? "");

  if (status >= 500) {
    logger.error(
      {
        err,
        code: err.code,
        constraint: err.constraint,
        method: req.method,
        url: req.url.split("?")[0],
        requestId,
      },
      "Unhandled error",
    );
  }

  // A response already streamed (a PDF, a redirect) can't be turned into JSON.
  if (res.headersSent) return;

  // express.json() rejects an oversized body with a 413 well before any route
  // runs; name the limit so the caller knows what to fix.
  if (err.type === "entity.too.large") {
    res.status(413).json({ error: "Request body is too large (limit 10 MB).", requestId });
    return;
  }

  const isProduction = process.env.NODE_ENV === "production";
  res.status(status).json({
    error: isProduction && status >= 500 ? "Internal server error" : err.message,
    requestId,
  });
}
