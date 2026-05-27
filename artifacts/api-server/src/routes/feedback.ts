import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { sendEmail } from "../services/email";

const router: IRouter = Router();

interface Attachment { name: string; data: string; mimeType: string; }

router.post("/feedback", requireAuth, async (req, res) => {
  const merchantId = (req.session as { merchantId?: number }).merchantId!;
  const userEmail  = (req.session as { email?: string }).email ?? "unknown";

  const {
    type,
    title,
    description,
    steps,
    appVersion,
    attachments,
  }: {
    type: string;
    title: string;
    description: string;
    steps?: string;
    appVersion?: string;
    attachments?: Attachment[];
  } = req.body;

  if (!type || !title || !description) {
    res.status(400).json({ error: "type, title, and description are required" });
    return;
  }

  const timestamp = new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" });
  const typeLabel = type === "bug" ? "🐛 Bug Report" : "✨ Feature Request";

  /* ── HTML body ── */
  const stepsSection = type === "bug" && steps
    ? `<tr><td style="padding:10px 0;border-bottom:1px solid #eee"><strong>Steps to Reproduce</strong></td></tr>
       <tr><td style="padding:6px 0 14px;white-space:pre-wrap;color:#374151">${escHtml(steps)}</td></tr>`
    : "";

  const attachSection = attachments && attachments.length > 0
    ? `<tr><td style="padding:10px 0;border-bottom:1px solid #eee"><strong>Attachments</strong></td></tr>
       <tr><td style="padding:6px 0 14px">${attachments.map((a) => `<img src="data:${escHtml(a.mimeType)};base64,${a.data}" alt="${escHtml(a.name)}" style="max-width:100%;border-radius:6px;margin-bottom:8px;display:block"/>`).join("")}</td></tr>`
    : "";

  const html = `
<!DOCTYPE html><html><body style="font-family:sans-serif;color:#111827;margin:0;padding:0;background:#f9fafb">
<div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08)">
  <div style="background:${type === "bug" ? "#dc2626" : "#6366f1"};padding:24px 32px">
    <h1 style="margin:0;color:#fff;font-size:20px">${typeLabel}</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:14px">${escHtml(title)}</p>
  </div>
  <div style="padding:24px 32px">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px;color:#6b7280">
        Submitted by <strong>${escHtml(userEmail)}</strong> &middot; ${timestamp}
        ${appVersion ? `&middot; v${escHtml(appVersion)}` : ""}
      </td></tr>
      <tr><td style="padding:14px 0 4px"><strong>Description</strong></td></tr>
      <tr><td style="padding:4px 0 14px;white-space:pre-wrap;color:#374151;border-bottom:1px solid #eee">${escHtml(description)}</td></tr>
      ${stepsSection}
      ${attachSection}
    </table>
  </div>
  <div style="padding:16px 32px 24px;background:#f9fafb;font-size:12px;color:#9ca3af">
    Sent from KoaPOS Feedback &middot; Merchant ID ${merchantId}
  </div>
</div>
</body></html>`;

  const text = [
    `${typeLabel}: ${title}`,
    `Submitted by: ${userEmail}`,
    `Time: ${timestamp}`,
    appVersion ? `App version: ${appVersion}` : null,
    "",
    "Description:",
    description,
    type === "bug" && steps ? `\nSteps to Reproduce:\n${steps}` : null,
  ].filter((l) => l !== null).join("\n");

  const result = await sendEmail(merchantId, {
    to: "sales@koastal.com.au",
    subject: `[KoaPOS ${type === "bug" ? "Bug" : "Feature"}] ${title}`,
    html,
    text,
  });

  if (!result.success) {
    req.log.warn({ result }, "Feedback email failed");
    res.status(503).json({ error: result.error ?? "Email provider not configured" });
    return;
  }

  res.json({ ok: true });
});

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default router;
