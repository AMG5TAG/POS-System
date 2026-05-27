import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetEmailSettings,
  useUpdateEmailSettings,
  useTestEmailSettings,
  getGetEmailSettingsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail, Server, Key, CheckCircle2, XCircle, Send, Zap,
  ChevronDown, ChevronRight, Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Provider = "none" | "smtp" | "resend" | "sendgrid";

const SI = (slug: string, hex: string) => `https://cdn.simpleicons.org/${slug}/${hex}`;

function ProviderLogo({ src, bg, alt }: { src: string; bg: string; alt: string }) {
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded overflow-hidden shrink-0 ${bg}`}>
      <img src={src} alt={alt} className="w-3.5 h-3.5 object-contain" />
    </span>
  );
}

const PROVIDERS: { id: Provider; label: string; description: string; icon: React.ReactNode; usesKey: boolean }[] = [
  {
    id: "none",
    label: "Not configured",
    description: "Email sending is disabled",
    icon: <XCircle className="w-4 h-4 text-muted-foreground" />,
    usesKey: false,
  },
  {
    id: "smtp",
    label: "SMTP",
    description: "Works with Gmail, Outlook, or any mail server",
    icon: <Server className="w-4 h-4 text-blue-500" />,
    usesKey: false,
  },
  {
    id: "resend",
    label: "Resend",
    description: "Simple API-key based email delivery",
    icon: <ProviderLogo src={SI("resend", "ffffff")} bg="bg-black" alt="Resend" />,
    usesKey: true,
  },
  {
    id: "sendgrid",
    label: "SendGrid",
    description: "Twilio SendGrid transactional email",
    icon: <ProviderLogo src={SI("sendgrid", "ffffff")} bg="bg-[#1A82E2]" alt="SendGrid" />,
    usesKey: true,
  },
];

export default function SettingsEmailPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetEmailSettings();
  const update = useUpdateEmailSettings();
  const testMutation = useTestEmailSettings();

  const [provider, setProvider]   = useState<Provider>("none");
  const [fromName, setFromName]   = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [smtpHost, setSmtpHost]   = useState("");
  const [smtpPort, setSmtpPort]   = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser]   = useState("");
  const [smtpPass, setSmtpPass]   = useState("");
  const [apiKey, setApiKey]       = useState("");
  const [receiptEmails, setReceiptEmails] = useState(false);
  const [testTo, setTestTo]       = useState("");
  const [smtpPassSet, setSmtpPassSet] = useState(false);
  const [apiKeySet, setApiKeySet]     = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!data) return;
    setProvider((data.provider as Provider) ?? "none");
    setFromName(data.fromName ?? "");
    setFromEmail(data.fromEmail ?? "");
    setSmtpHost(data.smtpHost ?? "");
    setSmtpPort(data.smtpPort ?? "587");
    setSmtpSecure(data.smtpSecure === "true");
    setSmtpUser(data.smtpUser ?? "");
    setSmtpPassSet(data.smtpPassSet ?? false);
    setApiKeySet(data.apiKeySet ?? false);
    setReceiptEmails(data.receiptEmailsEnabled === "true");
    // Only reset dirty on the initial load, not on background refetches
    setDirty((d) => (d ? d : false));
  }, [data]);

  const mark = () => setDirty(true);

  async function handleSave() {
    const payload: Record<string, string> = {
      provider,
      fromName,
      fromEmail,
      receiptEmailsEnabled: receiptEmails ? "true" : "false",
    };
    if (provider === "smtp") {
      payload.smtpHost   = smtpHost;
      payload.smtpPort   = smtpPort;
      payload.smtpSecure = smtpSecure ? "true" : "false";
      payload.smtpUser   = smtpUser;
      if (smtpPass) payload.smtpPass = smtpPass;
    }
    if (provider === "resend" || provider === "sendgrid") {
      if (apiKey) payload.apiKey = apiKey;
    }
    update.mutate({ data: payload }, {
      onSuccess: (saved) => {
        setSmtpPassSet(saved.smtpPassSet ?? false);
        setApiKeySet(saved.apiKeySet ?? false);
        setSmtpPass("");
        setApiKey("");
        setDirty(false);
        void queryClient.invalidateQueries({ queryKey: getGetEmailSettingsQueryKey() });
        toast.success("Email settings saved");
      },
      onError: (err: unknown) => {
        const status = (err as { status?: number })?.status;
        if (status === 401) {
          toast.error("Session expired — please refresh the page and try again");
        } else {
          toast.error("Failed to save email settings");
        }
      },
    });
  }

  async function handleTest() {
    if (!testTo) { toast.error("Enter a recipient email address"); return; }
    testMutation.mutate({ data: { to: testTo } }, {
      onSuccess: () => toast.success(`Test email sent to ${testTo}`),
      onError: (e: unknown) => {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast.error(msg ?? "Test email failed — check your configuration");
      },
    });
  }

  const activeProvider = PROVIDERS.find(p => p.id === provider)!;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Email</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure how KoaPOS sends transactional emails such as receipts
            </p>
          </div>
          <Button onClick={handleSave} disabled={update.isPending || !dirty}>
            {update.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* Provider selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Email Provider</CardTitle>
              <CardDescription>Choose how outgoing emails are delivered</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setProvider(p.id); mark(); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors",
                    provider === p.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/40"
                  )}
                >
                  <span className="shrink-0">{p.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                  </div>
                  {provider === p.id && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Configuration */}
          <div className="space-y-4">

            {/* From details — shown for all active providers */}
            {provider !== "none" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Sender Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">From Name</Label>
                    <Input
                      value={fromName}
                      onChange={e => { setFromName(e.target.value); mark(); }}
                      placeholder="Demo Retail Store"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">From Email</Label>
                    <Input
                      type="email"
                      value={fromEmail}
                      onChange={e => { setFromEmail(e.target.value); mark(); }}
                      placeholder="noreply@yourbusiness.com"
                      className="h-8 text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* SMTP config */}
            {provider === "smtp" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Server className="w-4 h-4 text-blue-500" /> SMTP Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs">Host</Label>
                      <Input
                        value={smtpHost}
                        onChange={e => { setSmtpHost(e.target.value); mark(); }}
                        placeholder="smtp.gmail.com"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Port</Label>
                      <Input
                        value={smtpPort}
                        onChange={e => { setSmtpPort(e.target.value); mark(); }}
                        placeholder="587"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs">TLS / SSL</Label>
                      <p className="text-[11px] text-muted-foreground">Use port 465 with TLS enabled</p>
                    </div>
                    <Switch checked={smtpSecure} onCheckedChange={v => { setSmtpSecure(v); mark(); }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Username</Label>
                    <Input
                      value={smtpUser}
                      onChange={e => { setSmtpUser(e.target.value); mark(); }}
                      placeholder="your@email.com"
                      className="h-8 text-sm"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Password / App Password</Label>
                    <Input
                      type="password"
                      value={smtpPass}
                      onChange={e => { setSmtpPass(e.target.value); mark(); }}
                      placeholder={smtpPassSet ? "••••••••  (set — leave blank to keep)" : "Enter password"}
                      className="h-8 text-sm"
                      autoComplete="new-password"
                    />
                    {smtpPassSet && !smtpPass && (
                      <p className="text-[11px] text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Password is saved
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-3 text-[11px] text-blue-700 dark:text-blue-300 space-y-1">
                    <p className="font-medium">Gmail / Google Workspace</p>
                    <p>Use <strong>smtp.gmail.com</strong>, port <strong>587</strong>, TLS off. Generate an <em>App Password</em> at myaccount.google.com/apppasswords (2FA must be enabled).</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* API-key providers */}
            {(provider === "resend" || provider === "sendgrid") && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Key className="w-4 h-4" /> API Key
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      {provider === "resend" ? "Resend API Key" : "SendGrid API Key"}
                    </Label>
                    <Input
                      type="password"
                      value={apiKey}
                      onChange={e => { setApiKey(e.target.value); mark(); }}
                      placeholder={apiKeySet ? "••••••••  (set — leave blank to keep)" : `Enter ${provider === "resend" ? "re_..." : "SG...."} key`}
                      className="h-8 text-sm"
                      autoComplete="new-password"
                    />
                    {apiKeySet && !apiKey && (
                      <p className="text-[11px] text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> API key is saved
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg bg-muted/50 border p-3 text-[11px] text-muted-foreground">
                    {provider === "resend"
                      ? <>Get your API key at <strong>resend.com/api-keys</strong>. Free tier allows 3,000 emails/month and 100/day.</>
                      : <>Get your API key at <strong>app.sendgrid.com/settings/api_keys</strong>. Ensure the key has "Mail Send" permission.</>
                    }
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Features */}
            {provider !== "none" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Features</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Email receipts</p>
                      <p className="text-xs text-muted-foreground">Allow sending receipts to customers by email</p>
                    </div>
                    <Switch checked={receiptEmails} onCheckedChange={v => { setReceiptEmails(v); mark(); }} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Test email */}
            {provider !== "none" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Send className="w-4 h-4" /> Test Connection
                  </CardTitle>
                  <CardDescription>Send a test email to verify your configuration is working</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={testTo}
                      onChange={e => setTestTo(e.target.value)}
                      placeholder="your@email.com"
                      className="h-8 text-sm flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTest}
                      disabled={testMutation.isPending || !testTo}
                    >
                      {testMutation.isPending ? "Sending…" : "Send Test"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1">
                    <Info className="w-3 h-3 shrink-0 mt-0.5" />
                    Save your settings first before testing
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Status card when none */}
            {provider === "none" && (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Mail className="w-8 h-8 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">No email provider selected</p>
                  <p className="text-xs mt-1">Choose a provider on the left to get started</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
