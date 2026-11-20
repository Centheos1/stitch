import { randomUUID } from "crypto";
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
  type SelectedOption,
} from "@shared/schema";
import { doc, tableName } from "./dynamo";

const PRODUCT_INDEX = "gsi1";

export interface IStorage {
  getProducts(category?: string, search?: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, updates: UpdateProductRequest): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<void>;
  createOrder(input: {
    name: string;
    email: string;
    address: string;
    items: { productId: string; quantity: number; options?: SelectedOption[] }[];
  }): Promise<{ order: Order; items: OrderItem[] }>;
  listOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<{ order: Order; items: OrderItem[]; messages: OrderMessage[] } | undefined>;
  markOrderRead(id: string): Promise<void>;
  saveOrderMessage(orderId: string | undefined, message: OrderMessage): Promise<void>;
  setOrderStatus(id: string, status: string, paymentRequestAmount?: number): Promise<Order | undefined>;
  listUnmatchedMail(): Promise<OrderMessage[]>;
  attachMail(messageId: string, orderId: string): Promise<void>;
  listMailThreads(archived: boolean): Promise<MailThread[]>;
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
  return productSchema.parse({
    ...item,
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
  async getProducts(category?: string, search?: string): Promise<Product[]> {
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
    const created: Product = {
      ...product,
      madeFrom: product.madeFrom ?? "",
      imageBackgroundColor: product.imageBackgroundColor ?? "#ffffff",
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

    const updated: Product = { ...existing, ...updates, id: existing.id, createdAt: existing.createdAt };
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

  async createOrder(input: {
    name: string;
    email: string;
    address: string;
    items: { productId: string; quantity: number; options?: SelectedOption[] }[];
  }): Promise<{ order: Order; items: OrderItem[] }> {
    const lines: OrderItem[] = [];
    let merchandise = 0;
    for (const requested of input.items) {
      const product = await this.getProduct(requested.productId);
      if (!product) throw new Error(`Product ${requested.productId} is no longer available`);
      const selected = requested.options ?? [];
      for (const option of product.options ?? []) {
        const pick = selected.find((entry) => entry.name === option.name);
        if (!pick || !option.choices.some((choice) => choice.label === pick.choice)) {
          throw new Error(`Choose a ${option.name} for ${product.name}`);
        }
      }
      for (const pick of selected) {
        const option = (product.options ?? []).find((entry) => entry.name === pick.name);
        if (!option || !option.choices.some((choice) => choice.label === pick.choice)) {
          throw new Error(`${pick.choice} is not a ${pick.name} option for ${product.name}`);
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
        quantity: requested.quantity,
        unitPrice,
        options: selected,
      });
    }

    const order: Order = {
      id: randomUUID(),
      name: input.name,
      email: input.email,
      address: input.address,
      totalAmount: merchandise + 500,
      status: "new",
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

  async getOrder(id: string): Promise<{ order: Order; items: OrderItem[]; messages: OrderMessage[] } | undefined> {
    const rows = await queryAll({
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `ORDER#${id}` },
    });
    const meta = rows.find((row) => row.sk === "META");
    if (!meta) return undefined;
    return {
      order: toOrder(meta),
      items: rows.filter((row) => String(row.sk).startsWith("ITEM#")).map(toOrderItem),
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

  async listMailThreads(archived: boolean): Promise<MailThread[]> {
    const rows = await queryAll({
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: { ":pk": "MAILBOX#inbox", ":sk": "THREAD#" },
    });
    const threads = rows.map(toThread).filter((thread) => thread.archived === archived);
    const legacy = await this.listUnmatchedMail();
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
    await doc.send(new PutCommand({
      TableName: tableName,
      Item: { pk, sk, ...message },
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
          orderId: "",
          threadId: input.threadId,
          messagePk: pk,
          messageSk: sk,
        },
      }));
    }
    await doc.send(new UpdateCommand({
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
    }));
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
      UpdateExpression: "SET archived = :archived",
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
    if (message.messageId) {
      await doc.send(new DeleteCommand({
        TableName: tableName,
        Key: { pk: `EMAIL#${emailKey(message.messageId)}`, sk: "META" },
      }));
    }
  }

  async setOrderStatus(id: string, status: string, paymentRequestAmount?: number): Promise<Order | undefined> {
    const existing = await this.getOrder(id);
    if (!existing) return undefined;
    const order: Order = {
      ...existing.order,
      status,
      ...(paymentRequestAmount !== undefined ? { paymentRequestAmount } : {}),
    };
    await doc.send(new PutCommand({
      TableName: tableName,
      Item: { pk: `ORDER#${id}`, sk: "META", ...order },
    }));
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
      Key: { pk: `EMAIL#${emailKey(messageId)}`, sk: "META" },
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
