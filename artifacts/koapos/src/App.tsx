import { Switch, Route, Redirect } from "wouter";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import LandingPage from "@/pages/marketing/landing";
import LoginPage from "@/pages/marketing/login";
import RegisterPage from "@/pages/marketing/register";
import PricingPage from "@/pages/marketing/pricing";

import DashboardPage from "@/pages/app/dashboard";
import POSPage from "@/pages/app/pos";
import ProductsPage from "@/pages/app/products";
import CustomersPage from "@/pages/app/customers";
import TransactionsPage from "@/pages/app/transactions";
import InventoryPage from "@/pages/app/inventory";
import StaffPage from "@/pages/app/staff";
import ModulesPage from "@/pages/app/modules";
import SettingsPage from "@/pages/app/settings";
import AppointmentsPage from "@/pages/app/appointments";

import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />

      <Route path="/dashboard">
        <ProtectedRoute component={DashboardPage} />
      </Route>
      <Route path="/pos">
        <ProtectedRoute component={POSPage} />
      </Route>
      <Route path="/products">
        <ProtectedRoute component={ProductsPage} />
      </Route>
      <Route path="/customers">
        <ProtectedRoute component={CustomersPage} />
      </Route>
      <Route path="/transactions">
        <ProtectedRoute component={TransactionsPage} />
      </Route>
      <Route path="/inventory">
        <ProtectedRoute component={InventoryPage} />
      </Route>
      <Route path="/appointments">
        <ProtectedRoute component={AppointmentsPage} />
      </Route>
      <Route path="/staff">
        <ProtectedRoute component={StaffPage} />
      </Route>
      <Route path="/modules">
        <ProtectedRoute component={ModulesPage} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={SettingsPage} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Router />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
