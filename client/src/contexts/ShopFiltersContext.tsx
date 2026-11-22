import { createContext, useContext, useState, type ReactNode } from "react";

type ShopFiltersContextValue = {
  minPrice: string;
  maxPrice: string;
  setMinPrice: (value: string) => void;
  setMaxPrice: (value: string) => void;
};

const ShopFiltersContext = createContext<ShopFiltersContextValue | null>(null);

export function ShopFiltersProvider({ children }: { children: ReactNode }) {
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  return (
    <ShopFiltersContext.Provider value={{ minPrice, maxPrice, setMinPrice, setMaxPrice }}>
      {children}
    </ShopFiltersContext.Provider>
  );
}

export function useShopFilters() {
  const context = useContext(ShopFiltersContext);
  if (!context) throw new Error("useShopFilters must be used within ShopFiltersProvider");
  return context;
}
