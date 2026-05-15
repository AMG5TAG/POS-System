import { Link } from "wouter";
import { useListPlans, useListModules } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Check, Package, Wrench, Heart, Calendar, Globe, BarChart3, MapPin, FileText, Gift, Clock, ChefHat } from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Package, Wrench, Heart, Calendar, Globe, BarChart3, MapPin, FileText, Gift, Clock, ChefHat,
};

function ModuleIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICON_MAP[icon] ?? Package;
  return <Icon className={className} />;
}

export default function PricingPage() {
  const { data: plans, isLoading: plansLoading } = useListPlans({ query: { queryKey: ["plans"] } });
  const { data: modules, isLoading: modulesLoading } = useListModules({ query: { queryKey: ["modules"] } });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="KoaPOS" className="w-8 h-8 object-contain" />
            <span className="font-bold text-lg">KoaPOS</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost">Log in</Button>
            </Link>
            <Link href="/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-20 space-y-24">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start free and scale as you grow. Add powerful modules when you need them.
          </p>
        </div>

        {plansLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading plans...</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {plans?.filter((p) => p.slug !== "enterprise").map((plan) => (
              <Card key={plan.id} className={`relative flex flex-col ${plan.isPopular ? "border-primary shadow-lg" : ""}`}>
                {plan.isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge>Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription className="text-sm min-h-[40px]">{plan.description}</CardDescription>
                  <div className="pt-2">
                    <span className="text-3xl font-bold">
                      {plan.priceMonthly === 0 ? "Free" : formatCurrency(plan.priceMonthly)}
                    </span>
                    {plan.priceMonthly > 0 && <span className="text-muted-foreground">/mo</span>}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-4">
                  <ul className="space-y-2 flex-1">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={`/register?plan=${plan.id}`}>
                    <Button className="w-full" variant={plan.isPopular ? "default" : "outline"}>
                      {plan.priceMonthly === 0 ? "Start Free" : "Get Started"}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}

            <Card className="flex flex-col border-dashed">
              <CardHeader>
                <CardTitle>Enterprise</CardTitle>
                <CardDescription className="text-sm min-h-[40px]">
                  Custom pricing for large chains and enterprise deployments.
                </CardDescription>
                <div className="pt-2">
                  <span className="text-3xl font-bold">Custom</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                <ul className="space-y-2 flex-1">
                  {["Everything in Pro", "White-Label Options", "Dedicated Account Manager", "Custom Integrations", "SLA Guarantee"].map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button variant="outline" className="w-full">Contact Sales</Button>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight">Power up with Add-on Modules</h2>
            <p className="text-muted-foreground mt-2">Pay only for what your business needs.</p>
          </div>
          {modulesLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading modules...</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {modules?.map((m) => (
                <div key={m.id} className="flex gap-4 p-4 rounded-lg border bg-card hover:border-primary/40 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <ModuleIcon icon={m.icon} className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm">{m.name}</p>
                      <span className="text-sm font-bold shrink-0">
                        {m.priceMonthly === 0 ? "Free" : `${formatCurrency(m.priceMonthly)}/mo`}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{m.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
