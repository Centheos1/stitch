import { Link, useLocation } from "wouter";
import { cartLineKey, unitPrice, useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { useState } from "react";

function EditableQuantity({
  lineKey,
  quantity,
  updateQuantity,
}: {
  lineKey: string;
  quantity: number;
  updateQuantity: (lineKey: string, quantity: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(String(quantity));

  const save = () => {
    const nextQuantity = Number(value);
    if (Number.isInteger(nextQuantity) && nextQuantity >= 1) {
      updateQuantity(lineKey, nextQuantity);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoFocus
        aria-label="Item quantity"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className="h-8 w-12 rounded-md border-0 bg-transparent p-0 text-center font-bold focus-visible:ring-2"
      />
    );
  }

  return (
    <div
      className="w-10 cursor-text text-center font-bold"
      title="Double-click to edit quantity"
      onDoubleClick={() => {
        setValue(String(quantity));
        setIsEditing(true);
      }}
    >
      {quantity}
    </div>
  );
}

export default function Cart() {
  const [, setLocation] = useLocation();
  const { items, updateQuantity, removeItem, getCartTotal } = useCart();

  if (items.length === 0) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <div className="h-32 w-32 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
          <ShoppingBag className="h-16 w-16" />
        </div>
        <h1 className="font-display text-4xl font-bold mb-4">Your cart is empty</h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-md">
          Looks like you haven't added any colourful creations to your cart yet.
        </p>
        <Link href="/shop">
          <Button size="lg" className="rounded-2xl h-14 px-8 text-lg font-bold shadow-lg shadow-primary/20">
            Start Shopping
          </Button>
        </Link>
      </div>
    );
  }

  const subtotal = getCartTotal() / 100;
  const shipping = 5.00; // Flat shipping rate
  const total = subtotal + shipping;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 min-h-screen">
      <h1 className="font-display text-4xl font-bold mb-10">Your Cart ({items.length} items)</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-6">
          {items.map((item) => {
            const key = cartLineKey({ ...item, options: item.options ?? [] });
            const price = unitPrice(item.product, item.options ?? []);
            return (
            <div 
              key={key} 
              className="flex flex-col sm:flex-row bg-white p-4 rounded-3xl border border-border shadow-sm gap-6 items-center"
            >
              <div
                className="w-full sm:w-32 h-32 flex-shrink-0 rounded-2xl overflow-hidden"
                style={{ backgroundColor: item.product.imageBackgroundColor ?? "#ffffff" }}
              >
                <img
                  src={item.product.imageUrls?.[0] ?? ""}
                  alt={item.product.name}
                  className="w-full h-full object-contain"
                  style={{ backgroundColor: item.product.imageBackgroundColor ?? "#ffffff" }}
                />
              </div>
              
              <div className="flex-1 w-full flex flex-col justify-center">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-display text-xl font-bold">{item.product.name}</h3>
                  <span className="font-display font-bold text-lg">${(price / 100).toFixed(2)}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-1">{item.product.category}</p>
                {(item.options ?? []).length > 0 && (
                  <p className="text-sm text-muted-foreground mb-4">
                    {(item.options ?? []).map((option) => `${option.name}: ${option.choice}`).join(" · ")}
                  </p>
                )}
                
                <div className="flex items-center justify-between mt-auto">
                  <div className="flex items-center bg-background rounded-xl border border-border overflow-hidden">
                    <button 
                      onClick={() => updateQuantity(key, item.quantity - 1)}
                      className="px-3 py-2 hover:bg-muted text-foreground transition-colors"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <EditableQuantity
                      lineKey={key}
                      quantity={item.quantity}
                      updateQuantity={updateQuantity}
                    />
                    <button 
                      onClick={() => updateQuantity(key, item.quantity + 1)}
                      className="px-3 py-2 hover:bg-muted text-foreground transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => removeItem(key)}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white p-8 rounded-[2.5rem] border-2 border-border shadow-xl sticky top-28">
            <h2 className="font-display text-2xl font-bold mb-6">Order Summary</h2>
            
            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-medium text-foreground">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Shipping</span>
                <span className="font-medium text-foreground">${shipping.toFixed(2)}</span>
              </div>
            </div>
            
            <div className="border-t border-border pt-6 mb-8">
              <div className="flex justify-between items-center">
                <span className="font-display font-bold text-xl">Total</span>
                <span className="font-display font-bold text-3xl text-black">${total.toFixed(2)}</span>
              </div>
            </div>
            
            <Button 
              size="lg" 
              onClick={() => setLocation("/checkout")}
              className="w-full rounded-2xl h-16 border-[#2D9950] bg-[#2D9950] text-lg font-bold text-foreground shadow-lg shadow-[#2D9950]/25 hover:-translate-y-1 focus-visible:ring-[#2D9950] transition-all"
            >
              Checkout <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            
            <div className="mt-6 text-center">
              <Link href="/shop" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">
                Continue Shopping
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
