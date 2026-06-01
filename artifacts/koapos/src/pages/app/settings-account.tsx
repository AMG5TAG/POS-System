import { useState, useEffect } from "react";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant, useUpdateMerchant, useChangeEmail, useChangePassword, useListAuthEvents, useGetAccountLockStatus, useUnlockAccount, useUpdateAuthEvent, useMarkAuthEventsRead, useGetSecuritySettings, useUpdateSecuritySettings } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Globe, Loader2, Check, ExternalLink, AtSign, KeyRound, Eye, EyeOff, ShieldCheck, CheckCircle2, XCircle, LockOpen, Lock, Bell, Flag, CheckCheck, ShieldAlert, Download, SlidersHorizontal } from "lucide-react";
import { Switch } from "@/components/ui/switch";

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function parseUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown browser";
  if (/Chrome\//.test(ua) && !/Chromium|Edg\/|OPR\//.test(ua)) return "Chrome";
  if (/Edg\//.test(ua)) return "Edge";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return "Safari";
  if (/OPR\//.test(ua)) return "Opera";
  return "Browser";
}

const ACCOUNT_TABS = [
  { href: "#login-details",     label: "Login Details" },
  { href: "#business-username", label: "Business Username", icon: AtSign },
];
import { cn } from "@/lib/utils";

const USERNAME_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
const PORTAL_BASE = "www.koapos.com.au/b/";

function formatUsernameInput(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30);
}

function SecuritySettingsCard() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useGetSecuritySettings({ query: { queryKey: ["security-settings"] } });
  const updateSettings = useUpdateSecuritySettings();

  const [ipThreshold,    setIpThreshold]    = useState<string>("");
  const [windowMinutes,  setWindowMinutes]   = useState<string>("");
  const [holdHours,      setHoldHours]       = useState<string>("");
  const [saving,         setSaving]          = useState(false);

  useEffect(() => {
    if (settings) {
      setIpThreshold(String(settings.anomalyIpThreshold));
      setWindowMinutes(String(settings.anomalyWindowMinutes));
      setHoldHours(String(settings.anomalyHoldHours));
    }
  }, [settings]);

  const savedIp      = settings ? String(settings.anomalyIpThreshold)   : "";
  const savedWindow  = settings ? String(settings.anomalyWindowMinutes)  : "";
  const savedHold    = settings ? String(settings.anomalyHoldHours)      : "";

  const isDirty = ipThreshold !== savedIp || windowMinutes !== savedWindow || holdHours !== savedHold;

  const ipVal     = parseInt(ipThreshold, 10);
  const winVal    = parseInt(windowMinutes, 10);
  const holdVal   = parseInt(holdHours, 10);
  const ipError   = ipThreshold.length > 0 && (isNaN(ipVal) || ipVal < 1 || ipVal > 100);
  const winError  = windowMinutes.length > 0 && (isNaN(winVal) || winVal < 1 || winVal > 1440);
  const holdError = holdHours.length > 0 && (isNaN(holdVal) || holdVal < 1 || holdVal > 720);
  const canSave   = isDirty && !ipError && !winError && !holdError && ipThreshold.length > 0 && windowMinutes.length > 0 && holdHours.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    updateSettings.mutate(
      { data: { anomalyIpThreshold: ipVal, anomalyWindowMinutes: winVal, anomalyHoldHours: holdVal } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["security-settings"] });
          toast.success("Security settings saved");
        },
        onError: () => {
          toast.error("Failed to save security settings");
        },
        onSettled: () => setSaving(false),
      }
    );
  };

  return (
    <Card id="security-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4" /> Anomaly Detection Sensitivity
        </CardTitle>
        <CardDescription>
          Control how aggressively KoaPOS flags suspicious login patterns. Lower thresholds trigger holds sooner; higher values are more permissive.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ip-threshold">Distinct IPs</Label>
                <Input
                  id="ip-threshold"
                  type="number"
                  min={1}
                  max={100}
                  value={ipThreshold}
                  onChange={e => setIpThreshold(e.target.value)}
                  className={ipError ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {ipError ? (
                  <p className="text-xs text-destructive">Must be 1–100</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Hold after this many distinct IPs</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="window-minutes">Time window (min)</Label>
                <Input
                  id="window-minutes"
                  type="number"
                  min={1}
                  max={1440}
                  value={windowMinutes}
                  onChange={e => setWindowMinutes(e.target.value)}
                  className={winError ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {winError ? (
                  <p className="text-xs text-destructive">Must be 1–1440</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Observation window for bad attempts</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hold-hours">Hold duration (hr)</Label>
                <Input
                  id="hold-hours"
                  type="number"
                  min={1}
                  max={720}
                  value={holdHours}
                  onChange={e => setHoldHours(e.target.value)}
                  className={holdError ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {holdError ? (
                  <p className="text-xs text-destructive">Must be 1–720</p>
                ) : (
                  <p className="text-xs text-muted-foreground">How long the account hold lasts</p>
                )}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              Current: hold account for <strong>{holdHours || "?"} hour{parseInt(holdHours) !== 1 ? "s" : ""}</strong> when{" "}
              <strong>{ipThreshold || "?"}</strong> or more distinct IPs submit wrong passwords within{" "}
              <strong>{windowMinutes || "?"} minute{parseInt(windowMinutes) !== 1 ? "s" : ""}</strong>.
            </div>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
              ) : (
                "Save Settings"
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LoginNotifyCard() {
  const qc = useQueryClient();
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const updateMerchant = useUpdateMerchant();
  const [savingSuccess, setSavingSuccess] = useState(false);
  const [savingFailed, setSavingFailed] = useState(false);

  const enabledSuccess = (merchant as { loginNotifyEmail?: boolean } | undefined)?.loginNotifyEmail ?? false;
  const enabledFailed = (merchant as { loginNotifyEmailFailed?: boolean } | undefined)?.loginNotifyEmailFailed ?? false;

  const handleToggleSuccess = (checked: boolean) => {
    setSavingSuccess(true);
    updateMerchant.mutate(
      { data: { loginNotifyEmail: checked } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["merchant"] });
          toast.success(checked ? "Login notifications enabled" : "Login notifications disabled");
        },
        onError: () => {
          toast.error("Failed to update notification setting");
        },
        onSettled: () => setSavingSuccess(false),
      }
    );
  };

  const handleToggleFailed = (checked: boolean) => {
    setSavingFailed(true);
    updateMerchant.mutate(
      { data: { loginNotifyEmailFailed: checked } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["merchant"] });
          toast.success(checked ? "Failed login notifications enabled" : "Failed login notifications disabled");
        },
        onError: () => {
          toast.error("Failed to update notification setting");
        },
        onSettled: () => setSavingFailed(false),
      }
    );
  };

  return (
    <Card id="login-notifications">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-4 h-4" /> Login Email Notifications
        </CardTitle>
        <CardDescription>
          Receive email alerts for sign-in activity on your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Email me on sign-in</p>
            <p className="text-xs text-muted-foreground">
              Each email includes the time, IP address, and browser. Requires a configured email provider in Management → Email.
            </p>
          </div>
          <Switch
            checked={enabledSuccess}
            onCheckedChange={handleToggleSuccess}
            disabled={savingSuccess}
            aria-label="Toggle login email notifications"
          />
        </div>
        <div className="border-t pt-4 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Email me on failed login attempts</p>
            <p className="text-xs text-muted-foreground">
              Get notified when someone enters the wrong password or tries to sign in while your account is locked. Each email includes the time, IP address, and browser.
            </p>
          </div>
          <Switch
            checked={enabledFailed}
            onCheckedChange={handleToggleFailed}
            disabled={savingFailed}
            aria-label="Toggle failed login attempt notifications"
          />
        </div>
      </CardContent>
    </Card>
  );
}

type AuthEventItem = {
  id: number;
  outcome: string;
  status: string;
  createdAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function outcomeLabel(outcome: string): string {
  if (outcome === "success") return "Successful sign-in";
  if (outcome === "bad_password") return "Wrong password";
  if (outcome === "locked") return "Account locked";
  if (outcome === "account_hold") return "Suspicious activity hold";
  return "Email not found";
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function RecentSignInsCard({ authEvents }: { authEvents?: AuthEventItem[] }) {
  const qc = useQueryClient();
  const updateEvent = useUpdateAuthEvent();
  const [pending, setPending] = useState<Record<number, boolean>>({});

  const handleDownloadCSV = () => {
    const events = (authEvents ?? []).slice(0, 50);
    const header = ["Date/Time", "Outcome", "Browser", "IP Address", "Status"];
    const rows = events.map((ev) => [
      new Date(ev.createdAt).toLocaleString(),
      outcomeLabel(ev.outcome),
      parseUserAgent(ev.userAgent),
      ev.ipAddress ?? "",
      ev.status,
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sign-in-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStatus = (id: number, status: "acknowledged" | "flagged" | "new") => {
    setPending((p) => ({ ...p, [id]: true }));
    updateEvent.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["auth-events"] });
        },
        onError: () => {
          toast.error("Failed to update event");
        },
        onSettled: () => {
          setPending((p) => {
            const next = { ...p };
            delete next[id];
            return next;
          });
        },
      }
    );
  };

  return (
    <Card id="recent-sign-ins">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Recent Sign-ins
          </CardTitle>
          {authEvents && authEvents.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2 gap-1.5"
              onClick={handleDownloadCSV}
            >
              <Download className="w-3 h-3" />
              Download CSV
            </Button>
          )}
        </div>
        <CardDescription>
          The last 10 login attempts to your account. Flag anything that looks suspicious.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!authEvents || authEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sign-in events recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {authEvents.slice(0, 10).map((ev) => {
              const isFlagged = ev.status === "flagged";
              const isAcknowledged = ev.status === "acknowledged";
              const isLoading = !!pending[ev.id];
              return (
                <li
                  key={ev.id}
                  className={cn(
                    "flex items-start gap-3 py-2.5 px-3 rounded-lg border",
                    isFlagged
                      ? "border-destructive/50 bg-destructive/5"
                      : isAcknowledged
                      ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30"
                      : "border-border bg-transparent"
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {ev.outcome === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : ev.outcome === "account_hold" ? (
                      <ShieldAlert className="w-4 h-4 text-amber-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {ev.outcome === "success"
                            ? "Successful sign-in"
                            : ev.outcome === "bad_password"
                            ? "Wrong password"
                            : ev.outcome === "locked"
                            ? "Account locked"
                            : ev.outcome === "account_hold"
                            ? "Suspicious activity hold"
                            : "Email not found"}
                        </span>
                        {isFlagged && (
                          <Badge variant="destructive" className="text-xs py-0 px-1.5 h-4">
                            Suspicious
                          </Badge>
                        )}
                        {isAcknowledged && (
                          <Badge variant="secondary" className="text-xs py-0 px-1.5 h-4 text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900">
                            Dismissed
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelative(ev.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {parseUserAgent(ev.userAgent)}{ev.ipAddress ? ` · ${ev.ipAddress}` : ""}
                    </p>
                    <div className="flex items-center gap-2 pt-0.5">
                      {isFlagged ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs px-2"
                          disabled={isLoading}
                          onClick={() => handleStatus(ev.id, "new")}
                        >
                          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3 mr-1" />}
                          Clear flag
                        </Button>
                      ) : isAcknowledged ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60 hover:bg-destructive/5"
                            disabled={isLoading}
                            onClick={() => handleStatus(ev.id, "flagged")}
                          >
                            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flag className="w-3 h-3 mr-1" />}
                            Flag
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs px-2 text-muted-foreground"
                            disabled={isLoading}
                            onClick={() => handleStatus(ev.id, "new")}
                          >
                            Undo
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2"
                            disabled={isLoading}
                            onClick={() => handleStatus(ev.id, "acknowledged")}
                          >
                            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3 mr-1" />}
                            Dismiss
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60 hover:bg-destructive/5"
                            disabled={isLoading}
                            onClick={() => handleStatus(ev.id, "flagged")}
                          >
                            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flag className="w-3 h-3 mr-1" />}
                            Flag as suspicious
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsAccountPage() {
  const qc = useQueryClient();
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { data: authEvents } = useListAuthEvents({ query: { queryKey: ["auth-events"] } });
  const { data: lockStatus, refetch: refetchLock } = useGetAccountLockStatus({ query: { queryKey: ["account-lock-status"], refetchInterval: 30_000 } });
  const markRead = useMarkAuthEventsRead();

  useEffect(() => {
    markRead.mutate(undefined, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ["auth-events-unread-count"] });
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const unlockMutation = useUnlockAccount();

  const [unlocking, setUnlocking] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);

  const handleUnlock = () => {
    if (!unlockPassword) return;
    setUnlocking(true);
    unlockMutation.mutate(
      { data: { currentPassword: unlockPassword } },
      {
        onSuccess: () => {
          toast.success("Account unlocked", { description: "Failed login attempts have been cleared." });
          setUnlockPassword("");
          void refetchLock();
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          toast.error(msg ?? "Failed to unlock account. Please try again.");
        },
        onSettled: () => setUnlocking(false),
      }
    );
  };

  const [username, setUsername] = useState("");
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Password change state
  const [currentPw,  setCurrentPw]  = useState("");
  const [newPw,      setNewPw]      = useState("");
  const [confirmPw,  setConfirmPw]  = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwSaving,   setPwSaving]   = useState(false);

  // Email change state
  const [newEmail,      setNewEmail]      = useState("");
  const [confirmEmail,  setConfirmEmail]  = useState("");
  const [emailPw,       setEmailPw]       = useState("");
  const [showEmailPw,   setShowEmailPw]   = useState(false);
  const [emailSaving,   setEmailSaving]   = useState(false);

  const pwMismatch  = confirmPw.length > 0 && newPw !== confirmPw;
  const pwTooShort  = newPw.length > 0 && newPw.length < 8;
  const canChangePw = currentPw.length > 0 && newPw.length >= 8 && newPw === confirmPw;

  const emailMismatch  = confirmEmail.length > 0 && newEmail !== confirmEmail;
  const emailInvalid   = newEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail);
  const canChangeEmail = newEmail.length > 0 && !emailInvalid && newEmail === confirmEmail && emailPw.length > 0;

  const changeEmailMutation = useChangeEmail();
  const changePasswordMutation = useChangePassword();

  const handleChangeEmail = () => {
    if (!canChangeEmail) return;
    setEmailSaving(true);
    changeEmailMutation.mutate(
      { data: { currentPassword: emailPw, newEmail } },
      {
        onSuccess: () => {
          toast.success("Email updated successfully");
          qc.invalidateQueries({ queryKey: ["merchant"] });
          setNewEmail(""); setConfirmEmail(""); setEmailPw("");
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          toast.error(msg ?? "Email change failed");
        },
        onSettled: () => setEmailSaving(false),
      }
    );
  };

  const handleChangePassword = () => {
    if (!canChangePw) return;
    setPwSaving(true);
    changePasswordMutation.mutate(
      { data: { currentPassword: currentPw, newPassword: newPw } },
      {
        onSuccess: () => {
          toast.success("Password updated successfully");
          setCurrentPw(""); setNewPw(""); setConfirmPw("");
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          toast.error(msg ?? "Password change failed");
        },
        onSettled: () => setPwSaving(false),
      }
    );
  };

  useEffect(() => {
    if (merchant?.username !== undefined) {
      setUsername(merchant.username ?? "");
      setSavedUsername(merchant.username ?? null);
    }
  }, [merchant?.username]);

  const isValid = username.length === 0 || USERNAME_RE.test(username);
  const hasChanged = username !== (savedUsername ?? "");
  const isLongEnough = username.length >= 3;
  const canSave = hasChanged && isValid && isLongEnough;

  const isAccountDirty =
    hasChanged ||
    currentPw.length > 0 ||
    newPw.length > 0 ||
    newEmail.length > 0;

  const { ConfirmDialog: AccountFormGuard } = useUnsavedChangesGuard(isAccountDirty, {
    title: "Unsaved account changes",
    description: "You have unsaved changes to your account. If you leave now, your changes will be lost.",
    cancelLabel: "Stay on page",
    actionLabel: "Leave anyway",
  });

  const updateMerchant = useUpdateMerchant();

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    updateMerchant.mutate(
      { data: { username } },
      {
        onSuccess: (updated) => {
          const u = (updated as { username?: string }).username;
          setSavedUsername(u ?? null);
          qc.invalidateQueries({ queryKey: ["merchant"] });
          toast.success("Username saved!", {
            description: `Your page is now at ${PORTAL_BASE}${u}`,
          });
        },
        onError: (err: unknown) => {
          const resp = err as { response?: { status?: number; data?: { error?: string } } };
          if (resp?.response?.status === 409) {
            toast.error("Username already taken", { description: resp.response.data?.error });
          } else {
            toast.error("Could not update username", { description: resp?.response?.data?.error ?? "Update failed" });
          }
        },
        onSettled: () => setSaving(false),
      }
    );
  };

  const fieldError =
    username.length > 0 && username.length < 3
      ? "Username must be at least 3 characters"
      : username.length > 0 && !isValid
      ? "Only lowercase letters, numbers, and hyphens. Must start and end with a letter or number."
      : null;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-8">
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="text-sm text-muted-foreground">Manage your login credentials, profile details, and subscription plan.</p>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Left column: Login Details + Change Password stacked */}
        <div className="space-y-6">

        {/* Login details */}
        <Card id="login-details">
          <CardHeader>
            <CardTitle>Login Details</CardTitle>
            <CardDescription>Your account credentials for KoaPOS.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Email Address</Label>
              <Input value={merchant?.email ?? ""} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">
                To change your email, use the <strong>Update Email</strong> card below.
              </p>
            </div>
            <div>
              <Label>Plan</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input value={(merchant as any)?.plan ?? "—"} disabled className="bg-muted capitalize" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card id="change-password">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> Change Password
            </CardTitle>
            <CardDescription>
              Update your KoaPOS login password.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-pw">Current Password</Label>
              <div className="relative">
                <Input
                  id="current-pw"
                  type={showCurrent ? "text" : "password"}
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  placeholder="Enter current password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-pw">New Password</Label>
              <div className="relative">
                <Input
                  id="new-pw"
                  type={showNew ? "text" : "password"}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="At least 8 characters"
                  className={cn("pr-10", pwTooShort && "border-destructive focus-visible:ring-destructive")}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pwTooShort && (
                <p className="text-xs text-destructive">Password must be at least 8 characters</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirm-pw"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Re-enter new password"
                  className={cn("pr-10", pwMismatch && "border-destructive focus-visible:ring-destructive")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pwMismatch && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>

            <Button onClick={handleChangePassword} disabled={!canChangePw || pwSaving}>
              {pwSaving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating…</>
              ) : (
                "Update Password"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Update Email */}
        <Card id="update-email">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AtSign className="w-4 h-4" /> Update Email Address
            </CardTitle>
            <CardDescription>
              Change the email address you use to log in to KoaPOS. Your current password is required for security.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-email">New Email Address</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value.trim())}
                placeholder="new@example.com"
                className={emailInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {emailInvalid && (
                <p className="text-xs text-destructive">Please enter a valid email address</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-email">Confirm New Email</Label>
              <Input
                id="confirm-email"
                type="email"
                value={confirmEmail}
                onChange={e => setConfirmEmail(e.target.value.trim())}
                placeholder="Re-enter new email"
                className={emailMismatch ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {emailMismatch && (
                <p className="text-xs text-destructive">Email addresses do not match</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-pw">Current Password</Label>
              <div className="relative">
                <Input
                  id="email-pw"
                  type={showEmailPw ? "text" : "password"}
                  value={emailPw}
                  onChange={e => setEmailPw(e.target.value)}
                  placeholder="Confirm with your current password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowEmailPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showEmailPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button onClick={handleChangeEmail} disabled={!canChangeEmail || emailSaving}>
              {emailSaving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating…</>
              ) : (
                "Update Email"
              )}
            </Button>
          </CardContent>
        </Card>

        </div>{/* end left column */}

        {/* Right column: Business Username + Recent sign-ins */}
        <div className="space-y-6">

        <Card id="business-username">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AtSign className="w-4 h-4" /> Business Username
            </CardTitle>
            <CardDescription>
              Your unique handle on KoaPOS. This sets your public page URL.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Input row */}
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <div className="flex gap-0">
                <div className="flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground whitespace-nowrap select-none">
                  koapos.com.au/b/
                </div>
                <Input
                  id="username"
                  value={username}
                  onChange={e => setUsername(formatUsernameInput(e.target.value))}
                  placeholder="your-business"
                  className={cn(
                    "rounded-l-none",
                    fieldError && "border-destructive focus-visible:ring-destructive",
                  )}
                  maxLength={30}
                />
              </div>
              {fieldError ? (
                <p className="text-xs text-destructive">{fieldError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  3–30 characters. Lowercase letters, numbers, and hyphens only.
                </p>
              )}
            </div>

            {/* URL preview */}
            {username.length >= 3 && isValid && (
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-mono break-all">
                  <span className="text-muted-foreground">www.</span>
                  <span className="text-muted-foreground">koapos.com.au/b/</span>
                  <span className="font-semibold text-foreground">{username}</span>
                </span>
              </div>
            )}

            {/* Change warning */}
            {hasChanged && savedUsername && isValid && isLongEnough && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800 space-y-1">
                  <p className="font-medium">Your public URL will change</p>
                  <p>
                    Any existing links, QR codes, or integrations pointing to{" "}
                    <span className="font-mono">koapos.com.au/b/{savedUsername}</span> will stop working.
                    You will need to update them after saving.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={!canSave || saving}>
                {saving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                ) : (
                  "Save Username"
                )}
              </Button>
              {savedUsername && !hasChanged && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Check className="w-3.5 h-3.5 text-green-500" />
                  Saved
                </span>
              )}
            </div>

            {/* Current live URL */}
            {savedUsername && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">Your current public page</p>
                <a
                  href={`https://${PORTAL_BASE}${savedUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-mono"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  {PORTAL_BASE}{savedUsername}
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Anomaly Detection Sensitivity */}
        <SecuritySettingsCard />

        {/* Login Email Notifications */}
        <LoginNotifyCard />

        {/* Account Lock Status */}
        <Card id="account-lock">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {lockStatus?.locked ? (
                lockStatus.isAnomalyHold
                  ? <ShieldAlert className="w-4 h-4 text-amber-500" />
                  : <Lock className="w-4 h-4 text-destructive" />
              ) : (
                <LockOpen className="w-4 h-4 text-green-500" />
              )}
              Account Lock
            </CardTitle>
            <CardDescription>
              {lockStatus?.isAnomalyHold
                ? "Your account has been automatically held due to suspicious sign-in activity from multiple locations."
                : "After too many failed login attempts your account is temporarily locked. You can clear the lockout here if you have an active session."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {lockStatus?.locked ? (
              <div className={`rounded-lg border p-4 space-y-4 ${lockStatus.isAnomalyHold ? "border-amber-300/50 bg-amber-50/50 dark:border-amber-700/50 dark:bg-amber-950/20" : "border-destructive/30 bg-destructive/5"}`}>
                <div className="flex items-start gap-3">
                  {lockStatus.isAnomalyHold
                    ? <ShieldAlert className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    : <Lock className="w-4 h-4 text-destructive mt-0.5 shrink-0" />}
                  <div className="space-y-1">
                    <p className={`text-sm font-medium ${lockStatus.isAnomalyHold ? "text-amber-700 dark:text-amber-400" : "text-destructive"}`}>
                      {lockStatus.isAnomalyHold ? "Account hold — suspicious activity detected" : "Account is currently locked"}
                    </p>
                    {lockStatus.retryAfter && (
                      <p className="text-xs text-muted-foreground">
                        {lockStatus.isAnomalyHold
                          ? `Hold expires ${new Date(lockStatus.retryAfter).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} — or confirm your password below to clear it now.`
                          : <>Lockout expires at{" "}<span className="font-mono">{new Date(lockStatus.retryAfter).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{" "}— or enter your password below to unlock it now.</>}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unlock-pw">Confirm with your current password</Label>
                  <div className="relative">
                    <Input
                      id="unlock-pw"
                      type={showUnlockPassword ? "text" : "password"}
                      value={unlockPassword}
                      onChange={e => setUnlockPassword(e.target.value)}
                      placeholder="Enter your password to confirm"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowUnlockPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showUnlockPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleUnlock}
                  disabled={unlocking || !unlockPassword}
                >
                  {unlocking ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Unlocking…</>
                  ) : (
                    <><LockOpen className="w-4 h-4 mr-2" />Unlock Account</>
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                Your account is not locked. No action needed.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent sign-ins */}
        <RecentSignInsCard authEvents={authEvents} />

        </div>{/* end right column */}

        </div>
      </div>

      <AccountFormGuard />
    </AppLayout>
  );
}
