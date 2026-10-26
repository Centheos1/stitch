import { Link } from "wouter";
import { type Product } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { ShoppingBag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export function ProductCard({ product, index = 0 }: { product: Product, index?: number }) {
  const addItem = useCart(state => state.addItem);
  const { toast } = useToast();

  const primaryImage = product.imageUrls?.[0] ?? "";

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    addItem(product);
    toast({
      title: "Added to cart! 🛍️",
      description: `${product.name} is ready for you.`,
      className: "bg-white border-2 border-primary/20 rounded-2xl shadow-xl",
    });
  };

  const getCategoryStyles = (category: string) => {
    switch(category.toLowerCase()) {
      case 'animals': return { badge: 'bg-orange-100 text-orange-700 border-orange-200', hoverBorder: 'hover:border-orange-200' };
      case 'bags': return { badge: 'bg-blue-100 text-blue-700 border-blue-200', hoverBorder: 'hover:border-blue-200' };
      case 'hair clips': return { badge: 'bg-pink-100 text-pink-700 border-pink-200', hoverBorder: 'hover:border-pink-200' };
      case 'accessories': return { badge: 'bg-purple-100 text-purple-700 border-purple-200', hoverBorder: 'hover:border-purple-200' };
      case 'christmas decorations': return { badge: 'bg-green-100 text-green-700 border-green-200', hoverBorder: 'hover:border-green-200' };
      default: return { badge: 'bg-purple-100 text-purple-700 border-purple-200', hoverBorder: 'hover:border-purple-200' };
    }
  };
  const categoryStyles = getCategoryStyles(product.category);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Link href={`/product/${product.id}`} className="block group">
        <div className={`h-full flex flex-col bg-white rounded-3xl p-4 shadow-sm border-2 border-transparent ${categoryStyles.hoverBorder} hover:shadow-xl transition-all duration-300`}>

          <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-muted mb-4">
            {primaryImage ? (
              <img
                src={primaryImage}
                alt={product.name}
                className="w-full h-full object-contain bg-white"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No image</div>
            )}
            <div className="absolute top-3 left-3">
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${categoryStyles.badge}`}>
                {product.category}
              </span>
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <h3 className="font-display text-xl font-bold mb-1 line-clamp-1 group-hover:text-primary transition-colors">
              {product.name}
            </h3>
            <p className="text-muted-foreground text-sm line-clamp-2 mb-4 flex-1">
              {product.description}
            </p>

            <div className="flex items-center justify-between mt-auto">
              <span className="font-display font-bold text-2xl text-foreground">
                ${(product.price / 100).toFixed(2)}
              </span>
              <Button
                onClick={handleAddToCart}
                size="icon"
                aria-label={`Add ${product.name} to cart`}
                className="rounded-2xl h-10 w-10 border-2 border-border bg-white text-foreground shadow-sm transition-all hover:border-primary/50 hover:bg-white hover:text-primary hover:shadow-md"
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
