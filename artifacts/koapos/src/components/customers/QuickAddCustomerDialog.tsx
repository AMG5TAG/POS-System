import { Customer } from "@workspace/api-client-react";
import { AddCustomerWizard } from "./AddCustomerWizard";

interface QuickAddCustomerDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
  prefillName?: string;
}

export function QuickAddCustomerDialog({
  open,
  onClose,
  onCreated,
  prefillName,
}: QuickAddCustomerDialogProps) {
  return (
    <AddCustomerWizard
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      onCreated={onCreated}
      prefillName={prefillName}
    />
  );
}
