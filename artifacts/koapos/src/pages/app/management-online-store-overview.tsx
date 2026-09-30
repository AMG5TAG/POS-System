import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Package, Users, Loader2, Store } from "lucide-react";

export interface OnlineStoreSummary { shopUrl: string; listed: number; hidden: number }

export async function onlineStoreFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api/online-store${path}`, {
    credentials: "include",
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${r.status})`);
  return body as T;
}

/* Management › Online Store › Overview — the store's address and where each of
   its settings lives. */
export default function ManagementOnlineStoreOverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["online-store", "summary"],
    queryFn: () => onlineStoreFetch<OnlineStoreSummary>("/summary"),
  });
  const host = data?.shopUrl.replace(/^https?:\/\//, "");

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Store className="w-6 h-6 text-primary" /> Online Store</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            The online shop runs on the POS's own products, prices, stock and customers — nothing is synced or copied.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your store</CardTitle>
              <CardDescription>What customers see at your shop address.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading || !data ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <a href={data.shopUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-medium text-primary hover:underline">
                    {host} <ExternalLink className="w-4 h-4" />
                  </a>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-lg border p-3"><p className="text-2xl font-bold">{data.listed}</p><p className="text-xs text-muted-foreground">Products listed</p></div>
                    <div className="rounded-lg border p-3"><p className="text-2xl font-bold">{data.hidden}</p><p className="text-xs text-muted-foreground">Hidden from the shop</p></div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The store's name, logo, contact details and opening hours come from Settings › Business Details.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Settings</CardTitle>
              <CardDescription>Everything that controls the online shop.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/management/online-store/products">
                <Button variant="outline" className="w-full justify-start gap-2"><Package className="w-4 h-4" /> Products — choose what the shop lists</Button>
              </Link>
              <Link href="/management/online-store/accounts">
                <Button variant="outline" className="w-full justify-start gap-2"><Users className="w-4 h-4" /> Customer accounts — invite customers to sign in</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
