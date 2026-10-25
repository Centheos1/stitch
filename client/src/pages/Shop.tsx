import { useProducts } from "@/hooks/use-products";
import { ProductCard } from "@/components/ProductCard";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Search, FilterX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Shop() {
  const [searchParams] = useState(new URLSearchParams(window.location.search));
  const urlCategory = searchParams.get("category");

  const [activeCategory, setActiveCategory] = useState(urlCategory || "All");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: allProducts } = useProducts();
  const { data: products, isLoading } = useProducts(
    activeCategory === "All" ? undefined : activeCategory,
    searchQuery || undefined
  );

  const categories = ["All", ...Array.from(new Set((allProducts ?? []).map((p) => p.category))).sort()];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 min-h-screen">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <h1 className="font-display text-5xl font-bold mb-4 rainbow-text">The Shop</h1>
        <p className="text-lg text-muted-foreground">
          Browse our entire collection of lovingly crafted handmade items. Pick your favorites and bring some color home!
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Sidebar Filters */}
        <div className="w-full lg:w-64 flex-shrink-0 space-y-8">
          
          <div className="bg-white p-6 rounded-3xl border border-border shadow-sm">
            <h3 className="font-display font-bold text-lg mb-4">Search</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                type="text" 
                placeholder="Search items..." 
                className="pl-10 rounded-xl bg-background border-border"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-border shadow-sm">
            <h3 className="font-display font-bold text-lg mb-4">Categories</h3>
            <div className="flex flex-col gap-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`text-left px-4 py-3 rounded-xl transition-colors font-semibold ${
                    activeCategory === cat 
                      ? "bg-[#7C3AED] text-white shadow-md shadow-[#7C3AED]/20" 
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            
            {(activeCategory !== "All" || searchQuery) && (
              <Button 
                variant="ghost" 
                onClick={() => { setActiveCategory("All"); setSearchQuery(""); }}
                className="w-full mt-4 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl"
              >
                <FilterX className="mr-2 h-4 w-4" /> Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-[400px] rounded-3xl bg-muted/50 animate-pulse"></div>
              ))}
            </div>
          ) : products && products.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {products.map((product, i) => (
                <ProductCard key={product.id} product={product} index={i} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-16 text-center border-2 border-dashed border-border flex flex-col items-center">
              <div className="text-6xl mb-4">👀</div>
              <h3 className="font-display text-2xl font-bold mb-2">No items found</h3>
              <p className="text-muted-foreground max-w-md">
                We couldn't find any crafts matching your search. Try a different category or search term.
              </p>
              <Button 
                onClick={() => { setActiveCategory("All"); setSearchQuery(""); }}
                className="mt-6 rounded-xl"
              >
                View All Items
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
