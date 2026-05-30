import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { db, serviceJobsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

/**
 * POST /api/signatures/save
 *
 * Accepts a base64 PNG signature and optionally associates it with a
 * service job.  Returns a simulated file path / ID for the client to
 * reference.
 *
 * Body:
 *   { signature: string (data-url), jobId?: number }
 */
router.post("/signatures/save", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const merchantId = req.session.merchantId!;

  if (typeof body.signature !== "string" || !body.signature.startsWith("data:image/")) {
    res.status(400).json({ error: "Invalid signature — must be a base64 image data URL" });
    return;
  }

  const signatureDataUrl: string = body.signature;
  const jobId = body.jobId != null ? Number(body.jobId) : null;

  req.log.info(
    { merchantId, jobId, signatureBytes: signatureDataUrl.length },
    "Signature received"
  );

  if (jobId && !isNaN(jobId)) {
    const [updated] = await db
      .update(serviceJobsTable)
      .set({ signature: signatureDataUrl })
      .where(
        and(
          eq(serviceJobsTable.id, jobId),
          eq(serviceJobsTable.merchantId, merchantId)
        )
      )
      .returning({ id: serviceJobsTable.id });

    if (!updated) {
      res.status(404).json({ error: "Service job not found" });
      return;
    }

    res.json({
      success: true,
      savedTo: `service-jobs/${jobId}/signature`,
      jobId,
    });
    return;
  }

  const simulatedId = `sig_${merchantId}_${Date.now()}`;
  res.json({
    success: true,
    savedTo: `signatures/${simulatedId}.png`,
    id: simulatedId,
  });
});

export default router;
