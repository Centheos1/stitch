import { DEFAULT_INVOICE_TERMS_DAYS, invoiceNumberSchema, invoiceTermsSchema, type InvoiceTerms } from "@shared/invoice-terms";
import { randomUUID } from "crypto";
import { setTimeout as delay } from "node:timers/promises";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
  DeleteCommand,
  PutCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import {
  productSchema,
  FLAT_SHIPPING_RATE_CENTS,
  shippingSettingsSchema,
  getStockStatus,
  orderSchema,
  orderItemSchema,
  orderMessageSchema,
  type Product,
  type InsertProduct,
  type UpdateProductRequest,
  type Order,
  type OrderItem,
  type OrderMessage,
  type MailThread,
} from "@shared/schema";
import { doc, tableName } from "./dynamo";
import type { orderQuoteInput } from "@shared/routes";
import type { z } from "zod";

type QuoteInput = z.infer<typeof orderQuoteInput>;
type ShippingSettings = z.infer<typeof shippingSettingsSchema>;
const invoiceCounterKey = { pk: "SETTINGS#INVOICE", sk: "COUNTER" };
const invoiceTermsKey = { pk: "SETTINGS#INVOICE", sk: "META" };
const shippingSettingsKey = { pk: "SETTINGS#SHIPPING", sk: "META" };

const PRODUCT_INDEX = "gsi1";

export class OrderRequestError extends Error {
  constructor(message: string, readonly status: 400 | 409 = 400) {
    super(message);
  }
}

export interface IStorage {
  getProducts(category?: string, search?: string, includeBlocked?: boolean): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, updates: UpdateProductRequest): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<void>;
  getShippingSettings(): Promise<ShippingSettings>;
  setShippingSettings(settings: ShippingSettings): Promise<void>;
  quoteOrder(input: QuoteInput): Promise<{ subtotal: number; unitPrices: number[]; shippingAmount: number; totalAmount: number }>;
  createOrder(input: QuoteInput & { expectedTotal: number; expectedShipping: number }): Promise<{ order: Order; items: OrderItem[] }>;
  listOrders(): Promise<Order[]>;
  getOrder(id: string, options?: { includeMakingTimes?: boolean }): Promise<{ order: Order; items: OrderItem[]; messages: OrderMessage[] } | undefined>;
  markOrderRead(id: string): Promise<void>;
  saveOrderMessage(orderId: string | undefined, message: OrderMessage): Promise<void>;
  setOrderStatus(id: string, status: string, paymentRequestAmount?: number): Promise<Order | undefined>;
  listUnmatchedMail(): Promise<OrderMessage[]>;
  attachMail(messageId: string, orderId: string): Promise<void>;
  listMailThreads(box: "inbox" | "archive" | "spam"): Promise<MailThread[]>;
  getMailThread(threadId: string): Promise<{ thread: MailThread; messages: OrderMessage[] } | undefined>;
  getMailMessage(id: string): Promise<OrderMessage | undefined>;
  saveThreadMessage(input: {
    threadId: string;
    subject: string;
    correspondent: string;
    snippet: string;
    message: OrderMessage;
  }): Promise<void>;
  setThreadArchived(threadId: string, archived: boolean): Promise<void>;
  markThreadRead(threadId: string): Promise<void>;
  deleteMailThread(threadId: string): Promise<OrderMessage[]>;
  discardUnmatched(message: OrderMessage): Promise<void>;
}

function productKey(id: string) {
  return { pk: `PRODUCT#${id}`, sk: "META" };
}

function categoryKey(category: string, id: string) {
  return { pk: `CATEGORY#${category}`, sk: `PRODUCT#${id}` };
}

function toOrder(item: Record<string, unknown>): Order {
  return orderSchema.parse(item);
}

function toOrderItem(item: Record<string, unknown>): OrderItem {
  const sk = String(item.sk ?? "");
  const pk = String(item.pk ?? "");
  const unitPrice = typeof item.unitPrice === "number"
    ? item.unitPrice
    : typeof item.priceAtTime === "number"
      ? item.priceAtTime
      : 0;
  return orderItemSchema.parse({
    ...item,
    id: typeof item.id === "string" ? item.id : sk.replace(/^ITEM#/, "") || "item",
    orderId: typeof item.orderId === "string" ? item.orderId : pk.replace(/^ORDER#/, ""),
    unitPrice,
    options: Array.isArray(item.options) ? item.options : [],
  });
}

function toMessage(item: Record<string, unknown>): OrderMessage {
  return orderMessageSchema.parse({
    ...item,
    attachments: Array.isArray(item.attachments) ? item.attachments : undefined,
  });
}

function toThread(item: Record<string, unknown>): MailThread {
  return {
    threadId: String(item.threadId ?? String(item.sk ?? "").replace(/^THREAD#/, "")),
    subject: String(item.subject ?? "(no subject)"),
    correspondent: String(item.correspondent ?? ""),
    snippet: String(item.snippet ?? ""),
    lastMessageAt: String(item.lastMessageAt ?? ""),
    unreadCount: typeof item.unreadCount === "number" ? item.unreadCount : 0,
    archived: item.archived === true,
    spam: item.spam === true,
  };
}

function legacyThread(message: OrderMessage): MailThread {
  return {
    threadId: `unmatched-${message.id}`,
    subject: message.subject,
    correspondent: message.from,
    snippet: message.text.slice(0, 140),
    lastMessageAt: message.createdAt,
    unreadCount: message.archived ? 0 : 1,
    archived: message.archived === true,
  };
}

export function emailKey(messageId: string): string {
  return messageId.replace(/[<>]/g, "").trim().toLowerCase();
}

function toProduct(item: Record<string, unknown>): Product {
  const storedAvailability = item.stockAvailable;
  const stockMode = item.stockMode === "made_to_order" || storedAvailability === "Made to order"
    ? "made_to_order"
    : "tracked";
  const stockQuantity = stockMode === "made_to_order"
    ? undefined
    : typeof item.stockQuantity === "number" && Number.isInteger(item.stockQuantity) && item.stockQuantity >= 0
      ? item.stockQuantity
      : 0;
  return productSchema.parse({
    ...item,
    stockMode,
    stockQuantity,
    stockAvailable: getStockStatus(stockMode, stockQuantity),
    options: Array.isArray(item.options) ? item.options : undefined,
  });
}

async function queryAll(input: Omit<QueryCommandInput, "TableName" | "ExclusiveStartKey">) {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const result = await doc.send(
      new QueryCommand({
        ...input,
        TableName: tableName,
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...((result.Items ?? []) as Record<string, unknown>[]));
    startKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return items;
}

export class DynamoStorage implements IStorage {
  async getProducts(category?: string, search?: string, includeBlocked = false): Promise<Product[]> {
    let products: Product[];

    if (category) {
      const links = await queryAll({
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: {
          ":pk": `CATEGORY#${category}`,
          ":sk": "PRODUCT#",
        },
      });
      products = await this.batchGet(links.map((link) => String(link.productId)));
    } else {
      const items = await queryAll({
        IndexName: PRODUCT_INDEX,
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": "PRODUCT" },
      });
      products = items.map(toProduct);
    }

    if (!includeBlocked) products = products.filter((product) => product.shopVisible !== false);
    const needle = search?.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) => [
      product.name,
      product.description,
      product.madeFrom,
      product.category,
    ].some((field) => (field ?? "").toLowerCase().includes(needle)));
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const result = await doc.send(
      new GetCommand({ TableName: tableName, Key: productKey(id) }),
    );
    return result.Item ? toProduct(result.Item) : undefined;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const stockMode = product.stockMode ?? (product.stockAvailable === "Made to order" ? "made_to_order" : "tracked");
    const stockQuantity = stockMode === "made_to_order" ? undefined : product.stockQuantity ?? 0;
    const created: Product = {
      ...product,
      description: product.description ?? "",
      madeFrom: product.madeFrom ?? "",
      stockMode,
      stockQuantity,
      stockAvailable: getStockStatus(stockMode, stockQuantity),
      imageBackgroundColor: product.imageBackgroundColor ?? "#ffffff",
      shopVisible: product.shopVisible ?? true,
      imageUrls: product.imageUrls ?? [],
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    await doc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName,
              Item: {
                ...productKey(created.id),
                ...created,
                gsi1pk: "PRODUCT",
                gsi1sk: created.id,
              },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
          {
            Put: {
              TableName: tableName,
              Item: { ...categoryKey(created.category, created.id), productId: created.id },
            },
          },
        ],
      }),
    );

    return created;
  }

  async updateProduct(id: string, updates: UpdateProductRequest): Promise<Product | undefined> {
    const existing = await this.getProduct(id);
    if (!existing) return undefined;

    const stockMode = updates.stockMode ?? (updates.stockAvailable === "Made to order" ? "made_to_order" : existing.stockMode ?? "tracked");
    const stockQuantity = stockMode === "made_to_order"
      ? undefined
      : updates.stockQuantity ?? existing.stockQuantity ?? 0;

    const updated: Product = {
      ...existing,
      ...updates,
      stockMode,
      stockQuantity,
      stockAvailable: getStockStatus(stockMode, stockQuantity),
      id: existing.id,
      createdAt: existing.createdAt,
    };
    const writes: ConstructorParameters<typeof TransactWriteCommand>[0]["TransactItems"] = [
      {
        Put: {
          TableName: tableName,
          Item: {
            ...productKey(id),
            ...updated,
            gsi1pk: "PRODUCT",
            gsi1sk: id,
          },
          ConditionExpression: "attribute_exists(pk)",
        },
      },
    ];

    if (updates.category && updates.category !== existing.category) {
      writes.push(
        { Delete: { TableName: tableName, Key: categoryKey(existing.category, id) } },
        {
          Put: {
            TableName: tableName,
            Item: { ...categoryKey(updated.category, id), productId: id },
          },
        },
      );
    }

    await doc.send(new TransactWriteCommand({ TransactItems: writes }));
    return updated;
  }

  async deleteProduct(id: string): Promise<void> {
    const existing = await this.getProduct(id);
    if (!existing) return;

    await doc.send(
      new TransactWriteCommand({
        TransactItems: [
          { Delete: { TableName: tableName, Key: productKey(id) } },
          { Delete: { TableName: tableName, Key: categoryKey(existing.category, id) } },
        ],
      }),
    );
  }

  async getInvoiceTerms(): Promise<InvoiceTerms> {
    const { Item } = await doc.send(new GetCommand({ TableName: tableName, Key: invoiceTermsKey, ConsistentRead: true }));
    return Item ? invoiceTermsSchema.parse(Item) : { days: DEFAULT_INVOICE_TERMS_DAYS };
  }

  async setInvoiceTerms({ days, paymentDetails }: InvoiceTerms): Promise<InvoiceTerms> {
    const values = { ":days": days, ...(paymentDetails === undefined ? {} : { ":details": paymentDetails }) };
    const { Attributes } = await doc.send(new UpdateCommand({
      TableName: tableName,
      Key: invoiceTermsKey,
      UpdateExpression: paymentDetails === undefined ? "SET days = :days" : "SET days = :days, paymentDetails = :details",
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    }));
    return invoiceTermsSchema.parse(Attributes);
  }

  async reserveInvoiceNumber(orderId: string): Promise<string | undefined> {
    const orderKey = { pk: `ORDER#${orderId}`, sk: "META" };
    const invoiceKey = { pk: orderKey.pk, sk: "INVOICE" };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { Item: invoice } = await doc.send(new GetCommand({
        TableName: tableName, Key: invoiceKey, ConsistentRead: true,
      }));
      if (invoice) return invoiceNumberSchema.parse(invoice.invoiceNumber);

      const { Item: counter } = await doc.send(new GetCommand({
        TableName: tableName, Key: invoiceCounterKey, ConsistentRead: true,
      }));
      const previous = counter?.lastNumber ?? 0;
      if (!Number.isSafeInteger(previous) || previous < 0) throw new Error("Invoice counter is invalid.");
      if (previous >= 999_999) throw new OrderRequestError("All six-digit invoice numbers have been used.", 409);
      const next = previous + 1;
      const invoiceNumber = String(next).padStart(6, "0");

      try {
        await doc.send(new TransactWriteCommand({
          TransactItems: [
            { ConditionCheck: {
              TableName: tableName, Key: orderKey, ConditionExpression: "attribute_exists(pk)",
            } },
            { Put: {
              TableName: tableName, Item: { ...invoiceKey, invoiceNumber },
              ConditionExpression: "attribute_not_exists(pk)",
            } },
            { Update: {
              TableName: tableName, Key: invoiceCounterKey,
              UpdateExpression: "SET lastNumber = :next",
              ConditionExpression: previous === 0
                ? "attribute_not_exists(lastNumber) OR lastNumber = :previous"
                : "lastNumber = :previous",
              ExpressionAttributeValues: { ":previous": previous, ":next": next },
            } },
          ],
        }));
        return invoiceNumber;
      } catch (error) {
        if (!(error instanceof TransactionCanceledException)) throw error;
        const reasons = error.CancellationReasons ?? [];
        if (reasons[0]?.Code === "ConditionalCheckFailed") return undefined;
        if (!reasons.some(({ Code }) => Code === "TransactionConflict" || Code === "ConditionalCheckFailed")) throw error;
        await delay(10 * (attempt + 1) + Math.random() * 20);
      }
    }
    throw new OrderRequestError("Invoice numbering is busy. Please reopen the draft.", 409);
  }

  async getShippingSettings(): Promise<ShippingSettings> {
    const { Item } = await doc.send(new GetCommand({ TableName: tableName, Key: shippingSettingsKey, ConsistentRead: true }));
    return shippingSettingsSchema.parse({
      rateCents: FLAT_SHIPPING_RATE_CENTS,
      freeDeliverySuburbs: Item?.freeDeliverySuburbs,
    });
  }

  async setShippingSettings(settings: ShippingSettings): Promise<void> {
    await doc.send(new UpdateCommand({
      TableName: tableName,
      Key: shippingSettingsKey,
      UpdateExpression: "SET freeDeliverySuburbs = :suburbs REMOVE rateCents",
      ExpressionAttributeValues: { ":suburbs": settings.freeDeliverySuburbs },
    }));
  }

  async quoteOrder(input: QuoteInput) {
    const { quote } = await this.prepareOrder(input);
    return quote;
  }

  private async prepareOrder(input: QuoteInput) {
    const lines: OrderItem[] = [];
    let merchandise = 0;
    const requestedQuantities = new Map<string, number>();
    for (const requested of input.items) {
      const product = await this.getProduct(requested.productId);
      if (!product || !product.shopVisible) {
        throw new OrderRequestError("An item in your cart is no longer available.");
      }
      if (product.stockMode !== "made_to_order") {
        const totalRequested = (requestedQuantities.get(product.id) ?? 0) + requested.quantity;
        requestedQuantities.set(product.id, totalRequested);
        const available = product.stockQuantity ?? 0;
        if (totalRequested > available) {
          throw new OrderRequestError(`Only ${available} of ${product.name} are currently in stock`, 409);
        }
      }
      const selected = requested.options ?? [];
      for (const option of product.options ?? []) {
        const pick = selected.find((entry) => entry.name === option.name);
        if (!pick || !option.choices.some((choice) => choice.label === pick.choice)) {
          throw new OrderRequestError(`Choose a ${option.name} for ${product.name}`);
        }
      }
      for (const pick of selected) {
        const option = (product.options ?? []).find((entry) => entry.name === pick.name);
        if (!option || !option.choices.some((choice) => choice.label === pick.choice)) {
          throw new OrderRequestError(`That option is unavailable for ${product.name}.`);
        }
      }
      let unitPrice = product.price;
      for (const pick of selected) {
        const option = product.options?.find((entry) => entry.name === pick.name);
        const choice = option?.choices.find((entry) => entry.label === pick.choice);
        unitPrice += choice?.priceDelta ?? 0;
      }
      merchandise += unitPrice * requested.quantity;
      lines.push({
        id: randomUUID(),
        orderId: "",
        productId: product.id,
        productName: product.name,
        timeToMake: product.timeToMake ?? "",
        quantity: requested.quantity,
        unitPrice,
        options: selected,
      });
    }

    const shippingAmount = FLAT_SHIPPING_RATE_CENTS;
    const totalAmount = merchandise + shippingAmount;
    if (!Number.isSafeInteger(totalAmount)) {
      throw new OrderRequestError("The order total is too large. Reduce your quantities and try again.");
    }
    return { lines, quote: { subtotal: merchandise, unitPrices: lines.map((line) => line.unitPrice ?? 0), shippingAmount, totalAmount } };
  }

  async createOrder(input: QuoteInput & { expectedTotal: number; expectedShipping: number }): Promise<{ order: Order; items: OrderItem[] }> {
    const { lines, quote } = await this.prepareOrder(input);
    if (quote.totalAmount !== input.expectedTotal || quote.shippingAmount !== input.expectedShipping) {
      throw new OrderRequestError("The order total changed. Please review the updated order total.", 409);
    }
    const order: Order = {
      id: randomUUID(),
      name: input.name,
      email: input.email,
      address: input.address,
      totalAmount: quote.totalAmount,
      shippingAmount: quote.shippingAmount,
      shippingPostcode: input.shippingPostcode,
      status: "new",
      stockDeducted: false,
      unreadCount: 0,
      createdAt: new Date().toISOString(),
    };
    const items = lines.map((line) => ({ ...line, orderId: order.id }));

    await doc.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: { pk: `ORDER#${order.id}`, sk: "META", ...order },
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
        ...items.map((item) => ({
          Put: {
            TableName: tableName,
            Item: {
              pk: `ORDER#${order.id}`,
              sk: `ITEM#${item.id}`,
              ...item,
            },
          },
        })),
      ],
    }));

    return { order, items };
  }

  async listOrders(): Promise<Order[]> {
    const orders: Order[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const result = await doc.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: "sk = :meta AND begins_with(pk, :order)",
        ExpressionAttributeValues: { ":meta": "META", ":order": "ORDER#" },
        ExclusiveStartKey: startKey,
      }));
      for (const item of result.Items ?? []) orders.push(toOrder(item));
      startKey = result.LastEvaluatedKey;
    } while (startKey);
    return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getOrder(id: string, { includeMakingTimes = false } = {}): Promise<{ order: Order; items: OrderItem[]; messages: OrderMessage[] } | undefined> {
    const rows = await queryAll({
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `ORDER#${id}` },
    });
    const meta = rows.find((row) => row.sk === "META");
    if (!meta) return undefined;
    const items = rows.filter((row) => String(row.sk).startsWith("ITEM#")).map(toOrderItem);
    if (includeMakingTimes) {
      const products = await this.batchGet(items.filter((item) => item.timeToMake === undefined).map((item) => item.productId));
      const makingTimes = new Map(products.map((product) => [product.id, product.timeToMake]));
      for (const item of items) {
        item.timeToMake ??= makingTimes.get(item.productId);
      }
    }
    return {
      order: toOrder(meta),
      items,
      messages: rows
        .filter((row) => String(row.sk).startsWith("MSG#"))
        .map(toMessage)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  }

  async markOrderRead(id: string): Promise<void> {
    await doc.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: `ORDER#${id}`, sk: "META" },
      UpdateExpression: "SET unreadCount = :zero",
      ExpressionAttributeValues: { ":zero": 0 },
    }));
  }

  async saveOrderMessage(orderId: string | undefined, message: OrderMessage): Promise<void> {
    const pk = orderId ? `ORDER#${orderId}` : "INBOX#unmatched";
    const sk = `MSG#${message.createdAt}#${message.id}`;
    await doc.send(new PutCommand({
      TableName: tableName,
      Item: { pk, sk, ...message, orderId },
    }));
    await doc.send(new PutCommand({
      TableName: tableName,
      Item: { pk: `MAILMSG#${message.id}`, sk: "META", messagePk: pk, messageSk: sk },
    }));
    if (message.messageId) {
      await doc.send(new PutCommand({
        TableName: tableName,
        Item: {
          pk: `EMAIL#${emailKey(message.messageId)}`,
          sk: "META",
          orderId: orderId ?? "",
          threadId: message.threadId ?? "",
          messagePk: pk,
          messageSk: sk,
        },
      }));
    }
  }

  async listMailThreads(box: "inbox" | "archive" | "spam"): Promise<MailThread[]> {
    const [rows, legacy] = await Promise.all([
      queryAll({
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": "MAILBOX#inbox", ":sk": "THREAD#" },
      }),
      box === "spam" ? [] : this.listUnmatchedMail(),
    ]);
    const archived = box === "archive";
    const threads = rows.map(toThread).filter((thread) =>
      box === "spam" ? thread.spam : !thread.spam && thread.archived === archived,
    );
    for (const message of legacy) {
      if ((message.archived === true) === archived) threads.push(legacyThread(message));
    }
    return threads.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }

  async getMailThread(threadId: string): Promise<{ thread: MailThread; messages: OrderMessage[] } | undefined> {
    if (threadId.startsWith("unmatched-")) {
      const id = threadId.slice("unmatched-".length);
      const message = (await this.listUnmatchedMail()).find((entry) => entry.id === id);
      if (!message) return undefined;
      return { thread: legacyThread(message), messages: [message] };
    }
    const rows = await queryAll({
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `THREAD#${threadId}` },
    });
    const messages = rows.filter((row) => String(row.sk).startsWith("MSG#")).map(toMessage)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (messages.length === 0) return undefined;
    const meta = await doc.send(new GetCommand({
      TableName: tableName,
      Key: { pk: "MAILBOX#inbox", sk: `THREAD#${threadId}` },
    }));
    const thread = meta.Item ? toThread({ ...meta.Item, threadId }) : {
      threadId,
      subject: messages[0].subject,
      correspondent: messages[0].direction === "in" ? messages[0].from : messages[0].to,
      snippet: messages[messages.length - 1].text.slice(0, 140),
      lastMessageAt: messages[messages.length - 1].createdAt,
      unreadCount: 0,
      archived: false,
    };
    return { thread, messages };
  }

  async getMailMessage(id: string): Promise<OrderMessage | undefined> {
    const pointer = await doc.send(new GetCommand({
      TableName: tableName,
      Key: { pk: `MAILMSG#${id}`, sk: "META" },
    }));
    if (!pointer.Item?.messagePk || !pointer.Item.messageSk) return undefined;
    const loaded = await doc.send(new GetCommand({
      TableName: tableName,
      Key: { pk: pointer.Item.messagePk, sk: pointer.Item.messageSk },
    }));
    return loaded.Item ? toMessage(loaded.Item) : undefined;
  }

  async saveThreadMessage(input: {
    threadId: string;
    subject: string;
    correspondent: string;
    snippet: string;
    message: OrderMessage;
  }): Promise<void> {
    const message: OrderMessage = { ...input.message, threadId: input.threadId };
    const pk = `THREAD#${input.threadId}`;
    const sk = `MSG#${message.createdAt}#${message.id}`;
    const writes: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]["TransactItems"]> = [
      { Put: { TableName: tableName, Item: { pk, sk, ...message } } },
      {
        Put: {
          TableName: tableName,
          Item: { pk: `MAILMSG#${message.id}`, sk: "META", messagePk: pk, messageSk: sk },
        },
      },
    ];
    if (message.messageId) {
      writes.push({
        Put: {
          TableName: tableName,
          Item: {
            pk: `EMAIL#${emailKey(message.messageId)}`,
            sk: "META",
            orderId: "",
            threadId: input.threadId,
            messagePk: pk,
            messageSk: sk,
          },
        },
      });
    }
    writes.push({
      Update: {
        TableName: tableName,
        Key: { pk: "MAILBOX#inbox", sk: `THREAD#${input.threadId}` },
        UpdateExpression: "SET threadId = :thread, subject = if_not_exists(subject, :subject), correspondent = :correspondent, snippet = :snippet, lastMessageAt = :at, archived = :open ADD unreadCount :one",
        ExpressionAttributeValues: {
          ":thread": input.threadId,
          ":subject": input.subject,
          ":correspondent": input.correspondent,
          ":snippet": input.snippet.slice(0, 140),
          ":at": message.createdAt,
          ":open": false,
          ":one": message.direction === "in" ? 1 : 0,
        },
      },
    });
    await doc.send(new TransactWriteCommand({ TransactItems: writes, ClientRequestToken: message.id }));
  }

  async setThreadArchived(threadId: string, archived: boolean): Promise<void> {
    if (threadId.startsWith("unmatched-")) {
      const found = await this.getMailThread(threadId);
      if (!found) throw new Error("Message not found");
      const message = found.messages[0];
      await doc.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: "INBOX#unmatched", sk: `MSG#${message.createdAt}#${message.id}` },
        UpdateExpression: "SET archived = :archived",
        ExpressionAttributeValues: { ":archived": archived },
      }));
      return;
    }
    await doc.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: "MAILBOX#inbox", sk: `THREAD#${threadId}` },
      UpdateExpression: archived ? "SET archived = :archived" : "SET archived = :archived REMOVE spam",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeValues: { ":archived": archived },
    }));
  }

  async markThreadRead(threadId: string): Promise<void> {
    if (threadId.startsWith("unmatched-")) return;
    await doc.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: "MAILBOX#inbox", sk: `THREAD#${threadId}` },
      UpdateExpression: "SET unreadCount = :zero",
      ExpressionAttributeValues: { ":zero": 0 },
    }));
  }

  async deleteMailThread(threadId: string): Promise<OrderMessage[]> {
    const found = await this.getMailThread(threadId);
    if (!found) return [];
    if (threadId.startsWith("unmatched-")) {
      const message = found.messages[0];
      await doc.send(new DeleteCommand({
        TableName: tableName,
        Key: { pk: "INBOX#unmatched", sk: `MSG#${message.createdAt}#${message.id}` },
      }));
      await this.deleteMessagePointers(message);
      return found.messages;
    }
    const keys = found.messages.map((message) => ({
      pk: `THREAD#${threadId}`,
      sk: `MSG#${message.createdAt}#${message.id}`,
    }));
    keys.push({ pk: "MAILBOX#inbox", sk: `THREAD#${threadId}` });
    for (let i = 0; i < keys.length; i += 25) {
      await doc.send(new TransactWriteCommand({
        TransactItems: keys.slice(i, i + 25).map((key) => ({
          Delete: { TableName: tableName, Key: key },
        })),
      }));
    }
    for (const message of found.messages) await this.deleteMessagePointers(message);
    return found.messages;
  }

  async discardUnmatched(message: OrderMessage): Promise<void> {
    await doc.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: "INBOX#unmatched", sk: `MSG#${message.createdAt}#${message.id}` },
    }));
  }

  private async deleteMessagePointers(message: OrderMessage): Promise<void> {
    await doc.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk: `MAILMSG#${message.id}`, sk: "META" },
    }));
    if (message.messageId && !message.id.startsWith("ses-spam-")) {
      await doc.send(new DeleteCommand({
        TableName: tableName,
        Key: { pk: `EMAIL#${emailKey(message.messageId)}`, sk: "META" },
      }));
    }
  }

  async setOrderStatus(id: string, status: string, paymentRequestAmount?: number): Promise<Order | undefined> {
    const bundle = await this.getOrder(id);
    if (!bundle) return undefined;
    const shouldDeductStock = status === "approved" && bundle.order.stockDeducted !== true;
    const order: Order = {
      ...bundle.order,
      status,
      ...(shouldDeductStock ? { stockDeducted: true } : {}),
      ...(paymentRequestAmount !== undefined ? { paymentRequestAmount } : {}),
    };

    if (!shouldDeductStock) {
      const updateExpression = paymentRequestAmount === undefined
        ? "SET #status = :status"
        : "SET #status = :status, paymentRequestAmount = :paymentRequestAmount";
      const expressionValues = paymentRequestAmount === undefined
        ? { ":status": status }
        : { ":status": status, ":paymentRequestAmount": paymentRequestAmount };
      await doc.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: `ORDER#${id}`, sk: "META" },
        UpdateExpression: updateExpression,
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: expressionValues,
      }));
      return order;
    }

    const requestedByProduct = new Map<string, number>();
    for (const line of bundle.items) {
      requestedByProduct.set(line.productId, (requestedByProduct.get(line.productId) ?? 0) + line.quantity);
    }
    const inventoryChanges: { product: Product; quantity: number }[] = [];
    for (const [productId, quantity] of requestedByProduct) {
      const product = await this.getProduct(productId);
      if (!product) throw new Error(`Product ${productId} is no longer available`);
      if (product.stockMode === "made_to_order") continue;
      if ((product.stockQuantity ?? 0) < quantity) {
        throw new Error(`Insufficient stock for ${product.name}: ${product.stockQuantity ?? 0} available, ${quantity} ordered`);
      }
      inventoryChanges.push({ product, quantity });
    }

    const orderWrite = {
      Put: {
        TableName: tableName,
        Item: { pk: `ORDER#${id}`, sk: "META", ...order },
        ConditionExpression: "attribute_exists(pk) AND (attribute_not_exists(stockDeducted) OR stockDeducted = :notDeducted)",
        ExpressionAttributeValues: { ":notDeducted": false },
      },
    };
    const inventoryWrites = inventoryChanges.map(({ product, quantity }) => ({
      Update: {
        TableName: tableName,
        Key: productKey(product.id),
        UpdateExpression: "SET stockQuantity = stockQuantity - :quantity",
        ConditionExpression: "stockMode = :tracked AND stockQuantity >= :quantity",
        ExpressionAttributeValues: { ":quantity": quantity, ":tracked": "tracked" },
      },
    }));

    try {
      await doc.send(new TransactWriteCommand({ TransactItems: [...inventoryWrites, orderWrite] }));
    } catch (err) {
      if (err instanceof Error && err.name === "TransactionCanceledException") {
        throw new Error("Stock changed while this order was being updated. Refresh the order and try again.");
      }
      throw err;
    }
    return order;
  }

  async listUnmatchedMail(): Promise<OrderMessage[]> {
    const rows = await queryAll({
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: { ":pk": "INBOX#unmatched", ":sk": "MSG#" },
    });
    return rows.map(toMessage).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async attachMail(messageId: string, orderId: string): Promise<void> {
    const lookup = await doc.send(new GetCommand({
      TableName: tableName,
      Key: {
        pk: messageId.startsWith("ses-spam-") ? `MAILMSG#${messageId}` : `EMAIL#${emailKey(messageId)}`,
        sk: "META",
      },
    }));
    const pointer = lookup.Item;
    if (!pointer?.messagePk || !pointer.messageSk) throw new Error("Message not found");
    const loaded = await doc.send(new GetCommand({
      TableName: tableName,
      Key: { pk: pointer.messagePk, sk: pointer.messageSk },
    }));
    if (!loaded.Item) throw new Error("Message not found");
    const message = toMessage(loaded.Item);
    const moved: OrderMessage = { ...message, orderId };
    const sk = `MSG#${moved.createdAt}#${moved.id}`;
    await doc.send(new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: tableName, Item: { pk: `ORDER#${orderId}`, sk, ...moved } } },
        { Delete: { TableName: tableName, Key: { pk: pointer.messagePk, sk: pointer.messageSk } } },
        {
          Put: {
            TableName: tableName,
            Item: {
              pk: `EMAIL#${emailKey(message.messageId || messageId)}`,
              sk: "META",
              orderId,
              threadId: "",
              messagePk: `ORDER#${orderId}`,
              messageSk: sk,
            },
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              pk: `MAILMSG#${message.id}`,
              sk: "META",
              messagePk: `ORDER#${orderId}`,
              messageSk: sk,
            },
          },
        },
      ],
    }));
    if (String(pointer.messagePk).startsWith("THREAD#")) {
      const threadId = String(pointer.messagePk).slice("THREAD#".length);
      const left = await this.getMailThread(threadId);
      if (!left) {
        await doc.send(new DeleteCommand({
          TableName: tableName,
          Key: { pk: "MAILBOX#inbox", sk: `THREAD#${threadId}` },
        }));
      }
    }
    await doc.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: `ORDER#${orderId}`, sk: "META" },
      UpdateExpression: "ADD unreadCount :one",
      ExpressionAttributeValues: { ":one": 1 },
    }));
  }

  private async batchGet(ids: string[]): Promise<Product[]> {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) return [];

    const products: Product[] = [];
    for (let i = 0; i < unique.length; i += 100) {
      let keys = unique.slice(i, i + 100).map(productKey);
      while (keys.length > 0) {
        const result = await doc.send(
          new BatchGetCommand({ RequestItems: { [tableName]: { Keys: keys } } }),
        );
        for (const item of result.Responses?.[tableName] ?? []) {
          products.push(toProduct(item));
        }
        keys = (result.UnprocessedKeys?.[tableName]?.Keys ?? []) as typeof keys;
      }
    }
    return products;
  }
}

export const storage = new DynamoStorage();
