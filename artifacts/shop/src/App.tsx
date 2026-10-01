import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import { useEffect } from "react";
import { CartProvider } from "@/lib/cart";
import { AuthProvider } from "@/lib/auth";
import { useShopInfo } from "@/lib/shop";
import { Layout } from "@/components/Layout";
import Home from "@/pages/Home";
import Catalog from "@/pages/Catalog";
import Product from "@/pages/Product";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Forgot from "@/pages/Forgot";
import SetPassword from "@/pages/SetPassword";
import Account from "@/pages/Account";
import Wishlist from "@/pages/Wishlist";
import Rewards from "@/pages/Rewards";
import MailIn from "@/pages/MailIn";
import MailInTrack from "@/pages/MailInTrack";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function Title() {
  const { data } = useShopInfo();
  useEffect(() => { if (data?.businessName) document.title = `${data.businessName} — Shop`; }, [data?.businessName]);
  return null;
}

/* Served under /shop on koastal.com.au (and in development). */
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <Router base={base}>
            <Title />
            <Layout>
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/products" component={Catalog} />
                <Route path="/product/:id" component={Product} />
                <Route path="/cart" component={Cart} />
                <Route path="/checkout" component={Checkout} />
                <Route path="/account/login" component={Login} />
                <Route path="/account/register" component={Register} />
                <Route path="/account/forgot" component={Forgot} />
                <Route path="/account/set-password" component={SetPassword} />
                <Route path="/account" component={Account} />
                <Route path="/wishlist" component={Wishlist} />
                <Route path="/rewards" component={Rewards} />
                <Route path="/mail-in" component={MailIn} />
                <Route path="/mail-in/track/:token" component={MailInTrack} />
                <Route component={NotFound} />
              </Switch>
            </Layout>
          </Router>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
