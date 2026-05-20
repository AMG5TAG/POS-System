import { AppLayout } from "@/components/layout/app-layout";
import { useListModules, useGetMySubscription, useGetMyModules, useEnableModule, useDisableModule } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import {
  Package, Wrench, Heart, Calendar, Globe, BarChart3, MapPin, FileText, Gift, Clock, ChefHat,
  Check, Plus, Minus
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Package, Wrench, Heart, Calendar, Globe, BarChart3, MapPin, FileText, Gift, Clock, ChefHat,
};

function ModuleIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICON_MAP[icon] ?? Package;
  return <Icon className={className} />;
}

export default function ModulesPage() {
  const queryClient = useQueryClient();

  const { data: allModules, isLoading: modulesLoading } = useListModules({ query: { queryKey: ["modules"] } });
  const { data: subscription } = useGetMySubscription({ query: { queryKey: ["subscription"] } });
  const { data: enabledModules } = useGetMyModules({ query: { queryKey: ["enabled-modules"] } });

  const enableMutation = useEnableModule();
  const disableMutation = useDisableModule();

  const enabledIds = new Set((enabledModules || []).map((m) => m.id));

  const handleToggle = (moduleId: number, currentlyEnabled: boolean) => {
    if (currentlyEnabled) {
      disableMutation.mutate(
        { moduleId },
        {
          onSuccess: () => {
            toast.success("Module disabled");
            queryClient.invalidateQueries({ queryKey: ["enabled-modules"] });
          },
          onError: () => toast.error("Failed to disable module"),
        }
      );
    } else {
      enableMutation.mutate(
        { moduleId },
        {
          onSuccess: () => {
            toast.success("Module enabled");
            queryClient.invalidateQueries({ queryKey: ["enabled-modules"] });
          },
          onError: () => toast.error("Failed to enable module"),
        }
      );
    }
  };

  const groupedModules = (allModules || []).reduce<Record<string, typeof allModules>>((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category]!.push(m);
    return acc;
  }, {});

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Modules</h1>
          <p className="text-muted-foreground mt-1">Extend KoaPOS with powerful add-ons for your business.</p>
        </div>

        {subscription && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="font-semibold">Current Plan: <span className="text-primary">{subscription.plan?.name}</span></p>
                <p className="text-sm text-muted-foreground">{(enabledModules || []).length} module{(enabledModules || []).length !== 1 ? "s" : ""} enabled</p>
              </div>
              <Badge variant="outline" className="border-primary/30 text-primary">Active</Badge>
            </CardContent>
          </Card>
        )}

        {modulesLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading modules...</div>
        ) : (
          Object.entries(groupedModules).map(([category, modules]) => (
            <div key={category} className="space-y-4">
              <h2 className="text-lg font-semibold">{category}</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {modules?.map((module) => {
                  const isEnabled = enabledIds.has(module.id);
                  const isPending = enableMutation.isPending || disableMutation.isPending;
                  return (
                    <Card key={module.id} className={`transition-all ${isEnabled ? "border-primary/40 shadow-sm" : ""}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isEnabled ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            <ModuleIcon icon={module.icon} className="w-5 h-5" />
                          </div>
                          {isEnabled && (
                            <Badge variant="default" className="gap-1 shrink-0">
                              <Check className="w-3 h-3" /> Enabled
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-base mt-3">{module.name}</CardTitle>
                        <CardDescription className="text-sm">{module.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-lg">
                            {module.priceMonthly === 0 ? "Free" : `${formatCurrency(module.priceMonthly)}/mo`}
                          </span>
                          <Button
                            size="sm"
                            variant={isEnabled ? "outline" : "default"}
                            onClick={() => handleToggle(module.id, isEnabled)}
                            disabled={isPending}
                          >
                            {isEnabled ? (
                              <><Minus className="w-4 h-4 mr-1" /> Disable</>
                            ) : (
                              <><Plus className="w-4 h-4 mr-1" /> Enable</>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </AppLayout>
  );
}
