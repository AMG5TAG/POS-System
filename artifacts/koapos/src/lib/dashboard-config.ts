import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboardConfig,
  useUpsertDashboardConfig,
  getGetDashboardConfigQueryKey,
  type DashboardConfigResponse,
} from "@workspace/api-client-react";

export type DashboardConfig = {
  showStatusTiles: boolean;
  showMetricTiles: boolean;
  showOverdueBanner: boolean;
  showNotifications: boolean;
  showServiceJobsPanel: boolean;
  showCalendar: boolean;
  showReferralRevenue: boolean;
};

const DEFAULTS: DashboardConfig = {
  showStatusTiles: true,
  showMetricTiles: true,
  showOverdueBanner: true,
  showNotifications: true,
  showServiceJobsPanel: true,
  showCalendar: true,
  showReferralRevenue: true,
};

function toConfig(data: DashboardConfigResponse | undefined): DashboardConfig {
  if (!data) return DEFAULTS;
  return {
    showStatusTiles: data.showStatusTiles,
    showMetricTiles: data.showMetricTiles,
    showOverdueBanner: data.showOverdueBanner,
    showNotifications: data.showNotifications,
    showServiceJobsPanel: data.showServiceJobsPanel,
    showCalendar: data.showCalendar,
    showReferralRevenue: data.showReferralRevenue,
  };
}

export function useDashboardConfig() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetDashboardConfig();
  const { mutate } = useUpsertDashboardConfig();

  const config = toConfig(data);

  const toggle = useCallback(
    (key: keyof DashboardConfig) => {
      const current = toConfig(data);
      const next = { ...current, [key]: !current[key] };

      queryClient.setQueryData(getGetDashboardConfigQueryKey(), (old: DashboardConfigResponse | undefined) =>
        old ? { ...old, [key]: !old[key] } : old
      );

      mutate(
        { data: next },
        {
          onError: () => {
            queryClient.setQueryData(getGetDashboardConfigQueryKey(), data);
          },
        }
      );
    },
    [data, mutate, queryClient]
  );

  const reset = useCallback(() => {
    queryClient.setQueryData(getGetDashboardConfigQueryKey(), (old: DashboardConfigResponse | undefined) =>
      old ? { ...old, ...DEFAULTS } : old
    );

    mutate(
      { data: DEFAULTS },
      {
        onError: () => {
          queryClient.setQueryData(getGetDashboardConfigQueryKey(), data);
        },
      }
    );
  }, [data, mutate, queryClient]);

  return { config, toggle, reset, isLoading };
}
