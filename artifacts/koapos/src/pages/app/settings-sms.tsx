import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetSmsSettings,
  useUpdateSmsSettings,
  useConnectTwilio,
  useDisconnectTwilio,
  useTestSms,
  getGetSmsSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare, CheckCircle2, XCircle, Loader2, Send,
  Eye, EyeOff, Plug, Unplug, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const QUERY_KEY = getGetSmsSettingsQueryKey();

export default function SettingsSmsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetSmsSettings({ query: { queryKey: QUERY_KEY } });

  /* ── notification prefs ── */
  const [smsEnabled, setSmsEnabled]               = useState(false);
  const [autoNotifyOnStatus, setAutoNotifyOnStatus] = useState(false);
  const [prefsDirty, setPrefsDirty]               = useState(false);

  /* ── connect form ── */
  const [accountSid, setAccountSid]   = useState("");
  const [authToken, setAuthToken]     = useState("");
  const [fromNumber, setFromNumber]   = useState("");
  const [showToken, setShowToken]     = useState(false);
  const [showConnect, setShowConnect] = useState(false);

  /* ── test SMS ── */
  const [testTo, setTestTo] = useState("");

  const updatePrefs  = useUpdateSmsSettings({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: QUERY_KEY }); setPrefsDirty(false); } } });
  const connectMut   = useConnectTwilio({    mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: QUERY_KEY }); setShowConnect(false); setAccountSid(""); setAuthToken(""); setFromNumber(""); toast.success("Twilio connected"); } } });
  const disconnectMut = useDisconnectTwilio({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: QUERY_KEY }); toast.success("Twilio disconnected"); } } });
  const testMut      = useTestSms({          mutation: { onSuccess: (r) => { r.success ? toast.success("Test SMS sent successfully") : toast.error(r.error ?? "Failed to send test SMS"); } } });

  useEffect(() => {
    if (!data) return;
    setSmsEnabled(data.smsEnabled);
    setAutoNotifyOnStatus(data.autoNotifyOnStatus);
    setPrefsDirty(false);
  }, [data]);

  const connected = data?.connected ?? false;

  function handlePrefChange(setter: (v: boolean) => void, val: boolean) {
    setter(val);
    setPrefsDirty(true);
  }

  function savePrefs() {
    updatePrefs.mutate({ data: { smsEnabled, autoNotifyOnStatus } });
  }

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!accountSid.trim() || !authToken.trim() || !fromNumber.trim()) {
      toast.error("All three fields are required");
      return;
    }
    connectMut.mutate({ data: { accountSid: accountSid.trim(), authToken: authToken.trim(), fromNumber: fromNumber.trim() } });
  }

  function handleDisconnect() {
    if (!confirm("Remove your Twilio credentials? SMS notifications will stop working until reconnected.")) return;
    disconnectMut.mutate();
  }

  function handleTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testTo.trim()) { toast.error("Enter a phone number"); return; }
    testMut.mutate({ data: { to: testTo.trim() } });
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            SMS
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Connect Twilio to send automated SMS notifications to customers.
          </p>
        </div>

        {/* ── Connection status ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#F22F46] flex items-center justify-center shrink-0">
                  <img src="https://cdn.simpleicons.org/twilio/ffffff" alt="Twilio" className="w-5 h-5 object-contain" />
                </div>
                Twilio Connection
              </CardTitle>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : connected ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-medium gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground gap-1">
                  <XCircle className="w-3 h-3" /> Not connected
                </Badge>
              )}
            </div>
            <CardDescription>
              Credentials are stored encrypted in your account vault — never shared platform-wide.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {connected && !showConnect && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Account SID</p>
                    <p className="font-mono text-sm">{data?.accountSidPrefix ?? "••••••…"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">From Number</p>
                    <p className="font-mono text-sm">{data?.fromNumber ?? "—"}</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setShowConnect(true)} className="gap-1.5">
                    <Plug className="w-3.5 h-3.5" /> Update credentials
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={disconnectMut.isPending}
                    className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60">
                    {disconnectMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
                    Disconnect
                  </Button>
                </div>
              </div>
            )}

            {(!connected || showConnect) && (
              <form onSubmit={handleConnect} className="space-y-3">
                {!connected && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Connect your Twilio account to enable SMS notifications. Credentials are encrypted and stored per-account.</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="account-sid" className="text-sm">Account SID</Label>
                  <Input id="account-sid" value={accountSid} onChange={(e) => setAccountSid(e.target.value)}
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="font-mono text-sm" />
                  <p className="text-xs text-muted-foreground">Found in your <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Twilio Console</a> dashboard.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="auth-token" className="text-sm">Auth Token</Label>
                  <div className="relative">
                    <Input id="auth-token" type={showToken ? "text" : "password"} value={authToken}
                      onChange={(e) => setAuthToken(e.target.value)}
                      placeholder="••••••••••••••••••••••••••••••••" className="font-mono text-sm pr-9" />
                    <button type="button" onClick={() => setShowToken((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="from-number" className="text-sm">From Number</Label>
                  <Input id="from-number" value={fromNumber} onChange={(e) => setFromNumber(e.target.value)}
                    placeholder="+61400000000" className="font-mono text-sm" />
                  <p className="text-xs text-muted-foreground">The Twilio phone number messages are sent from (E.164 format, e.g. +61412345678).</p>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" disabled={connectMut.isPending} className="gap-1.5">
                    {connectMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                    {connected ? "Update" : "Connect Twilio"}
                  </Button>
                  {showConnect && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowConnect(false)}>Cancel</Button>
                  )}
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* ── Notification preferences ── */}
        <Card className={cn(!connected && "opacity-60 pointer-events-none")}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notification Preferences</CardTitle>
            <CardDescription>Control when SMS notifications are sent to customers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Enable SMS notifications</p>
                <p className="text-xs text-muted-foreground mt-0.5">Master switch — disabling this stops all outgoing SMS.</p>
              </div>
              <Switch checked={smsEnabled} onCheckedChange={(v) => handlePrefChange(setSmsEnabled, v)} />
            </div>
            <Separator />
            <div className={cn("flex items-center justify-between gap-4", !smsEnabled && "opacity-50 pointer-events-none")}>
              <div>
                <p className="text-sm font-medium">Auto-notify on service job status change</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Send an SMS when a job moves to In Progress, Awaiting Customer, or Completed.
                </p>
              </div>
              <Switch checked={autoNotifyOnStatus} onCheckedChange={(v) => handlePrefChange(setAutoNotifyOnStatus, v)} disabled={!smsEnabled} />
            </div>
            {prefsDirty && (
              <div className="pt-1">
                <Button size="sm" onClick={savePrefs} disabled={updatePrefs.isPending} className="gap-1.5">
                  {updatePrefs.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save preferences
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Test SMS ── */}
        {connected && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Send a Test SMS</CardTitle>
              <CardDescription>Verify your Twilio credentials are working correctly.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTest} className="flex gap-2">
                <Input value={testTo} onChange={(e) => setTestTo(e.target.value)}
                  placeholder="+61412345678" className="font-mono text-sm max-w-xs" />
                <Button type="submit" size="sm" disabled={testMut.isPending} className="gap-1.5 shrink-0">
                  {testMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send test
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
