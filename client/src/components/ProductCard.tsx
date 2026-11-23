import { Link } from "wouter";
import { getStockLabel, type Product } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { ShoppingBag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export function ProductCard({ product, index = 0, showCategoryBadge = true }: { product: Product, index?: number, showCategoryBadge?: boolean }) {
  const addItem = useCart(state => state.addItem);
  const { toast } = useToast();

  const primaryImage = product.imageUrls?.[0] ?? "";

  const handleAddToCart = (e: React.MouseEvent) => {
    if ((product.options ?? []).length > 0) return;
    e.preventDefault();
    addItem(product);
    toast({
      title: `${product.name} has been added to your cart.`,
      className: "bg-white border-2 border-primary/20 rounded-2xl shadow-xl",
    });
  };

  const getCategoryStyles = (category: string) => {
    switch(category.toLowerCase()) {
      case 'animals': return { badge: 'bg-orange-100 text-orange-700 border-orange-200', hoverText: 'group-hover:text-orange-700' };
      case 'bags': return { badge: 'bg-blue-100 text-blue-700 border-blue-200', hoverText: 'group-hover:text-blue-700' };
      case 'hair clips': return { badge: 'bg-[#2D9950]/10 text-[#2D9950] border-[#2D9950]/30', hoverText: 'group-hover:text-[#2D9950]' };
      case 'accessories': return { badge: 'bg-purple-100 text-purple-700 border-purple-200', hoverText: 'group-hover:text-purple-800' };
      case 'christmas decorations': return { badge: 'bg-green-100 text-green-700 border-green-200', hoverText: 'group-hover:text-green-700' };
      default: return { badge: 'bg-purple-100 text-purple-700 border-purple-200', hoverText: 'group-hover:text-purple-700' };
    }
  };
  const categoryStyles = getCategoryStyles(product.category);

  return (
    <motion.div
      className="h-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Link href={`/product/${product.id}`} className="block h-full group">
        <div className="h-full flex flex-col bg-white rounded-3xl p-4 shadow-sm border-2 border-transparent hover:border-gray-200 hover:shadow-xl transition-all duration-300">

          <div
            className="relative aspect-square w-full rounded-2xl overflow-hidden mb-4"
            style={{ backgroundColor: product.imageBackgroundColor ?? "#ffffff" }}
          >
            {primaryImage ? (
              <img
                src={primaryImage}
                alt={product.name}
                className="absolute inset-0 m-auto max-w-full max-h-full rounded-2xl object-contain"
                style={{ backgroundColor: product.imageBackgroundColor ?? "#ffffff" }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No image</div>
            )}
            {showCategoryBadge && (
              <div className="absolute top-3 left-3">
                <span className={`inline [box-decoration-break:clone] [-webkit-box-decoration-break:clone] text-xs font-bold px-3 py-1 rounded-full border ${categoryStyles.badge}`}>
                  {product.category}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col">
            <h3 className={`min-h-[3.5rem] font-display text-xl font-bold mb-1 break-words ${categoryStyles.hoverText} transition-colors`}>
              {product.name}
            </h3>
            <p className="min-h-[2.5rem] text-muted-foreground text-sm line-clamp-2 mb-4 flex-1">
              {product.description}
            </p>

            <p className={`mb-3 text-sm font-semibold ${
              product.stockAvailable === "Out of stock" ? "text-[#D11C30]" :
              product.stockAvailable === "Low stock" ? "text-amber-700" :
              product.stockAvailable === "Made to order" ? "text-blue-700" : "text-green-700"
            }`}>
              {getStockLabel(product)}
            </p>

            <div className="flex items-center justify-between mt-auto">
              <span className="font-display font-bold text-2xl text-foreground">
                ${(product.price / 100).toFixed(2)}
              </span>
              <Button
                onClick={handleAddToCart}
                size="icon"
                aria-label={`Add ${product.name} to cart`}
                disabled={product.stockAvailable === "Out of stock"}
                className="rounded-2xl h-10 w-10 border-2 border-border bg-white text-foreground shadow-sm transition-all hover:border-green-800/50 hover:bg-white hover:text-green-800 hover:shadow-md"
              >
                <ShoppingBag className="h-5 w-5" />
              </Button>
            </div>
          </div>

        </div>
      </Link>
    </motion.div>
  );
}
