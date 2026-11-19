/**
 * Copy the old Postgres shop into the DynamoDB table and the images bucket.
 *
 * Run this on the machine that has the Postgres database and the uploaded
 * files (server/uploads). AWS credentials must be able to write the table
 * and the images bucket. From this repo, with the workspace AWS profile:
 *
 *   DATABASE_URL=postgres://user:pass@localhost:5432/stitch \
 *   UPLOADS_DIR=./server/uploads \
 *   npm run migrate:postgres -- --dry-run
 *
 *   DATABASE_URL=postgres://user:pass@localhost:5432/stitch \
 *   npm run migrate:postgres -- --replace
 *
 * --dry-run prints what would be copied and does not write.
 * --replace deletes whatever is already in the DynamoDB table first.
 * Without --replace the script stops if the table already has products
 * (it currently holds the sample seed).
 *
 * Product and order ids are kept, stored as strings, so order lines still
 * point at the right product. Image paths such as /uploads/fox.jpg are read
 * from UPLOADS_DIR and uploaded to S3. http(s) URLs are left unchanged.
 */
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import pg from "pg";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const tableName = process.env.TABLE_NAME ?? "stitch";
const bucket = process.env.IMAGES_BUCKET ?? "stitch-images-437329951890";
const imagesRegion = process.env.IMAGES_BUCKET_REGION ?? "us-east-1";
const uploadsDir = path.resolve(process.env.UPLOADS_DIR ?? "server/uploads");
const dryRun = process.argv.includes("--dry-run");
const replace = process.argv.includes("--replace");

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({ region: imagesRegion });

type ProductRow = {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  image_urls: unknown;
  created_at: Date | string | null;
};

type OrderRow = {
  id: number;
  name: string;
  email: string;
  address: string;
  total_amount: number;
  status: string | null;
  created_at: Date | string | null;
};

type OrderItemRow = {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  price_at_time: number;
};

function iso(value: Date | string | null): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return new Date(value).toISOString();
  return new Date().toISOString();
}

function asUrlList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  }
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

function localImagePath(url: string): string | undefined {
  if (url.startsWith("http://") || url.startsWith("https://")) return undefined;
  const filename = url.split("?")[0].split("/").filter(Boolean).pop();
  if (!filename) return undefined;
  return path.join(uploadsDir, filename);
}

async function uploadLocalImage(filePath: string): Promise<string> {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[extension];
  if (!contentType) {
    throw new Error(`unsupported image type ${extension || "(none)"}`);
  }
  const key = `images/${randomUUID()}${extension === ".jpeg" ? ".jpg" : extension}`;
  const body = await readFile(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return `/${key}`;
}

async function tableHasProducts(): Promise<boolean> {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1pk = :pk",
      ExpressionAttributeValues: { ":pk": "PRODUCT" },
      Limit: 1,
    }),
  );
  return (result.Items?.length ?? 0) > 0;
}

async function clearTable(): Promise<number> {
  let deleted = 0;
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: "pk, sk",
        ExclusiveStartKey: startKey,
      }),
    );
    const keys = (page.Items ?? []) as { pk: string; sk: string }[];
    for (let i = 0; i < keys.length; i += 25) {
      await doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: keys.slice(i, i + 25).map((key) => ({
              DeleteRequest: { Key: { pk: key.pk, sk: key.sk } },
            })),
          },
        }),
      );
      deleted += Math.min(25, keys.length - i);
    }
    startKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return deleted;
}

async function writeAll(items: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < items.length; i += 25) {
    let batch = items.slice(i, i + 25);
    while (batch.length > 0) {
      const result = await doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: batch.map((item) => ({ PutRequest: { Item: item } })),
          },
        }),
      );
      const unprocessed = result.UnprocessedItems?.[tableName] ?? [];
      batch = [];
      for (const request of unprocessed) {
        const item = request.PutRequest?.Item;
        if (item) batch.push(item);
      }
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required, for example postgres://user:pass@localhost:5432/stitch");
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const products = (await pool.query<ProductRow>(
      "SELECT id, name, description, price, category, image_urls, created_at FROM products ORDER BY id",
    )).rows;
    const orders = (await pool.query<OrderRow>(
      "SELECT id, name, email, address, total_amount, status, created_at FROM orders ORDER BY id",
    )).rows;
    const orderItems = (await pool.query<OrderItemRow>(
      "SELECT id, order_id, product_id, quantity, price_at_time FROM order_items ORDER BY id",
    )).rows;

    const missingFiles: string[] = [];
    const items: Record<string, unknown>[] = [];
    let uploaded = 0;

    for (const product of products) {
      const id = String(product.id);
      const imageUrls: string[] = [];
      for (const url of asUrlList(product.image_urls)) {
        const filePath = localImagePath(url);
        if (!filePath) {
          imageUrls.push(url);
          continue;
        }
        if (dryRun) {
          imageUrls.push(filePath);
          continue;
        }
        try {
          imageUrls.push(await uploadLocalImage(filePath));
          uploaded += 1;
        } catch (error) {
          missingFiles.push(`${url} (${error instanceof Error ? error.message : "unreadable"})`);
        }
      }

      const createdAt = iso(product.created_at);
      items.push({
        pk: `PRODUCT#${id}`,
        sk: "META",
        gsi1pk: "PRODUCT",
        gsi1sk: id,
        id,
        name: product.name,
        description: product.description,
        price: product.price,
        category: product.category,
        imageUrls,
        createdAt,
      });
      items.push({
        pk: `CATEGORY#${product.category}`,
        sk: `PRODUCT#${id}`,
        productId: id,
      });
    }

    const itemsByOrder = new Map<number, OrderItemRow[]>();
    for (const item of orderItems) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    }

    for (const order of orders) {
      const id = String(order.id);
      items.push({
        pk: `ORDER#${id}`,
        sk: "META",
        id,
        name: order.name,
        email: order.email,
        address: order.address,
        totalAmount: order.total_amount,
        status: order.status ?? "pending",
        createdAt: iso(order.created_at),
      });
      for (const item of itemsByOrder.get(order.id) ?? []) {
        items.push({
          pk: `ORDER#${id}`,
          sk: `ITEM#${item.product_id}`,
          id: String(item.id),
          orderId: id,
          productId: String(item.product_id),
          quantity: item.quantity,
          priceAtTime: item.price_at_time,
        });
      }
    }

    console.log(
      `${dryRun ? "Would copy" : "Copying"} ${products.length} products, ${orders.length} orders, ${orderItems.length} order lines.`,
    );
    console.log(`Image files are read from ${uploadsDir}.`);
    if (missingFiles.length > 0) {
      console.log("Images that could not be uploaded:");
      for (const missing of missingFiles) console.log(`  ${missing}`);
    }
    if (dryRun) return;

    if (await tableHasProducts()) {
      if (!replace) {
        throw new Error(
          `DynamoDB table "${tableName}" already has products. Run again with --replace to replace them, or --dry-run to preview.`,
        );
      }
      const deleted = await clearTable();
      console.log(`Removed ${deleted} existing items from ${tableName}.`);
    }

    await writeAll(items);
    console.log(`Wrote ${items.length} items to ${tableName}. Uploaded ${uploaded} images to ${bucket}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
