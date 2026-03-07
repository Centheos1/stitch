import { db } from "./db";
import { eq, ilike, and } from "drizzle-orm";
import {
  products, orders, orderItems,
  type Product, type InsertProduct, type UpdateProductRequest,
  type Order, type InsertOrder, type OrderItem
} from "@shared/schema";

export interface IStorage {
  getProducts(category?: string, search?: string): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, updates: UpdateProductRequest): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  
  createOrder(order: InsertOrder, items: { productId: number, quantity: number, priceAtTime: number }[]): Promise<Order>;
}

export class DatabaseStorage implements IStorage {
  async getProducts(category?: string, search?: string): Promise<Product[]> {
    const conditions = [];
    if (category) {
      conditions.push(eq(products.category, category));
    }
    if (search) {
      conditions.push(ilike(products.name, `%${search}%`));
    }
    
    if (conditions.length > 0) {
      return await db.select().from(products).where(and(...conditions));
    } else {
      return await db.select().from(products);
    }
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProduct(id: number, updates: UpdateProductRequest): Promise<Product> {
    const [updated] = await db.update(products).set(updates).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteProduct(id: number): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  async createOrder(order: InsertOrder, items: { productId: number, quantity: number, priceAtTime: number }[]): Promise<Order> {
    return await db.transaction(async (tx) => {
      const [newOrder] = await tx.insert(orders).values(order).returning();
      
      const itemsToInsert = items.map(item => ({
        orderId: newOrder.id,
        productId: item.productId,
        quantity: item.quantity,
        priceAtTime: item.priceAtTime
      }));
      
      if (itemsToInsert.length > 0) {
        await tx.insert(orderItems).values(itemsToInsert);
      }
      
      return newOrder;
    });
  }
}

export const storage = new DatabaseStorage();
