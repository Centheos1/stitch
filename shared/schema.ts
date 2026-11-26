import { z } from "zod";

export const productChoiceSchema = z.object({
  label: z.string().min(1),
  priceDelta: z.number().int(), // cents added to the base price, 0 when there is no extra
});

export const productOptionSchema = z.object({
  name: z.string().min(1),
  choices: z.array(productChoiceSchema).min(1),
});

export const selectedOptionSchema = z.object({
  name: z.string().min(1),
  choice: z.string().min(1),
});

export const stockModeSchema = z.enum(["tracked", "made_to_order"]);
export type StockMode = z.infer<typeof stockModeSchema>;
export const LOW_STOCK_THRESHOLD = 3;

export function getStockStatus(stockMode?: StockMode, quantity?: number): "In stock" | "Out of stock" | "Low stock" | "Made to order" {
  if (stockMode === "made_to_order") return "Made to order";
  const available = quantity ?? 0;
  if (available <= 0) return "Out of stock";
  return available <= LOW_STOCK_THRESHOLD ? "Low stock" : "In stock";
}

type ProductStock = Pick<Product, "stockMode" | "stockQuantity" | "stockAvailable">;

export function getProductStockStatus(product: ProductStock) {
  return product.stockMode === "made_to_order" || product.stockAvailable === "Made to order"
    ? "Made to order"
    : getStockStatus("tracked", product.stockQuantity);
}

export function getStockLabel(
  product: ProductStock,
  { showInStockQuantity = false } = {},
): string {
  const status = getProductStockStatus(product);
  if (status === "Low stock") return `Low stock · ${product.stockQuantity} left`;
  if (status === "In stock" && showInStockQuantity) return `${product.stockQuantity} in stock`;
  return status;
}

export const australianPostcodeSchema = z.string().trim().regex(/^\d{4}$/, "Enter a four-digit Australian postcode.");

export const DEFAULT_SHIPPING_RATE_CENTS = 500;
export const freeDeliverySuburbsSchema = z.array(z.string().trim().min(1).max(80)).max(200)
  .transform((suburbs) => Array.from(new Map(suburbs.map((name) => [name.toLowerCase(), name])).values()));
export const shippingSettingsSchema = z.object({
  rateCents: z.number().int().nonnegative().safe(),
  freeDeliverySuburbs: freeDeliverySuburbsSchema.default([]),
});

export const shippingMeasurementsSchema = z.object({
  lengthCm: z.number().finite().positive(),
  widthCm: z.number().finite().positive(),
  heightCm: z.number().finite().positive(),
  weightKg: z.number().finite().positive(),
});

export const productSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().trim().default(""),
  madeFrom: z.string().optional(), // older products may not have it
  measurements: z.string().trim().max(200).optional(),
  shippingMeasurements: shippingMeasurementsSchema.nullish(),
  timeToMake: z.string().trim().max(100).optional(),
  price: z.number().int(), // in cents
  category: z.string().min(1),
  imageUrls: z.array(z.string()),
  imageBackgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), // older products may not have it; UI falls back to #ffffff
  stockMode: stockModeSchema.optional(),
  stockQuantity: z.number().int().nonnegative().optional(),
  stockAvailable: z.enum(["In stock", "Out of stock", "Low stock", "Made to order"]).optional(), // derived display status; retained for older records
  shopVisible: z.boolean().default(true),
  options: z.array(productOptionSchema).optional(),
  createdAt: z.string(),
});

export const orderSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  address: z.string().min(1),
  totalAmount: z.number().int(),
  shippingAmount: z.number().int().nonnegative().optional(),
  shippingPostcode: australianPostcodeSchema.optional(),
  status: z.string(),
  paymentRequestAmount: z.number().int().optional(),
  unreadCount: z.number().int().optional(),
  stockDeducted: z.boolean().optional(),
  createdAt: z.string(),
});

export const orderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  productId: z.string(),
  productName: z.string().optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().optional(),
  priceAtTime: z.number().int().optional(),
  options: z.array(selectedOptionSchema).optional(),
});

export const mailAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
  key: z.string(),
  contentId: z.string().optional(),
});

export const orderMessageSchema = z.object({
  id: z.string(),
  orderId: z.string().optional(),
  threadId: z.string().optional(),
  direction: z.enum(["in", "out"]),
  kind: z.string(),
  from: z.string(),
  to: z.string(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string(),
  text: z.string(),
  htmlKey: z.string().optional(),
  rawKey: z.string().optional(),
  attachments: z.array(mailAttachmentSchema).optional(),
  messageId: z.string().optional(),
  delivered: z.boolean().optional(),
  deliveryError: z.string().optional(),
  spam: z.boolean().optional(),
  archived: z.boolean().optional(),
  createdAt: z.string(),
});

export const mailThreadSchema = z.object({
  threadId: z.string(),
  subject: z.string(),
  correspondent: z.string(),
  snippet: z.string(),
  lastMessageAt: z.string(),
  unreadCount: z.number().int(),
  archived: z.boolean(),
  spam: z.boolean().optional(),
});

export const PROBLEM_REPORT_SUBJECT = "Website problem report";

export const INBOX_FROM_ADDRESSES = [
  "info@stitchhandmade.shop",
  "audrey@stitchhandmade.shop",
] as const;

export const insertProductSchema = productSchema.omit({ id: true, createdAt: true, shopVisible: true, description: true }).extend({
  description: z.string().trim().optional(),
  // Keep this field optional on updates so editing a hidden product doesn't republish it.
  shopVisible: z.boolean().optional(),
});
export const insertOrderSchema = orderSchema.omit({ id: true, createdAt: true, status: true });
export const insertOrderItemSchema = orderItemSchema.omit({ id: true });

export type Product = z.infer<typeof productSchema>;
export type InsertProduct = z.input<typeof insertProductSchema>;

export type Order = z.infer<typeof orderSchema>;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type OrderItem = z.infer<typeof orderItemSchema>;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type ProductOption = z.infer<typeof productOptionSchema>;
export type SelectedOption = z.infer<typeof selectedOptionSchema>;
export type OrderMessage = z.infer<typeof orderMessageSchema>;
export type MailAttachment = z.infer<typeof mailAttachmentSchema>;
export type MailThread = z.infer<typeof mailThreadSchema>;

export type CreateProductRequest = InsertProduct;
export type UpdateProductRequest = Partial<InsertProduct>;
export type CreateOrderRequest = InsertOrder & {
  items: Omit<InsertOrderItem, "orderId">[];
};

export type ProductResponse = Product;
export type OrderResponse = Order;
export type OrderItemResponse = OrderItem;
