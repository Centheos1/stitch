import { cartLineKey, unitPrice, useCart } from "@/hooks/use-cart";
import { useCreateOrder } from "@/hooks/use-orders";
import { toast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/layout/BackLink";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { australianPostcodeSchema, FLAT_SHIPPING_RATE_CENTS, freeDeliverySuburbsSchema } from "@shared/schema";
import { orderQuoteResponse, type OrderInput } from "@shared/routes";
import { useMutation, useQuery } from "@tanstack/react-query";

const australianStates = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

const checkoutSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email is required"),
  street: z.string().trim().min(1, "Street address is required").max(120),
  unit: z.string().trim().max(80),
  suburb: z.string().trim().min(1, "Suburb or town is required").max(80),
  state: z.string().refine((value) => australianStates.includes(value), "Select a state or territory."),
  shippingPostcode: australianPostcodeSchema,
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

function formatShippingAddress({ street, unit, suburb, state }: CheckoutFormData) {
  return [unit.trim(), street.trim(), `${suburb.trim()} ${state}`, "Australia"].filter(Boolean).join(", ");
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function CheckoutBackLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
      <BackLink href={href} label={label} />
    </div>
  );
}

function FreeDeliverySuburbs() {
  const [open, setOpen] = useState(false);
  const path = "/api/shipping/free-delivery-suburbs";
  const suburbs = useQuery({
    queryKey: [path],
    enabled: open,
    select: (names) => [...names].sort((a, b) => a.localeCompare(b, "en-AU", { sensitivity: "base" })),
    queryFn: async () => {
      const response = await fetch(path);
      if (!response.ok) throw new Error("Could not load the suburb list.");
      return freeDeliverySuburbsSchema.parse(await response.json());
    },
  });

  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="text-sm text-muted-foreground">
      <summary className="cursor-pointer underline underline-offset-2">Free delivery to listed suburbs.</summary>
      {open && (
        suburbs.isPending ? <p role="status" className="mt-2">Loading suburbs…</p>
          : suburbs.isError ? <p role="status" className="mt-2">The suburb list is unavailable.</p>
          : suburbs.data.length ? (
            <ul className="mt-2 space-y-1">
              {suburbs.data.map((name) => <li key={name}>{name}</li>)}
            </ul>
          ) : <p className="mt-2">No suburbs have been listed yet.</p>
      )}
    </details>
  );
}

export default function Checkout() {
  const { items, getCartTotal, clearCart } = useCart();
  const createOrder = useCreateOrder();
  const { isSuccess } = createOrder;

  useEffect(() => {
    if (isSuccess) {
      clearCart();
    }
  }, [isSuccess, clearCart]);

  const subtotal = getCartTotal(); // in cents
  const [quoted, setQuoted] = useState<{ key: string; rate: z.infer<typeof orderQuoteResponse> }>();
  const shippingQuote = useMutation({
    mutationFn: async (input: Omit<OrderInput, "expectedTotal" | "expectedShipping">) => {
      const response = await fetch("/api/orders/shipping-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Could not verify the order total.");
      return orderQuoteResponse.parse(result);
    },
  });

  const form = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { name: "", email: "", street: "", unit: "", suburb: "", state: "", shippingPostcode: "" },
  });

  const orderItems = items.map((item) => ({
    productId: item.product.id,
    quantity: item.quantity,
    options: item.options ?? [],
  }));
  const values = form.watch();
  const quoteKey = (data: CheckoutFormData) => JSON.stringify([formatShippingAddress(data), data.shippingPostcode.trim(), orderItems]);
  const rate = quoted?.key === quoteKey(values) ? quoted.rate : undefined;
  const busy = form.formState.isSubmitting || createOrder.isPending || shippingQuote.isPending;

  if (isSuccess) {
    return (
      <>
        <CheckoutBackLink href="/shop" label="Back to shop" />
        <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-green-500 mb-6"
          >
            <CheckCircle2 className="h-24 w-24" />
          </motion.div>
          <h1 className="font-display text-4xl font-bold mb-4">Order received</h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-md">
            An invoice for your order will be emailed to the address given within four business days.
          </p>
          <Button asChild size="lg" className="rounded-2xl h-14 px-8 text-lg font-bold">
            <Link href="/">Return Home</Link>
          </Button>
        </div>
      </>
    );
  }

  if (items.length === 0) {
    return <Redirect to="/cart" replace />;
  }

  const onSubmit = async (data: CheckoutFormData) => {
    if (createOrder.isPending || shippingQuote.isPending) return;
    const input = {
      name: data.name,
      email: data.email,
      address: formatShippingAddress(data),
      shippingPostcode: data.shippingPostcode,
      items: orderItems,
    };
    try {
      const currentRate = rate ?? await shippingQuote.mutateAsync(input);
      if (!rate && (currentRate.totalAmount !== subtotal + FLAT_SHIPPING_RATE_CENTS ||
        items.some((item, index) => currentRate.unitPrices[index] !== unitPrice(item.product, item.options ?? [])))) {
        setQuoted({ key: quoteKey(data), rate: currentRate });
        toast({ title: "Order prices updated", description: "Check the updated prices, then select Order to submit." });
        return;
      }
      await createOrder.mutateAsync({ ...input, expectedTotal: currentRate.totalAmount, expectedShipping: currentRate.shippingAmount });
    } catch (error) {
      setQuoted(undefined);
      toast({
        variant: "destructive",
        title: "Couldn’t submit your order request",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  return (
    <>
      <CheckoutBackLink href="/cart" label="Back to cart" />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pb-12 pt-4 min-h-screen">
        <h1 className="font-display text-4xl font-bold mb-10 text-center text-black">Checkout</h1>

        <div className="bg-white p-5 sm:p-12 rounded-[3rem] border-2 border-border shadow-xl">
          <div className="mb-10">
            <section aria-labelledby="invoice-heading" className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-6">
              <h2 id="invoice-heading" className="font-display text-xl font-bold">Order</h2>
              <ul className="mt-4 divide-y divide-border">
                {items.map((item, index) => {
                  const options = item.options ?? [];
                  const price = rate?.unitPrices[index] ?? unitPrice(item.product, options);
                  return (
                    <li key={cartLineKey(item)} className="flex justify-between gap-4 py-3">
                      <div className="min-w-0 break-words">
                        <p className="font-semibold">{item.product.name}</p>
                        {options.length > 0 && (
                          <p className="text-sm text-muted-foreground">
                            {options.map((option) => `${option.name}: ${option.choice}`).join(", ")}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {item.quantity} × {formatPrice(price)}
                        </p>
                      </div>
                      <span className="whitespace-nowrap font-medium tabular-nums">{formatPrice(price * item.quantity)}</span>
                    </li>
                  );
                })}
              </ul>
              <dl className="space-y-2 border-t border-border pt-3 tabular-nums">
                <div className="flex justify-between gap-4">
                  <dt>Subtotal</dt>
                  <dd>{formatPrice(rate?.subtotal ?? subtotal)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Shipping</dt>
                  <dd className="text-right">
                    {formatPrice(FLAT_SHIPPING_RATE_CENTS)}
                    <FreeDeliverySuburbs />
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-border pt-3 text-lg font-bold">
                  <dt>Total</dt>
                  <dd>{formatPrice(rate?.totalAmount ?? subtotal + FLAT_SHIPPING_RATE_CENTS)}</dd>
                </div>
              </dl>
            </section>
            <p className="mt-4 px-2 text-sm leading-relaxed text-muted-foreground">
              As all items are handmade, items may vary in size and colouring. We do our best to keep everything as similar as possible. This variance is what makes each item unique and gives it character.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Doe" autoComplete="name" className="h-14 rounded-xl text-lg bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Email Address</FormLabel>
                    <FormControl>
                      <Input placeholder="jane@example.com" type="email" autoComplete="email" className="h-14 rounded-xl text-lg bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <fieldset className="space-y-4">
                <legend className="mb-2 text-base font-semibold">Shipping address</legend>
                {([
                  { name: "street", label: "Street address", placeholder: "123 Craft Street", autoComplete: "address-line1", maxLength: 120 },
                  { name: "unit", label: "Unit or apartment (optional)", placeholder: "Unit 4", autoComplete: "address-line2", maxLength: 80 },
                  { name: "suburb", label: "Suburb or town", placeholder: "Sydney", autoComplete: "address-level2", maxLength: 80 },
                ] as const).map(({ name, label, placeholder, autoComplete, maxLength }) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{label}</FormLabel>
                        <FormControl>
                          <Input placeholder={placeholder} autoComplete={autoComplete} maxLength={maxLength}
                            className="h-14 rounded-xl bg-background text-lg" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State or territory</FormLabel>
                      <Select name={field.name} value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger ref={field.ref} onBlur={field.onBlur} className="h-14 rounded-xl text-base md:text-sm">
                            <SelectValue placeholder="Select a state or territory" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-background">
                          {australianStates.map((state) => (
                            <SelectItem key={state} value={state} className="focus:bg-[var(--stitch-green)] focus:text-foreground">
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shippingPostcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Australian delivery postcode</FormLabel>
                      <FormControl>
                        <Input inputMode="numeric" autoComplete="postal-code" maxLength={4}
                          className="h-14 rounded-xl bg-background text-lg" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </fieldset>

              <Button
                type="submit"
                size="lg"
                className="w-full h-16 rounded-2xl border-green-700 bg-green-700 text-lg font-bold text-white mt-8 shadow-lg shadow-green-700/25 focus-visible:ring-green-700"
                disabled={busy}
              >
                {busy ? (
                  <><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Sending request…</>
                ) : "Order"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </>
  );
}
