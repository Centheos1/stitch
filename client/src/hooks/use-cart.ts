import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getProductStockStatus, type Product, type SelectedOption } from '@shared/schema';

export interface CartItem {
  product: Product;
  quantity: number;
  options: SelectedOption[];
}

export function cartLineKey(item: { product: { id: string }; options?: SelectedOption[] }): string {
  const options = item.options ?? [];
  return `${item.product.id}|${options.map((option) => `${option.name}=${option.choice}`).join("|")}`;
}

export function unitPrice(product: Product, options: SelectedOption[] = []): number {
  let price = product.price;
  for (const selected of options) {
    const group = product.options?.find((option) => option.name === selected.name);
    const choice = group?.choices.find((entry) => entry.label === selected.choice);
    price += choice?.priceDelta ?? 0;
  }
  return price;
}

function stockLimit(product: Product): number {
  return getProductStockStatus(product) === "Made to order"
    ? Number.MAX_SAFE_INTEGER
    : product.stockQuantity ?? 0;
}

export function remainingStock(items: CartItem[], product: Product): number {
  const inCart = items.reduce((sum, item) => item.product.id === product.id ? sum + item.quantity : sum, 0);
  return Math.max(0, stockLimit(product) - inCart);
}

interface CartState {
  items: CartItem[];
  addItem: (product: Product, quantity?: number, options?: SelectedOption[]) => void;
  removeItem: (lineKey: string) => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  syncStock: (products: Product[]) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getCartCount: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      
      addItem: (product, quantity = 1, options = []) => {
        if (!Number.isSafeInteger(quantity) || quantity < 1) return;
        set((state) => {
          const allowed = Math.min(quantity, remainingStock(state.items, product));
          if (!allowed) return state;
          const line = { product, options };
          const key = cartLineKey(line);
          const existingItem = state.items.find((item) => cartLineKey({ ...item, options: item.options ?? [] }) === key);
          if (existingItem) {
            return {
              items: state.items.map((item) =>
                cartLineKey({ ...item, options: item.options ?? [] }) === key
                  ? { ...item, options: item.options ?? [], product, quantity: item.quantity + allowed }
                  : item
              ),
            };
          }
          return { items: [...state.items, { product, quantity: allowed, options }] };
        });
      },

      removeItem: (lineKey) => {
        set((state) => ({
          items: state.items.filter((item) => cartLineKey({ ...item, options: item.options ?? [] }) !== lineKey),
        }));
      },

      updateQuantity: (lineKey, quantity) => {
        if (!Number.isSafeInteger(quantity)) return;
        set((state) => ({
          items: state.items.map((item) => {
            if (cartLineKey(item) !== lineKey) return item;
            const maximum = item.quantity + remainingStock(state.items, item.product);
            return { ...item, quantity: Math.min(maximum, Math.max(1, quantity)) };
          }),
        }));
      },

      syncStock: (products) => set((state) => {
        const byId = new Map(products.map((product) => [product.id, product]));
        const available = new Map<string, number>();
        const items: CartItem[] = [];
        for (const item of state.items) {
          const product = byId.get(item.product.id);
          if (!product) continue;
          const remaining = available.get(product.id) ?? stockLimit(product);
          const quantity = Math.min(remaining, item.quantity);
          if (quantity <= 0) continue;
          items.push({ ...item, product, quantity });
          available.set(product.id, remaining - quantity);
        }
        return { items };
      }),

      clearCart: () => set({ items: [] }),

      getCartTotal: () => {
        const state = get();
        return state.items.reduce(
          (total, item) => total + unitPrice(item.product, item.options ?? []) * item.quantity,
          0
        );
      },

      getCartCount: () => {
        const state = get();
        return state.items.reduce((count, item) => count + item.quantity, 0);
      },
    }),
    {
      name: 'stitch-cart-v2',
    }
  )
);
