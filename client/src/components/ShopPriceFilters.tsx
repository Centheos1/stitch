import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useShopFilters } from "@/contexts/ShopFiltersContext";

export function ShopPriceFilters({ className = "", idPrefix = "shop-price" }: { className?: string; idPrefix?: string }) {
  const { minPrice, maxPrice, setMinPrice, setMaxPrice } = useShopFilters();

  return (
    <div className={`bg-white p-6 rounded-3xl border border-border shadow-sm ${className}`}>
      <h3 className="font-display font-bold text-lg mb-4">Filters</h3>
      <p className="text-sm font-semibold mb-3">Price range</p>
      <div className="space-y-4">
        <div>
          <label htmlFor={`${idPrefix}-min`} className="text-sm text-muted-foreground">Min ($)</label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              id={`${idPrefix}-min`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              aria-label="Minimum price in dollars"
              className="rounded-xl bg-background border-border focus-visible:ring-[#36B960]"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ""))}
            />
            <Button type="button" variant="outline" size="icon" aria-label="Increase minimum price by one dollar" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => setMinPrice(String((Number(minPrice) || 0) + 1))}>
              <ChevronUp className="h-5 w-5" />
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label="Decrease minimum price by one dollar" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => setMinPrice(String(Math.max(0, (Number(minPrice) || 0) - 1)))}>
              <ChevronDown className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-max`} className="text-sm text-muted-foreground">Max ($)</label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              id={`${idPrefix}-max`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="No limit"
              aria-label="Maximum price in dollars"
              className="rounded-xl bg-background border-border focus-visible:ring-[#36B960]"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ""))}
            />
            <Button type="button" variant="outline" size="icon" aria-label="Increase maximum price by one dollar" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => setMaxPrice(String((Number(maxPrice) || 0) + 1))}>
              <ChevronUp className="h-5 w-5" />
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label="Decrease maximum price by one dollar" className="h-10 w-10 shrink-0 rounded-xl" onClick={() => setMaxPrice(String(Math.max(0, (Number(maxPrice) || 0) - 1)))}>
              <ChevronDown className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
      {(minPrice !== "" || maxPrice !== "") && (
        <Button
          variant="ghost"
          onClick={() => { setMinPrice(""); setMaxPrice(""); }}
          className="w-full mt-3 text-black hover:text-black hover:bg-muted rounded-xl"
        >
          Clear Price Filter
        </Button>
      )}
    </div>
  );
}
