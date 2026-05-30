import { useGetActiveSalesTemplates } from "@workspace/api-client-react";
import { DEFAULT_OPTS, type TplOpts } from "@/pages/app/management-templates";

export type SalesTemplateType = "Thermal_Receipt" | "Invoice" | "Quote" | "Service_Ticket" | "A4_Receipt";

export const FONT_CSS: Record<string, string> = {
  inter:   "Inter, system-ui, sans-serif",
  roboto:  "Roboto, 'Helvetica Neue', sans-serif",
  lato:    "Lato, 'Helvetica Neue', sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  courier: "'Courier New', Courier, monospace",
};

export interface SalesTemplateResult {
  opts: TplOpts;
  fontFamily: string;
  fontCss: string;
  /** Stored layout selection (e.g. `ar-pro`, `ar-modern`, `ar-minimal`, or legacy `professional`). */
  selectedStyle: string;
  isLoading: boolean;
}

export function useSalesTemplate(type: SalesTemplateType): SalesTemplateResult {
  const { data, isLoading } = useGetActiveSalesTemplates({
    query: { queryKey: ["sales-templates-active"], staleTime: 60_000 },
  });

  const row = data?.items.find((t) => t.templateType === type);

  if (!row) {
    return {
      opts: { ...DEFAULT_OPTS },
      fontFamily: "inter",
      fontCss: FONT_CSS.inter,
      selectedStyle: "professional",
      isLoading,
    };
  }

  const saved = (row.options ?? {}) as Partial<TplOpts>;
  const fontFamily = row.fontFamily ?? "inter";
  const opts: TplOpts = {
    ...DEFAULT_OPTS,
    ...saved,
    headerText: row.headerHtml ?? "",
    footerText: row.footerHtml ?? "",
    showLogo: row.showLogo ?? true,
    fontFamily,
  };

  return {
    opts,
    fontFamily,
    fontCss: FONT_CSS[fontFamily] ?? FONT_CSS.inter,
    selectedStyle: row.selectedStyle || "professional",
    isLoading,
  };
}
