import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { FLAT_SHIPPING_RATE_CENTS, shippingSettingsSchema } from "@shared/schema";

const path = "/api/admin/shipping";

function ShippingSettingsForm() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: [path],
    queryFn: async () => shippingSettingsSchema.parse(await (await apiRequest("GET", path)).json()),
  });
  const [suburbsDraft, setSuburbsDraft] = useState<string>();
  const suburbs = suburbsDraft ?? settings.data?.freeDeliverySuburbs.join("\n") ?? "";
  const save = useMutation({
    mutationFn: async () => {
      const input = shippingSettingsSchema.safeParse({
        rateCents: FLAT_SHIPPING_RATE_CENTS,
        freeDeliverySuburbs: suburbs.split(/\r?\n/).map((name) => name.trim()).filter(Boolean),
      });
      if (!input.success) throw new Error("Enter up to 200 suburb names, each up to 80 characters.");
      const result = await apiRequest("PUT", path, input.data);
      return shippingSettingsSchema.parse(await result.json());
    },
    onSuccess: (saved) => {
      queryClient.setQueryData([path], saved);
      setSuburbsDraft(undefined);
      void queryClient.invalidateQueries({ queryKey: ["/api/shipping/free-delivery-suburbs"] });
    },
  });

  if (settings.isPending) return <p>Loading shipping settings…</p>;
  if (settings.isError) return <p role="alert">Could not load shipping settings.</p>;

  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <label className="block space-y-1">
        <span>Free delivery suburbs</span>
        <Textarea rows={5} disabled={save.isPending} placeholder="One suburb per line" value={suburbs}
          onChange={(event) => { setSuburbsDraft(event.target.value); save.reset(); }} />
      </label>
      <Button type="submit" disabled={save.isPending}>Save shipping settings</Button>
      {save.isSuccess && <p role="status" className="text-sm">Shipping settings saved.</p>}
      {save.isError && <p role="alert" className="text-sm">{save.error.message.startsWith("Enter") ? save.error.message : "Could not save shipping settings."}</p>}
    </form>
  );
}

export function ShippingSettings() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl text-muted-foreground">Shipping settings</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>Shipping settings</DialogTitle>
          <DialogDescription>Shipping is a flat ${(FLAT_SHIPPING_RATE_CENTS / 100).toFixed(2)} AUD per order. Edit the free local delivery suburbs shown at checkout.</DialogDescription>
        </DialogHeader>
        <ShippingSettingsForm />
      </DialogContent>
    </Dialog>
  );
}
