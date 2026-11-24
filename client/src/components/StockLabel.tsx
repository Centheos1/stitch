import { getProductStockStatus, getStockLabel, type Product } from "@shared/schema";

const stockColours = {
  "Out of stock": "text-[#D11C30]",
  "Low stock": "text-[#E48945]",
  "In stock": "text-[#36B960]",
  "Made to order": "text-[#5385CE]",
};

export function StockLabel({ product }: { product: Product }) {
  return (
    <span className={stockColours[getProductStockStatus(product)]}>
      {getStockLabel(product)}
    </span>
  );
}
