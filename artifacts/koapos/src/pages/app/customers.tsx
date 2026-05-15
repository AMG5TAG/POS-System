import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  Customer,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Search, Plus, Pencil, Trash2, Users, Star } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type CustomerForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

const defaultForm: CustomerForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(defaultForm);

  const { data: customersData, isLoading } = useListCustomers(
    { search: search || undefined, limit: 100 },
    { query: { queryKey: ["customers", search] } }
  );

  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();
  const deleteMutation = useDeleteCustomer();

  const customers = customersData?.items || [];

  const openCreate = () => {
    setEditingCustomer(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditingCustomer(c);
    setForm({
      firstName: c.firstName || "",
      lastName: c.lastName || "",
      email: c.email || "",
      phone: c.phone || "",
      address: c.address || "",
      notes: c.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const payload = {
      firstName: form.firstName || undefined,
      lastName: form.lastName || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      notes: form.notes || undefined,
    };

    if (editingCustomer) {
      updateMutation.mutate(
        { id: editingCustomer.id, data: payload },
        {
          onSuccess: () => {
            toast.success("Customer updated");
            setDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ["customers"] });
          },
          onError: () => toast.error("Failed to update customer"),
        }
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast.success("Customer added");
            setDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ["customers"] });
          },
          onError: () => toast.error("Failed to add customer"),
        }
      );
    }
  };

  const handleDelete = () => {
    if (!deletingCustomer) return;
    deleteMutation.mutate(
      { id: deletingCustomer.id },
      {
        onSuccess: () => {
          toast.success("Customer deleted");
          setDeleteDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["customers"] });
        },
        onError: () => toast.error("Failed to delete customer"),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Customers</h1>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Add Customer
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading customers...</div>
        ) : customers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Users className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No customers yet</p>
                <p className="text-muted-foreground text-sm">Add customers to track their purchases and loyalty.</p>
              </div>
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" /> Add Customer
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-medium">Customer</th>
                  <th className="text-left p-4 font-medium hidden md:table-cell">Contact</th>
                  <th className="text-right p-4 font-medium hidden sm:table-cell">Total Spent</th>
                  <th className="text-right p-4 font-medium hidden lg:table-cell">Visits</th>
                  <th className="text-right p-4 font-medium hidden lg:table-cell">Points</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {customers.map((customer) => (
                  <tr key={customer.id} className="bg-background hover:bg-muted/30 transition-colors">
                    <td className="p-4">
                      <div>
                        <p className="font-medium">
                          {[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">Since {formatDate(customer.createdAt)}</p>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <div className="space-y-0.5">
                        {customer.email && <p className="text-xs">{customer.email}</p>}
                        {customer.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
                      </div>
                    </td>
                    <td className="p-4 text-right hidden sm:table-cell font-medium">
                      {formatCurrency(customer.totalSpent)}
                    </td>
                    <td className="p-4 text-right hidden lg:table-cell">{customer.visitCount}</td>
                    <td className="p-4 text-right hidden lg:table-cell">
                      <span className="flex items-center justify-end gap-1">
                        <Star className="w-3 h-3 text-yellow-500" />
                        {customer.loyaltyPoints}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(customer)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => { setDeletingCustomer(customer); setDeleteDialogOpen(true); }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div>
              <Label>First Name</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Jane" />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Smith" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@example.com" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+61 400 000 000" />
            </div>
            <div className="sm:col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St, Sydney NSW" />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about this customer..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingCustomer ? "Save Changes" : "Add Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete{" "}
            <strong>{[deletingCustomer?.firstName, deletingCustomer?.lastName].filter(Boolean).join(" ") || "this customer"}</strong>?
            This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
