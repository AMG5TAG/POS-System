import { AppLayout } from "@/components/layout/app-layout";
import { ApiTokensCard } from "@/components/api-tokens-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound } from "lucide-react";

/** Management > Settings & Integrations > API Tokens - long-lived tokens for connected apps (Koastal Tech Tools). */
export default function SettingsApiTokensPage() {
  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-primary" />
            API Tokens
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Let Koastal Tech Tools (KTT) and other connected apps load customers and service jobs, update job status and notes, and upload reports.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <ApiTokensCard />
          <Card>
            <CardHeader><CardTitle>Connect Koastal Tech Tools</CardTitle></CardHeader>
            <CardContent>
              <ol className="list-decimal pl-5 space-y-2 text-sm">
                <li>Type a name for the token (e.g. the technician or their USB) and press <b>Create token</b>.</li>
                <li>Copy the token - it starts with <span className="font-mono">kpos_</span> and is only shown once.</li>
                <li>In KTT open <b>Settings &gt; POS link</b>, choose <b>KoaPOS</b>, check the address is this site, then press <b>Use an API token</b> and paste it.</li>
                <li>On the KTT Dashboard use <b>Load from POS</b> with a job number. Reports made in KTT upload to the job automatically.</li>
              </ol>
              <p className="text-xs text-muted-foreground mt-4">
                Tokens don't expire. They can only read and update customers and service jobs - not sales, payments, staff or account settings.
                Revoke a token here to disconnect that copy of KTT immediately.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
