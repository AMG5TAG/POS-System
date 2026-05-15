import { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListServiceJobs,
  useDeleteServiceJob,
  ServiceJob,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Wrench,
  Plus,
  Trash2,
  Search,
  Laptop,
  User,
  Calendar,
  AlertTriangle,
  Shield,
  Handshake,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  "in-progress": "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

function statusLabel(s: string) {
  if (s === "in-progress") return "In Progress";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export default function ServiceJobsPage() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const { data: jobsData, isLoading } = useListServiceJobs();
  const deleteMutation = useDeleteServiceJob();

  const jobs = Array.isArray(jobsData) ? jobsData : [];

  const filtered = jobs.filter((j) => {
    const q = search.toLowerCase();
    return (
      j.jobNumber.toLowerCase().includes(q) ||
      (j.customerName ?? "").toLowerCase().includes(q) ||
      (j.deviceType ?? "").toLowerCase().includes(q) ||
      j.status.toLowerCase().includes(q)
    );
  });

  const handleDelete = (job: ServiceJob) => {
    if (!confirm(`Delete service job ${job.jobNumber}?`)) return;
    deleteMutation.mutate(
      { id: job.id },
      {
        onSuccess: () => {
          toast.success("Service job deleted");
          queryClient.invalidateQueries({ queryKey: ["listServiceJobs"] });
        },
        onError: () => toast.error("Failed to delete"),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Services</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {jobs.length} service job{jobs.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link href="/service-jobs/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Service
            </Button>
          </Link>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-muted-foreground">Loading service jobs...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Wrench className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">{search ? "No jobs match your search" : "No service jobs yet"}</p>
              {!search && (
                <p className="text-sm text-muted-foreground mt-1">
                  Click "New Service" to log the first job.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((job) => (
              <Card key={job.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-4 px-5 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">{job.jobNumber}</span>
                      <Badge className={cn("text-[11px] border px-1.5 py-0.5", STATUS_STYLES[job.status] ?? "")}>
                        {statusLabel(job.status)}
                      </Badge>
                      {job.isCritical && (
                        <Badge className="text-[11px] border px-1.5 py-0.5 bg-red-50 text-red-600 border-red-200">
                          <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />Critical
                        </Badge>
                      )}
                      {job.isUnderWarranty && (
                        <Badge className="text-[11px] border px-1.5 py-0.5 bg-blue-50 text-blue-600 border-blue-200">
                          <Shield className="w-2.5 h-2.5 mr-0.5" />Warranty
                        </Badge>
                      )}
                      {job.isPartnerRepair && (
                        <Badge className="text-[11px] border px-1.5 py-0.5 bg-purple-50 text-purple-600 border-purple-200">
                          <Handshake className="w-2.5 h-2.5 mr-0.5" />Partner
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                      {job.customerName && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {job.customerName}
                        </span>
                      )}
                      {job.deviceType && (
                        <span className="flex items-center gap-1">
                          <Laptop className="w-3 h-3" />
                          {job.deviceType}
                          {job.deviceDescription ? ` · ${job.deviceDescription}` : ""}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Book-in: {formatDate(job.bookInDate)}
                      </span>
                    </div>
                    {job.workDescription && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">{job.workDescription}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(job)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
