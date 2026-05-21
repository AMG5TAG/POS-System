import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetMerchant, useUpdateMerchant } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Globe, Loader2, Check, ExternalLink, AtSign, KeyRound, Eye, EyeOff } from "lucide-react";

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

export default function SettingsAccountPage() {
  const qc = useQueryClient();
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });

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

  const pwMismatch  = confirmPw.length > 0 && newPw !== confirmPw;
  const pwTooShort  = newPw.length > 0 && newPw.length < 8;
  const canChangePw = currentPw.length > 0 && newPw.length >= 8 && newPw === confirmPw;

  const handleChangePassword = async () => {
    if (!canChangePw) return;
    setPwSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Password change failed");
        return;
      }
      toast.success("Password updated successfully");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setPwSaving(false);
    }
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

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/merchants/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (res.status === 409) {
        const { error } = await res.json();
        toast.error("Username already taken", { description: error });
        return;
      }
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Update failed" }));
        toast.error("Could not update username", { description: error });
        return;
      }
      const updated = await res.json();
      setSavedUsername(updated.username);
      qc.invalidateQueries({ queryKey: ["merchant"] });
      toast.success("Username saved!", {
        description: `Your page is now at ${PORTAL_BASE}${updated.username}`,
      });
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSaving(false);
    }
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
                Contact support to change your email address.
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

        </div>{/* end left column */}

        {/* Right column: Business Username */}
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

        </div>
      </div>
    </AppLayout>
  );
}
