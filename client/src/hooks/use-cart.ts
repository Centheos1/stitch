import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product, SelectedOption } from '@shared/schema';

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

interface CartState {
  items: CartItem[];
  addItem: (product: Product, quantity?: number, options?: SelectedOption[]) => void;
  removeItem: (lineKey: string) => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getCartCount: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      
      addItem: (product, quantity = 1, options = []) => {
        set((state) => {
          const line = { product, options };
          const key = cartLineKey(line);
          const existingItem = state.items.find((item) => cartLineKey({ ...item, options: item.options ?? [] }) === key);
          if (existingItem) {
            return {
              items: state.items.map((item) =>
                cartLineKey({ ...item, options: item.options ?? [] }) === key
                  ? { ...item, options: item.options ?? [], quantity: item.quantity + quantity }
                  : item
              ),
            };
          }
          return { items: [...state.items, { product, quantity, options }] };
        });
      },

      removeItem: (lineKey) => {
        set((state) => ({
          items: state.items.filter((item) => cartLineKey({ ...item, options: item.options ?? [] }) !== lineKey),
        }));
      },

      updateQuantity: (lineKey, quantity) => {
        set((state) => ({
          items: state.items.map((item) =>
            cartLineKey({ ...item, options: item.options ?? [] }) === lineKey
              ? { ...item, options: item.options ?? [], quantity: Math.max(1, quantity) }
              : item
          ),
        }));
      },

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
