import { useState, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/lib/use-auth";
import { cn } from "@/lib/utils";
import {
  Bug, Lightbulb, Upload, X, Send, Loader2, CheckCircle2,
  Paperclip, AlertCircle, MessageSquare,
} from "lucide-react";

const APP_VERSION = "1.0.0";
const MAX_FILE_SIZE_MB = 5;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

interface AttachmentFile { name: string; mimeType: string; data: string; preview: string; }

/* ── File reader helper ─────────────────────────────────────────────────── */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ── Dropzone ───────────────────────────────────────────────────────────── */
function Dropzone({
  files, onAdd, onRemove,
}: { files: AttachmentFile[]; onAdd: (files: AttachmentFile[]) => void; onRemove: (i: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const processFiles = async (fileList: FileList) => {
    const added: AttachmentFile[] = [];
    for (const f of Array.from(fileList)) {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        toast.error(`${f.name}: unsupported type. Use PNG, JPEG, WebP or GIF.`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast.error(`${f.name}: exceeds ${MAX_FILE_SIZE_MB} MB limit.`);
        continue;
      }
      const data    = await readFileAsBase64(f);
      const preview = URL.createObjectURL(f);
      added.push({ name: f.name, mimeType: f.type, data, preview });
    }
    if (added.length) onAdd(added);
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "border-2 border-dashed rounded-xl px-6 py-8 flex flex-col items-center gap-2 cursor-pointer transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files); }}
      >
        <Paperclip className="w-6 h-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          <span className="font-medium text-foreground">Click to attach</span> or drag and drop
        </p>
        <p className="text-xs text-muted-foreground">PNG, JPEG, WebP, GIF — max {MAX_FILE_SIZE_MB} MB each</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) processFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {files.map((f, i) => (
            <div key={i} className="relative group rounded-lg overflow-hidden border bg-muted aspect-video">
              <img src={f.preview} alt={f.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
              <button
                type="button"
                className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onRemove(i)}
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <p className="absolute bottom-0 left-0 right-0 text-[10px] text-white bg-black/50 px-2 py-1 truncate">
                {f.name}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function ManagementFeedbackPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"bug" | "feature">("bug");
  const [title, setTitle]           = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps]           = useState("");
  const [files, setFiles]           = useState<AttachmentFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [noEmail, setNoEmail]       = useState(false);

  const reset = () => {
    setTitle(""); setDescription(""); setSteps(""); setFiles([]);
    setSubmitted(false); setNoEmail(false);
  };

  const handleTabChange = (t: "bug" | "feature") => {
    setTab(t); setSubmitted(false); setNoEmail(false);
  };

  const handleSubmit = async () => {
    if (!title.trim())       { toast.error("Please enter a title."); return; }
    if (!description.trim()) { toast.error("Please enter a description."); return; }

    setSubmitting(true);
    setNoEmail(false);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: tab,
          title: title.trim(),
          description: description.trim(),
          steps: tab === "bug" ? steps.trim() : undefined,
          appVersion: APP_VERSION,
          attachments: files.map(({ name, mimeType, data }) => ({ name, mimeType, data })),
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        toast.success("Feedback submitted — thank you!");
        setFiles([]);
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        if (res.status === 503) {
          setNoEmail(true);
        } else {
          toast.error(body.error ?? "Failed to submit feedback.");
        }
      }
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Success state ── */
  if (submitted) {
    return (
      <AppLayout>
        <div className="w-full px-4 lg:px-6 py-6 flex flex-col items-center justify-center min-h-[60vh] gap-6">
          <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 p-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-center space-y-2 max-w-sm">
            <h2 className="text-xl font-bold">Feedback received</h2>
            <p className="text-muted-foreground text-sm">
              Your {tab === "bug" ? "bug report" : "feature request"} has been sent to the KoaPOS team.
              We'll review it and follow up if needed.
            </p>
          </div>
          <Button variant="outline" onClick={reset}>Submit another</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            Feedback
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Report a bug or suggest a new feature — your feedback goes directly to the KoaPOS team.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* ── Form ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => handleTabChange("bug")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
                  tab === "bug"
                    ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400"
                    : "bg-card border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                <Bug className="w-4 h-4" />
                Bug Report
              </button>
              <button
                onClick={() => handleTabChange("feature")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
                  tab === "feature"
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/30 dark:border-indigo-800 dark:text-indigo-400"
                    : "bg-card border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                <Lightbulb className="w-4 h-4" />
                Feature Request
              </button>
            </div>

            {/* No email warning */}
            {noEmail && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Email provider not configured</p>
                  <p className="mt-0.5 text-amber-600 dark:text-amber-400">
                    To send feedback automatically, configure an email provider in{" "}
                    <a href="/management/email" className="underline font-medium">Management → Email</a>.
                    In the meantime, you can reach us directly at{" "}
                    <a href="mailto:sales@koastal.com.au" className="underline font-medium">sales@koastal.com.au</a>.
                  </p>
                </div>
              </div>
            )}

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="feedback-title">
                {tab === "bug" ? "Bug summary" : "Feature title"}
                <span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input
                id="feedback-title"
                placeholder={tab === "bug" ? "e.g. POS crashes when scanning barcode" : "e.g. Export transactions to CSV"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="feedback-desc">
                {tab === "bug" ? "What happened?" : "Describe the feature"}
                <span className="text-destructive ml-0.5">*</span>
              </Label>
              <Textarea
                id="feedback-desc"
                placeholder={
                  tab === "bug"
                    ? "Describe the issue, what you expected to happen, and what actually happened…"
                    : "Describe the feature, what problem it solves, and how you'd use it…"
                }
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[120px] resize-y"
              />
            </div>

            {/* Steps to reproduce — bugs only */}
            {tab === "bug" && (
              <div className="space-y-1.5">
                <Label htmlFor="feedback-steps">
                  Steps to reproduce
                  <span className="text-muted-foreground text-xs ml-1.5">(optional)</span>
                </Label>
                <Textarea
                  id="feedback-steps"
                  placeholder={"1. Go to POS\n2. Scan item with barcode scanner\n3. App crashes"}
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  className="min-h-[100px] resize-y font-mono text-sm"
                />
              </div>
            )}

            {/* File dropzone */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                {tab === "bug" ? "Screenshots" : "Mockups / attachments"}
                <span className="text-muted-foreground text-xs ml-1">(optional)</span>
              </Label>
              <Dropzone
                files={files}
                onAdd={(added) => setFiles((f) => [...f, ...added])}
                onRemove={(i) => setFiles((f) => f.filter((_, idx) => idx !== i))}
              />
            </div>

            {/* Submit */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="gap-2"
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                  : <><Send className="w-4 h-4" /> Send Feedback</>}
              </Button>
              {(title || description || steps || files.length > 0) && (
                <Button variant="ghost" onClick={reset} disabled={submitting} size="sm">
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* ── Sidebar info ── */}
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="font-semibold text-sm">What happens next?</h3>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="rounded-full bg-primary/10 text-primary text-[10px] font-bold w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">1</span>
                  Your feedback is emailed directly to the KoaPOS team at Koastal.
                </li>
                <li className="flex items-start gap-2">
                  <span className="rounded-full bg-primary/10 text-primary text-[10px] font-bold w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">2</span>
                  Bugs are triaged within 1–2 business days. Critical issues get priority.
                </li>
                <li className="flex items-start gap-2">
                  <span className="rounded-full bg-primary/10 text-primary text-[10px] font-bold w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">3</span>
                  Feature requests are reviewed against the product roadmap.
                </li>
              </ul>
            </div>

            <div className="rounded-xl border bg-card p-5 space-y-2">
              <h3 className="font-semibold text-sm">Submission details</h3>
              <dl className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Submitting as</dt>
                  <dd className="font-medium truncate max-w-[160px]">{(user as { email?: string } | null)?.email ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">App version</dt>
                  <dd><Badge variant="secondary" className="text-[10px] px-1.5 py-0">v{APP_VERSION}</Badge></dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Sends to</dt>
                  <dd className="text-muted-foreground">sales@koastal.com.au</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border bg-blue-50/60 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900 p-4 text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <p className="font-medium">Direct contact</p>
              <p>For urgent issues, email us directly at{" "}
                <a href="mailto:sales@koastal.com.au" className="underline">sales@koastal.com.au</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
