import { useState, useEffect, useCallback } from "react";
import DOMPurify from "dompurify";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Cake, Mail, MessageSquare, Send, RefreshCw, Gift, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface AutomationRule {
  id: number;
  name: string;
  isActive: boolean;
  triggerEvent: string;
  channel: string;
  templateId: string | null;
  templateName: string | null;
  templateSubject: string | null;
  templateBody: string | null;
  birthdayDiscount: string | null;
  birthdayDaysBefore: number | null;
}

const CHANNELS = [
  { value: "email", label: "Email",       icon: Mail },
  { value: "sms",   label: "SMS",         icon: MessageSquare },
  { value: "both",  label: "Email & SMS", icon: Send },
];

const DEFAULT_SUBJECT = "Happy Birthday from {{business_name}}!";
const DEFAULT_BODY = "<p>Happy Birthday, {{first_name}}! 🎂 Thank you for being a valued customer.</p>";

/* ── API ───────────────────────────────────────────────────────────────── */

const BASE = "/api";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function ManagementMarketingBirthdaysPage() {
  const [rule, setRule] = useState<AutomationRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [enabled, setEnabled] = useState(true);
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [discount, setDiscount] = useState("");
  const [daysBefore, setDaysBefore] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rules = await apiFetch<AutomationRule[]>("/marketing-automation");
      const birthday = rules.find((r) => r.triggerEvent === "birthday") ?? null;
      setRule(birthday);
      if (birthday) {
        setEnabled(birthday.isActive);
        setChannel(birthday.channel || "email");
        setSubject(birthday.templateSubject || DEFAULT_SUBJECT);
        setBody(birthday.templateBody || DEFAULT_BODY);
        setDiscount(birthday.birthdayDiscount ?? "");
        setDaysBefore(String(birthday.birthdayDaysBefore ?? 0));
      }
    } catch {
      toast.error("Failed to load birthday settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!subject.trim()) { toast.error("Subject is required"); return; }
    if (!body.trim())    { toast.error("Message body is required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: rule?.name || "Birthday Message",
        triggerEvent: "birthday",
        channel,
        isActive: enabled,
        templateId: null,
        templateName: "Birthday Message",
        templateSubject: subject.trim(),
        templateBody: body.trim(),
        birthdayDiscount: discount.trim() || null,
        birthdayDaysBefore: Number(daysBefore) || 0,
      };
      if (rule) {
        const updated = await apiFetch<AutomationRule>(`/marketing-automation/${rule.id}`, {
          method: "PUT", body: JSON.stringify(payload),
        });
        setRule(updated);
      } else {
        const created = await apiFetch<AutomationRule>("/marketing-automation", {
          method: "POST", body: JSON.stringify(payload),
        });
        setRule(created);
      }
      toast.success("Birthday settings saved");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <Cake className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Birthdays</h1>
            <p className="text-sm text-muted-foreground">
              Choose what each customer is automatically sent on their birthday
            </p>
          </div>
        </div>

        {/* Info banner */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900">
          <CardContent className="p-4 flex gap-3">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Birthday messages are checked daily and only sent to customers who have a date of birth on file and have
              opted in to marketing. Use <strong>{"{{first_name}}"}</strong>, <strong>{"{{business_name}}"}</strong> and{" "}
              <strong>{"{{birthday_discount}}"}</strong> as merge tags in your message.
            </p>
          </CardContent>
        </Card>

        {loading ? (
          <div className="p-10 text-center text-muted-foreground text-sm">Loading birthday settings…</div>
        ) : (
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Birthday Message</CardTitle>
                <div className="flex items-center gap-2">
                  <Label htmlFor="bd-enabled" className="text-sm text-muted-foreground">
                    {enabled ? "Sending" : "Paused"}
                  </Label>
                  <Switch id="bd-enabled" checked={enabled} onCheckedChange={setEnabled} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Channel */}
              <div className="space-y-1.5">
                <Label>Send via</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => {
                      const Icon = c.icon;
                      return (
                        <SelectItem key={c.value} value={c.value}>
                          <span className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-muted-foreground" />{c.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {(channel === "sms" || channel === "both") && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    SMS requires a third-party SMS gateway to be configured separately
                  </p>
                )}
              </div>

              {/* Timing */}
              <div className="space-y-1.5">
                <Label>When to send</Label>
                <div className="flex items-center gap-2">
                  <Select value={daysBefore} onValueChange={setDaysBefore}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">On their birthday</SelectItem>
                      <SelectItem value="1">1 day before</SelectItem>
                      <SelectItem value="3">3 days before</SelectItem>
                      <SelectItem value="7">7 days before</SelectItem>
                      <SelectItem value="14">14 days before</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Subject */}
              <div className="space-y-1.5">
                <Label>Subject <span className="text-destructive">*</span></Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={DEFAULT_SUBJECT} />
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <Label>Message <span className="text-destructive">*</span></Label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  placeholder={DEFAULT_BODY}
                  className="font-mono text-sm"
                />
                {body.trim() && (
                  <div className="rounded-lg border bg-muted/40 p-3 mt-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium mb-1.5">
                      <Mail className="w-3.5 h-3.5" /> Preview
                    </div>
                    <div
                      className="text-sm prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body) }}
                    />
                  </div>
                )}
              </div>

              {/* Discount / gift */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-muted-foreground" /> Birthday discount or gift
                </Label>
                <Input
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="e.g. Use code BDAY20 for 20% off this week"
                />
                <p className="text-xs text-muted-foreground">
                  Optional. Added to the bottom of the message, or insert it yourself with the{" "}
                  <strong>{"{{birthday_discount}}"}</strong> merge tag.
                </p>
              </div>

              <div className="flex justify-end pt-1">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                  Save Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
