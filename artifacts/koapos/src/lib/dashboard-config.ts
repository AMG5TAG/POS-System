import { useState, useEffect } from "react";

export interface DashboardConfig {
  showStatusTiles: boolean;
  showMetricTiles: boolean;
  showOverdueBanner: boolean;
  showNotifications: boolean;
  showServiceJobsPanel: boolean;
  showCalendar: boolean;
}

const DEFAULTS: DashboardConfig = {
  showStatusTiles: true,
  showMetricTiles: true,
  showOverdueBanner: true,
  showNotifications: true,
  showServiceJobsPanel: true,
  showCalendar: true,
};

const KEY = "koapos-dashboard-config";

function load(): DashboardConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function useDashboardConfig() {
  const [config, setConfig] = useState<DashboardConfig>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(config));
    } catch {}
  }, [config]);

  const toggle = (key: keyof DashboardConfig) =>
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));

  return { config, toggle };
}
