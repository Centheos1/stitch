import { useProducts } from "@/hooks/use-products";
import { ProductCard } from "@/components/ProductCard";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useShopFilters } from "@/contexts/ShopFiltersContext";

export default function Shop() {
  const [searchParams] = useState(new URLSearchParams(window.location.search));
  const urlCategory = searchParams.get("category");

  const [activeCategory, setActiveCategory] = useState(urlCategory || "All");
  const [searchQuery, setSearchQuery] = useState("");
  const { minPrice, maxPrice, setMinPrice, setMaxPrice } = useShopFilters();
  const normalizedSearch = searchQuery.trim();
  const isSearching = normalizedSearch.length > 0;

  const { data: allProducts } = useProducts();
  const { data: products, isLoading } = useProducts(
    isSearching || activeCategory === "All" ? undefined : activeCategory,
    normalizedSearch || undefined
  );

  const categories = ["All", ...Array.from(new Set((allProducts ?? []).map((p) => p.category))).sort()];
  const minPriceInCents = minPrice === "" ? undefined : Number(minPrice) * 100;
  const maxPriceInCents = maxPrice === "" ? undefined : Number(maxPrice) * 100;
  const filteredProducts = (products ?? []).filter((product) =>
    (minPriceInCents === undefined || product.price >= minPriceInCents) &&
    (maxPriceInCents === undefined || product.price <= maxPriceInCents)
  );

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 min-h-screen">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <h1 className="font-display text-5xl font-bold mb-4 rainbow-text">The Shop</h1>
        <p className="text-lg text-muted-foreground">
          Browse our entire collection of lovingly crafted handmade items. Pick your favourites and bring some colour home!
        </p>
      </div>

      <div className={`flex flex-col gap-8 ${isSearching ? "" : "lg:flex-row"}`}>
        
        {/* Sidebar Filters */}
        <div className={`w-full space-y-8 ${isSearching ? "" : "lg:w-64 lg:flex-shrink-0"}`}>
          
          <div className={`bg-white p-6 rounded-3xl border border-border shadow-sm ${isSearching ? "mx-auto md:w-[calc(100%_-_2in)]" : ""}`}>
            <h3 className="font-display font-bold text-lg mb-4">Search</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                type="text" 
                placeholder="Search items..." 
                className="pl-10 rounded-xl bg-background border-border focus-visible:ring-[#A8E3BC]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {isSearching ? (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                onClick={() => setSearchQuery("")}
                className="w-24 px-1 text-sm whitespace-nowrap text-black hover:text-black hover:bg-muted rounded-xl focus-visible:ring-[#A8E3BC]"
              >
                Clear Search
              </Button>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-3xl border border-border shadow-sm">
              <h3 className="font-display font-bold text-lg mb-4">Categories</h3>
              <div className="flex flex-col gap-2">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`text-left px-4 py-3 rounded-xl transition-colors font-semibold ${
                      activeCategory === cat
                        ? "bg-[#A8E3BC] text-[#14532D] shadow-md shadow-[#A8E3BC]/40"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {activeCategory !== "All" && (
                <Button
                  variant="ghost"
                  onClick={() => setActiveCategory("All")}
                  className="w-full mt-4 text-black hover:text-black hover:bg-gray-100 rounded-xl"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}

        </div>

        {/* Product Grid */}
        <div className="flex-1">
          {isSearching && !isLoading && (
            <div className="mb-6">
              <h2 className="font-display text-2xl font-bold">Search results</h2>
              <p className="text-muted-foreground">
                {filteredProducts.length} {filteredProducts.length === 1 ? "item" : "items"} for “{normalizedSearch}”
              </p>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr gap-8">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-[400px] rounded-3xl bg-muted/50 animate-pulse"></div>
              ))}
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr gap-8">
              {filteredProducts.map((product, i) => (
                <ProductCard key={product.id} product={product} index={i} showCategoryBadge={false} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-16 text-center border-2 border-dashed border-border flex flex-col items-center">
              <div className="text-6xl mb-4">👀</div>
              <h3 className="font-display text-2xl font-bold mb-2">No items found</h3>
              <p className="text-muted-foreground max-w-md">
                We couldn't find any crafts matching these filters. Try a different category, price range, or search term.
              </p>
              <Button 
                onClick={() => { setActiveCategory("All"); setSearchQuery(""); setMinPrice(""); setMaxPrice(""); }}
                className="mt-6 rounded-xl border border-[#A8E3BC] bg-[#A8E3BC] text-[#14532D] hover:bg-[#98DDAF] hover:text-[#14532D] focus-visible:ring-[#A8E3BC]"
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
