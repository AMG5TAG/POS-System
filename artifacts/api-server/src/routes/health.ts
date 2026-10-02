import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { htmlToPdf, resolveChromiumExecutable } from "../services/htmlToPdf";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * Staff-only diagnostic (it launches Chromium per call, so left public it was a
 * one-URL way to exhaust the server): confirms whether this runtime can render PDFs via Chromium
 * (the template-faithful invoice path) or would fall back to the legacy pdfkit
 * layout. No secrets are returned — just a boolean + render size. Hit
 * `/api/health/pdf` on a deployment to confirm invoices use the template path.
 */
router.get("/health/pdf", requireAuth, async (_req, res) => {
  const chromiumFound = Boolean(resolveChromiumExecutable());
  try {
    const pdf = await htmlToPdf("<html><body>pdf health</body></html>");
    res.json({ ok: true, renderer: "chromium", chromiumFound, bytes: pdf.length });
  } catch (e) {
    res.json({
      ok: false,
      renderer: "legacy-fallback",
      chromiumFound,
      error: e instanceof Error ? e.message.split("\n")[0] : String(e),
    });
  }
});

export default router;
