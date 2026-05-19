import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type FieldType =
  | "short_answer"
  | "long_answer"
  | "yes_no"
  | "date"
  | "time"
  | "email"
  | "phone"
  | "number"
  | "signature"
  | "file_upload"
  | "multiple_choice"
  | "dropdown"
  | "section_header"
  | "divider";

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  options?: string[];
  quickCode?: string;
}

export interface FormTemplate {
  id: number;
  merchantId: number;
  name: string;
  description: string | null;
  fields: FormField[];
  createdAt: string;
  updatedAt: string;
}

export interface FormSubmission {
  id: number;
  merchantId: number;
  formId: number;
  customerId: number | null;
  sourceType: string | null;
  sourceId: number | null;
  staffId: number | null;
  data: Record<string, unknown>;
  createdAt: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "request failed");
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ── Forms ─────────────────────────────────────────────────────────────────

export function useListForms() {
  return useQuery<FormTemplate[]>({
    queryKey: ["forms"],
    queryFn: () => apiFetch<FormTemplate[]>("/forms"),
  });
}

export function useGetForm(id: number | null) {
  return useQuery<FormTemplate>({
    queryKey: ["forms", id],
    queryFn: () => apiFetch<FormTemplate>(`/forms/${id}`),
    enabled: id != null,
  });
}

export function useCreateForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; fields?: FormField[] }) =>
      apiFetch<FormTemplate>("/forms", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forms"] }),
  });
}

export function useUpdateForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; description?: string; fields?: FormField[] }) =>
      apiFetch<FormTemplate>(`/forms/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forms"] }),
  });
}

export function useDeleteForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<{ success: boolean }>(`/forms/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forms"] }),
  });
}

// ── Form Submissions ──────────────────────────────────────────────────────

export interface SubmissionFilters {
  formId?: number;
  customerId?: number;
  sourceType?: string;
  sourceId?: number;
}

export function useListFormSubmissions(filters?: SubmissionFilters) {
  const params = new URLSearchParams();
  if (filters?.formId)     params.set("formId",     String(filters.formId));
  if (filters?.customerId) params.set("customerId", String(filters.customerId));
  if (filters?.sourceType) params.set("sourceType", filters.sourceType);
  if (filters?.sourceId)   params.set("sourceId",   String(filters.sourceId));
  const qs = params.toString();
  return useQuery<FormSubmission[]>({
    queryKey: ["form-submissions", filters],
    queryFn: () => apiFetch<FormSubmission[]>(`/form-submissions${qs ? `?${qs}` : ""}`),
    enabled: Object.keys(filters ?? {}).length > 0,
  });
}

export function useCreateFormSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      formId: number;
      customerId?: number;
      sourceType?: string;
      sourceId?: number;
      staffId?: number;
      data: Record<string, unknown>;
    }) =>
      apiFetch<FormSubmission>("/form-submissions", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-submissions"] }),
  });
}

export function useDeleteFormSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ success: boolean }>(`/form-submissions/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-submissions"] }),
  });
}

// ── Quick Codes ───────────────────────────────────────────────────────────

export const QUICK_CODES = [
  { code: "{{customer.firstName}}", label: "Customer First Name" },
  { code: "{{customer.lastName}}",  label: "Customer Last Name"  },
  { code: "{{customer.fullName}}",  label: "Customer Full Name"  },
  { code: "{{customer.email}}",     label: "Customer Email"      },
  { code: "{{customer.phone}}",     label: "Customer Phone"      },
  { code: "{{business.name}}",      label: "Business Name"       },
  { code: "{{business.phone}}",     label: "Business Phone"      },
  { code: "{{business.email}}",     label: "Business Email"      },
  { code: "{{business.address}}",   label: "Business Address"    },
  { code: "{{date.today}}",         label: "Today's Date"        },
  { code: "{{date.time}}",          label: "Current Time"        },
] as const;

export function resolveQuickCodes(
  text: string | undefined,
  ctx: Record<string, string>,
): string {
  if (!text) return "";
  return text.replace(/\{\{(\w+\.\w+)\}\}/g, (_, key: string) => ctx[key] ?? `{{${key}}}`);
}

export function buildQuickCodeContext(
  customer?: { firstName?: string; lastName?: string; email?: string; phone?: string } | null,
  business?: { name?: string; phone?: string; email?: string; address?: string } | null,
): Record<string, string> {
  const today = new Date();
  return {
    "customer.firstName": customer?.firstName ?? "",
    "customer.lastName":  customer?.lastName  ?? "",
    "customer.fullName":  [customer?.firstName, customer?.lastName].filter(Boolean).join(" "),
    "customer.email":     customer?.email     ?? "",
    "customer.phone":     customer?.phone     ?? "",
    "business.name":      business?.name      ?? "",
    "business.phone":     business?.phone     ?? "",
    "business.email":     business?.email     ?? "",
    "business.address":   business?.address   ?? "",
    "date.today":         today.toLocaleDateString("en-AU"),
    "date.time":          today.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }),
  };
}
