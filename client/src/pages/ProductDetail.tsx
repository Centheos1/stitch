import { useRoute } from "wouter";
import { useProduct } from "@/hooks/use-products";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Minus, Plus, ShoppingCart, Heart, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  
  const { data: product, isLoading, error } = useProduct(id);
  const addItem = useCart((state) => state.addItem);
  const { toast } = useToast();
  const [quantity, setQuantity] = useState(1);

  if (isLoading) {
    return (
      <div className="min-h-screen pt-20 px-4 max-w-7xl mx-auto flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-primary border-r-4 border-r-transparent"></div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <h1 className="font-display text-4xl font-bold mb-4 text-destructive">Oops!</h1>
        <p className="text-xl text-muted-foreground mb-8">We couldn't find that special item.</p>
        <Link href="/shop">
          <Button size="lg" className="rounded-2xl h-14 px-8">Back to Shop</Button>
        </Link>
      </div>
    );
  }

  const handleAddToCart = () => {
    addItem(product, quantity);
    toast({
      title: "Added to cart! 🛍️",
      description: `${quantity}x ${product.name} added.`,
      className: "bg-white border-2 border-primary/20 rounded-2xl shadow-xl",
    });
  };

  return (
    <div className="min-h-screen py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        <Link href="/shop" className="inline-flex items-center text-muted-foreground hover:text-primary font-semibold mb-8 transition-colors">
          <ArrowLeft className="mr-2 h-5 w-5" /> Back to Shop
        </Link>

        <div className="bg-white rounded-[3rem] p-6 lg:p-12 shadow-sm border border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
            
            {/* Image */}
            <div className="relative aspect-square rounded-[2rem] overflow-hidden bg-muted/30 p-4 border-2 border-dashed border-border/50">
              <img 
                src={product.imageUrl} 
                alt={product.name}
                className="w-full h-full object-cover rounded-[1.5rem] shadow-md"
              />
            </div>

            {/* Details */}
            <div className="flex flex-col justify-center">
              <div className="mb-2">
                <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {product.category}
                </span>
              </div>
              
              <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight">
                {product.name}
              </h1>
              
              <div className="font-display text-4xl font-bold text-secondary mb-6">
                ${(product.price / 100).toFixed(2)}
              </div>
              
              <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
                {product.description}
              </p>

              <div className="bg-background rounded-3xl p-6 border border-border/50 mb-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="font-bold text-foreground">Quantity:</div>
                  <div className="flex items-center bg-white rounded-xl border border-border overflow-hidden shadow-sm">
                    <button 
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="px-4 py-3 hover:bg-muted text-foreground transition-colors"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <div className="w-12 text-center font-bold text-lg">{quantity}</div>
                    <button 
                      onClick={() => setQuantity(quantity + 1)}
                      className="px-4 py-3 hover:bg-muted text-foreground transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button 
                    onClick={handleAddToCart}
                    size="lg" 
                    className="flex-1 rounded-2xl h-16 text-lg font-bold shadow-lg shadow-primary/25 hover:-translate-y-1 transition-all"
                  >
                    <ShoppingCart className="mr-2 h-5 w-5" /> Add to Cart
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-16 w-16 rounded-2xl border-2 border-border text-muted-foreground hover:text-red-500 hover:border-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Heart className="h-6 w-6" />
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground flex flex-col gap-2">
                <p>✨ Handcrafted with love and care</p>
                <p>📦 Ships securely packaged</p>
                <p>💖 Supports independent creators</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
