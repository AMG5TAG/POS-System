import { AppLayout } from "@/components/layout/app-layout";
import { ShopInvitesCard } from "@/components/customers/ShopInvitesCard";

/* Management › Online Store › Customer Accounts. Every POS customer already
   has a shop account; this is where they are invited to set its password. */
export default function ManagementOnlineStoreAccountsPage() {
  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Customer Accounts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Customers sign in to the online shop with the same account as their customer portal.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <ShopInvitesCard />
        </div>
      </div>
    </AppLayout>
  );
}
