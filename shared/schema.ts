import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(), // in cents
  category: text("category").notNull(),
  imageUrls: text("image_urls").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  address: text("address").notNull(),
  totalAmount: integer("total_amount").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  priceAtTime: integer("price_at_time").notNull(),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, status: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;

// Request types
export type CreateProductRequest = InsertProduct;
export type UpdateProductRequest = Partial<InsertProduct>;
export type CreateOrderRequest = InsertOrder & {
  items: Omit<InsertOrderItem, "orderId">[];
};

// Response types
export type ProductResponse = Product;
export type OrderResponse = Order;
export type OrderItemResponse = OrderItem;
