import { useState } from "react";
import type { Customer } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { exportVCard, exportGoogleCSV, exportOutlookCSV, exportGenericCSV } from "@/lib/contacts-export";
import { Download, ExternalLink, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type Format = "vcf" | "google" | "outlook" | "csv";

interface FormatOption {
  id: Format;
  label: string;
  badge: string;
  badgeColor: string;
  description: string;
  works: string[];
  importUrl: string;
  importLabel: string;
  steps: string[];
  icon: string;
}

const FORMATS: FormatOption[] = [
  {
    id: "vcf",
    label: "vCard",
    badge: ".vcf",
    badgeColor: "bg-blue-100 text-blue-700 border-blue-200",
    description: "Universal contact card format. Works with every major contact app.",
    works: ["Outlook", "Apple Contacts", "iCloud", "Google Contacts", "Samsung Contacts", "Android"],
    importUrl: "https://contacts.google.com",
    importLabel: "Open Google Contacts",
    icon: "👤",
    steps: [
      'Download the .vcf file below.',
      'Open your contacts app (Outlook, Apple Contacts, iCloud, etc.).',
      'Look for "Import" or drag the .vcf file into the app.',
      'Confirm the import — done!',
    ],
  },
  {
    id: "google",
    label: "Google Contacts",
    badge: "CSV",
    badgeColor: "bg-green-100 text-green-700 border-green-200",
    description: "Formatted for Google's import wizard. Preserves groups and all fields.",
    works: ["Google Contacts", "Google Workspace"],
    importUrl: "https://contacts.google.com/u/0/directory/import",
    importLabel: "Open Google Contacts Import",
    icon: "🟢",
    steps: [
      'Download the Google CSV file below.',
      'Go to Google Contacts → Import (use the button above).',
      'Select the downloaded CSV file and click Import.',
      'Customers appear in your Google Contacts immediately.',
    ],
  },
  {
    id: "outlook",
    label: "Outlook / Microsoft 365",
    badge: "CSV",
    badgeColor: "bg-sky-100 text-sky-700 border-sky-200",
    description: "Formatted for Outlook's contact import. Works with desktop and web.",
    works: ["Outlook Desktop", "Outlook Web", "Microsoft 365", "Exchange"],
    importUrl: "https://outlook.live.com/people",
    importLabel: "Open Outlook Contacts",
    icon: "🔵",
    steps: [
      'Download the Outlook CSV file below.',
      'Open Outlook → People → Manage → Import contacts.',
      'Select "Comma Separated Values (.csv)" and choose the file.',
      'Map fields and finish the import.',
    ],
  },
  {
    id: "csv",
    label: "Generic CSV",
    badge: "CSV",
    badgeColor: "bg-gray-100 text-gray-700 border-gray-200",
    description: "All customer fields in a spreadsheet-friendly format. Import into any CRM or database.",
    works: ["HubSpot", "Salesforce", "Zoho CRM", "Excel", "Notion", "Airtable", "Any CRM"],
    importUrl: "",
    importLabel: "",
    icon: "📊",
    steps: [
      'Download the CSV file below.',
      'Open your CRM or spreadsheet app.',
      'Use their import feature and map the columns.',
      'All customer data including loyalty points and spend history is included.',
    ],
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
}

export function ContactSyncDialog({ open, onOpenChange, customers }: Props) {
  const [expanded, setExpanded] = useState<Format | null>(null);
  const [downloaded, setDownloaded] = useState<Set<Format>>(new Set());

  const doExport = (format: Format) => {
    const count = customers.length;
    if (count === 0) { toast.error("No customers to export"); return; }

    if (format === "vcf") exportVCard(customers);
    else if (format === "google") exportGoogleCSV(customers);
    else if (format === "outlook") exportOutlookCSV(customers);
    else exportGenericCSV(customers);

    setDownloaded((prev) => new Set(prev).add(format));
    toast.success(`Exported ${count} customer${count !== 1 ? "s" : ""}`);
  };

  const toggle = (id: Format) => setExpanded((p) => p === id ? null : id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Sync Customers to Contacts</DialogTitle>
          <DialogDescription>
            Export your {customers.length} customer{customers.length !== 1 ? "s" : ""} to any contact platform. Download a file and import it — no account linking required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          {FORMATS.map((fmt) => {
            const isOpen = expanded === fmt.id;
            const done = downloaded.has(fmt.id);

            return (
              <div key={fmt.id} className={`rounded-xl border transition-all ${isOpen ? "border-primary/40 shadow-sm" : "border-border"}`}>
                {/* Header row */}
                <button
                  className="w-full flex items-center gap-3 p-4 text-left"
                  onClick={() => toggle(fmt.id)}
                >
                  <span className="text-2xl w-8 text-center shrink-0">{fmt.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{fmt.label}</span>
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded border font-medium ${fmt.badgeColor}`}>{fmt.badge}</span>
                      {done && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{fmt.description}</p>
                  </div>
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div className="px-4 pb-4 space-y-4 border-t bg-muted/20">
                    <div className="pt-3 space-y-3">
                      {/* Works with */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Works with</p>
                        <div className="flex flex-wrap gap-1.5">
                          {fmt.works.map((w) => (
                            <Badge key={w} variant="secondary" className="text-xs font-normal">{w}</Badge>
                          ))}
                        </div>
                      </div>

                      <Separator />

                      {/* Steps */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">How to import</p>
                        <ol className="space-y-1.5">
                          {fmt.steps.map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                              <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">{i + 1}</span>
                              {s}
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => doExport(fmt.id)}
                        >
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          Download {fmt.id === "vcf" ? ".vcf" : "CSV"}
                          <span className="ml-1.5 opacity-70 text-[10px]">({customers.length})</span>
                        </Button>
                        {fmt.importUrl && (
                          <Button
                            size="sm"
                            variant="outline"
                            asChild
                          >
                            <a href={fmt.importUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5">
                              <ExternalLink className="w-3.5 h-3.5" />
                              {fmt.importLabel}
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground text-center pt-2">
          Exports include all {customers.length} loaded customers. Use the search filter on the customers page to export a subset.
        </p>
      </DialogContent>
    </Dialog>
  );
}
