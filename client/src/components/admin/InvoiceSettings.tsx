import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoiceTermsSchema } from "@shared/invoice-terms";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const path = "/api/admin/invoice-terms";

function InvoiceTermsForm() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: [path],
    queryFn: async () => invoiceTermsSchema.parse(await (await apiRequest("GET", path)).json()),
  });
  const [draft, setDraft] = useState<string>();
  const [paymentDraft, setPaymentDraft] = useState<string>();
  const paymentDetails = paymentDraft ?? settings.data?.paymentDetails ?? "";
  const days = draft ?? settings.data?.days.toString() ?? "";
  const save = useMutation({
    mutationFn: async () => {
      const terms = invoiceTermsSchema.parse({ days: Number(days), paymentDetails: paymentDraft });
      return invoiceTermsSchema.parse(await (await apiRequest("PUT", path, terms)).json());
    },
    onSuccess: (terms) => {
      queryClient.setQueryData([path], terms);
      setDraft(undefined);
      setPaymentDraft(undefined);
    },
  });

  if (settings.isPending) return <p>Loading invoice settings…</p>;
  if (settings.isError) return <p role="alert">Could not load invoice settings.</p>;

  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <label className="block space-y-1">
        <span>Days after sending</span>
        <Input type="number" min={0} max={365} step={1} required value={days} disabled={save.isPending}
          onChange={(event) => { setDraft(event.target.value); save.reset(); }} />
      </label>
      <label className="block space-y-1">
        <span>Payment details</span>
        <Textarea rows={4} maxLength={1000} value={paymentDetails} disabled={save.isPending}
          placeholder="BSB and account number, or other payment instructions"
          onChange={(event) => { setPaymentDraft(event.target.value); save.reset(); }} />
      </label>
      <Button type="submit" disabled={save.isPending}>Save invoice settings</Button>
      {save.isSuccess && <p role="status">Invoice settings saved.</p>}
      {save.isError && <p role="alert">Could not save invoice settings.</p>}
    </form>
  );
}

export function InvoiceSettings() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl text-muted-foreground">Invoice settings</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>Invoice settings</DialogTitle>
          <DialogDescription>Set the payment terms and instructions added to new invoices.</DialogDescription>
        </DialogHeader>
        <InvoiceTermsForm />
      </DialogContent>
    </Dialog>
  );
}
