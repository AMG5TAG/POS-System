import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { publicOrigin } from "@/lib/public-url";

const MAX_APK_BYTES = 100 * 1024 * 1024;

type TvAppUpdate = {
  app: string;
  versionCode: number;
  versionName: string;
  uploadedAt: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export default function TvAppUpdatesPage() {
  const [, setLocation] = useLocation();
  const formRef = useRef<HTMLFormElement>(null);
  const [apps, setApps] = useState<TvAppUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successUrl, setSuccessUrl] = useState("");

  async function loadApps(): Promise<void> {
    const response = await fetch("/api/tv-updates/admin/apps", { credentials: "include" });
    if (response.status === 401) {
      setLocation("/login");
      return;
    }
    if (response.status === 403) {
      setLocation("/dashboard");
      return;
    }
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load TV app updates");
    setApps(body.apps as TvAppUpdate[]);
  }

  useEffect(() => {
    let active = true;
    void loadApps()
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load TV app updates");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function handlePublish(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setSuccessUrl("");
    const form = new FormData(event.currentTarget);
    const app = String(form.get("app") ?? "");
    const apk = form.get("apk");
    const updateJson = form.get("updateJson");

    if (!/^[a-z0-9]{1,32}$/.test(app)) {
      setError("App name must use lowercase letters and digits only.");
      return;
    }
    if (!(apk instanceof File) || !(updateJson instanceof File)) {
      setError("Choose both the APK and update.json files.");
      return;
    }
    if (updateJson.name !== "update.json") {
      setError("The manifest file must be named update.json.");
      return;
    }
    if (apk.size < 1 || apk.size > MAX_APK_BYTES) {
      setError("The APK must be between 1 byte and 100 MB.");
      return;
    }

    setSaving(true);
    try {
      const payload = new FormData();
      payload.append("app", app);
      payload.append("apk", apk);
      payload.append("updateJson", updateJson);
      const response = await fetch("/api/tv-updates/admin/publish", {
        method: "POST",
        credentials: "include",
        body: payload,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not publish the update");
      setSuccessUrl(body.publicUrl || `${publicOrigin()}/tv/${app}/update.json`);
      formRef.current?.reset();
      await loadApps();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not publish the update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">TV app updates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Publish Android TV app manifests and APKs. New downloads are available immediately.
          </p>
        </div>

        {loading ? (
          <div className="flex min-h-40 items-center justify-center"><Spinner /></div>
        ) : (
          <>
            {apps.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Published apps</CardTitle>
                  <CardDescription>Current release and the date its update manifest was published.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="divide-y">
                    {apps.map((item) => (
                      <div key={item.app} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">{item.app}</p>
                          <p className="text-sm text-muted-foreground">
                            Version {item.versionName} · code {item.versionCode}
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground sm:text-right">
                          <p>{formatDate(item.uploadedAt)}</p>
                          <a
                            className="underline underline-offset-4 hover:text-foreground"
                            href={`${publicOrigin()}/tv/${item.app}/update.json`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Public update.json
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Publish an update</CardTitle>
                <CardDescription>
                  Upload the APK and the matching update.json from the Android TV build.
                  APKs can be up to 100 MB; earlier APK files are kept.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form ref={formRef} onSubmit={(event) => void handlePublish(event)} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="tv-app-name">App name</Label>
                    <Input
                      id="tv-app-name"
                      name="app"
                      required
                      maxLength={32}
                      pattern="[a-z0-9]+"
                      placeholder="apsclock"
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">Lowercase letters and digits only.</p>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="tv-apk">APK file</Label>
                      <Input id="tv-apk" name="apk" type="file" accept=".apk" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tv-update-json">Manifest file</Label>
                      <Input id="tv-update-json" name="updateJson" type="file" accept=".json,application/json" required />
                    </div>
                  </div>
                  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                  {successUrl && (
                    <div role="status" className="rounded-md border border-green-600/30 bg-green-600/5 p-3 text-sm">
                      <p className="font-medium">Update published successfully.</p>
                      <a
                        href={successUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all underline underline-offset-4"
                      >
                        {successUrl}
                      </a>
                    </div>
                  )}
                  <Button type="submit" disabled={saving}>
                    {saving ? "Uploading and publishing…" : "Publish update"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
