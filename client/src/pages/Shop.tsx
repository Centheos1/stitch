import { useProducts } from "@/hooks/use-products";
import { ProductCard } from "@/components/ProductCard";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShopFilters } from "@/contexts/ShopFiltersContext";

export default function Shop() {
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const activeCategory = searchParams.get("category") || "All";
  const { minPrice, maxPrice, setMinPrice, setMaxPrice } = useShopFilters();
  const normalizedSearch = (searchParams.get("search") ?? "").trim();
  const isSearching = normalizedSearch.length > 0;
  const isCategoryItemsView = activeCategory !== "All" && searchParams.get("view") === "items";
  const showCategories = !isSearching && !isCategoryItemsView;

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

  function clearSearch(resetCategory = false) {
    const params = new URLSearchParams(searchParams);
    params.delete("search");
    if (resetCategory) {
      params.delete("category");
      params.delete("view");
    }
    const nextSearch = params.toString();
    navigate(nextSearch ? `/shop?${nextSearch}` : "/shop", { replace: true });
  }

  function selectCategory(category: string) {
    const params = new URLSearchParams(searchParams);
    if (category === "All") params.delete("category");
    else params.set("category", category);
    const nextSearch = params.toString();
    navigate(nextSearch ? `/shop?${nextSearch}` : "/shop", { replace: true });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 min-h-screen">
      {isCategoryItemsView && (
        <Link href="/shop" className="inline-flex items-center text-muted-foreground hover:text-green-800 font-semibold mb-8 transition-colors">
          <ArrowLeft className="mr-2 h-5 w-5" aria-hidden="true" /> Back to Shop
        </Link>
      )}
      <div className="text-center max-w-2xl mx-auto mb-16">
        <h1 className="font-display text-5xl font-bold mb-4 text-black">The Shop</h1>
        <p className="text-lg text-muted-foreground">
          Browse our entire collection of lovingly crafted handmade items. Pick your favourites and bring some colour home!
        </p>
      </div>

      <div className={`flex flex-col gap-8 ${showCategories ? "lg:flex-row" : ""}`}>
        {isSearching && (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              onClick={() => clearSearch()}
              className="w-24 px-1 text-sm whitespace-nowrap text-black hover:text-black hover:bg-muted rounded-xl focus-visible:ring-[#36B960]"
            >
              Clear Search
            </Button>
          </div>
        )}
        {showCategories && (
          <div className="mx-auto w-full rounded-3xl border border-border bg-white p-6 shadow-sm md:w-[calc(100%_-_2in)] lg:mx-0 lg:w-64 lg:shrink-0 lg:self-start">
            <h3 className="font-display font-bold text-lg mb-4">Categories</h3>
            <div className="flex flex-col gap-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => selectCategory(cat)}
                  className={`text-left px-4 py-3 rounded-xl transition-colors font-semibold ${
                    activeCategory === cat
                      ? "bg-[#36B960] text-white shadow-md shadow-[#2D9950]/40"
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
                onClick={() => selectCategory("All")}
                className="w-full mt-4 text-black hover:text-black hover:bg-gray-100 rounded-xl"
              >
                Clear Filters
              </Button>
            )}
          </div>
        )}

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
                onClick={() => { clearSearch(true); setMinPrice(""); setMaxPrice(""); }}
                className="mt-6 rounded-xl border border-[#36B960] bg-[#36B960] text-[#14532D] hover:border-[#2D9950] hover:bg-[#2D9950] hover:text-white focus-visible:ring-[#36B960]"
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
