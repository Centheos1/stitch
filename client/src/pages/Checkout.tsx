import { useCart } from "@/hooks/use-cart";
import { useCreateOrder } from "@/hooks/use-orders";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

const checkoutSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email is required"),
  address: z.string().min(10, "Full address is required"),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

export default function Checkout() {
  const [, setLocation] = useLocation();
  const { items, getCartTotal, clearCart } = useCart();
  const createOrder = useCreateOrder();
  const [isSuccess, setIsSuccess] = useState(false);

  const subtotal = getCartTotal(); // in cents
  const shipping = 500; // in cents
  const totalAmount = subtotal + shipping;

  const form = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { name: "", email: "", address: "" },
  });

  if (items.length === 0 && !isSuccess) {
    setLocation("/cart");
    return null;
  }

  if (isSuccess) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <motion.div 
          initial={{ scale: 0 }} 
          animate={{ scale: 1 }} 
          className="text-green-500 mb-6"
        >
          <CheckCircle2 className="h-24 w-24" />
        </motion.div>
        <h1 className="font-display text-4xl font-bold mb-4">Yay! Order Confirmed! 🎉</h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-md">
          Thank you for your purchase. We're packing up your colorful goodies right now!
        </p>
        <Button onClick={() => setLocation("/")} size="lg" className="rounded-2xl h-14 px-8 text-lg font-bold">
          Return Home
        </Button>
      </div>
    );
  }

  const onSubmit = (data: CheckoutFormData) => {
    const orderItems = items.map(item => ({
      productId: item.product.id,
      quantity: item.quantity,
      priceAtTime: item.product.price,
    }));

    createOrder.mutate(
      {
        ...data,
        totalAmount,
        items: orderItems,
      },
      {
        onSuccess: () => {
          clearCart();
          setIsSuccess(true);
        },
      }
    );
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12 min-h-screen">
      <h1 className="font-display text-4xl font-bold mb-10 text-center rainbow-text">Checkout</h1>
      
      <div className="bg-white p-8 sm:p-12 rounded-[3rem] border-2 border-border shadow-xl">
        <div className="mb-10 p-6 bg-primary/5 rounded-2xl border border-primary/20">
          <h3 className="font-display font-bold text-xl mb-4">Order Total: ${(totalAmount / 100).toFixed(2)}</h3>
          <p className="text-sm text-muted-foreground">({items.length} items + $5.00 shipping)</p>
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
                    <Input placeholder="Jane Doe" className="h-14 rounded-xl text-lg bg-background" {...field} />
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
                    <Input placeholder="jane@example.com" type="email" className="h-14 rounded-xl text-lg bg-background" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-semibold">Shipping Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Craft Street, City, Country" className="h-14 rounded-xl text-lg bg-background" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button 
              type="submit" 
              size="lg" 
              className="w-full h-16 rounded-2xl text-lg font-bold mt-8 shadow-lg shadow-primary/25"
              disabled={createOrder.isPending}
            >
              {createOrder.isPending ? (
                <><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Processing...</>
              ) : (
                "Place Order"
              )}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
