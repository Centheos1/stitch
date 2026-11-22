/**
 * Copy the old Postgres shop into DynamoDB and move local product images to S3.
 *
 * Preview first:
 *   DATABASE_URL=... UPLOADS_DIR=./server/uploads npm run migrate:postgres -- --dry-run
 * Apply to an empty target:
 *   DATABASE_URL=... UPLOADS_DIR=./server/uploads npm run migrate:postgres
 * Re-run/overwrite the exact keys represented by Postgres:
 *   DATABASE_URL=... UPLOADS_DIR=./server/uploads npm run migrate:postgres -- --replace
 *
 * --replace overwrites matching product, category-link, order, and order-item
 * keys only. It never clears the table, so unrelated DynamoDB data is retained.
 */
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import pg from "pg";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  type WriteRequest,
} from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const tableName = process.env.TABLE_NAME ?? "stitch";
const bucket = process.env.IMAGES_BUCKET ?? "stitch-images-437329951890";
const tableRegion = process.env.AWS_REGION ?? "ap-southeast-2";
const imagesRegion = process.env.IMAGES_BUCKET_REGION ?? "us-east-1";
const uploadsDir = path.resolve(process.env.UPLOADS_DIR ?? "server/uploads");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const replace = args.includes("--replace");
const unknownArgs = args.filter((arg) => arg !== "--dry-run" && arg !== "--replace");

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: tableRegion }), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({ region: imagesRegion });

type ProductRow = {
  id: number;
  name: string;
  description: string;
  made_from?: string | null;
  price: number;
  category: string;
  image_urls: unknown;
  image_background_color?: string | null;
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
type PlannedImage = { source: string; key: string; contentType: string; body: Buffer };

function iso(value: Date | string | null, label: string): string {
  if (value === null) throw new Error(`${label} has no created_at value`);
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} has an invalid created_at value`);
  return date.toISOString();
}

function asUrlList(value: unknown, productId: number): string[] {
  let urls: unknown;
  if (Array.isArray(value)) urls = value;
  else if (typeof value === "string") {
    try { urls = JSON.parse(value); } catch { urls = [value]; }
  } else urls = [];
  if (!Array.isArray(urls) || urls.some((url) => typeof url !== "string" || url.length === 0)) {
    throw new Error(`Product ${productId} has an invalid image_urls value`);
  }
  return urls as string[];
}

function localImageFilename(url: string): string | undefined {
  if (/^https?:\/\//i.test(url) || url.startsWith("/images/")) return undefined;
  const filename = path.posix.basename(url.split(/[?#]/, 1)[0]);
  if (!filename || filename === "." || filename === "/") {
    throw new Error(`Cannot resolve local image path: ${url}`);
  }
  return filename;
}

function imageKey(body: Buffer, extension: string): string {
  const normalizedExtension = extension === ".jpeg" ? ".jpg" : extension;
  const digest = createHash("sha256").update(body).digest("hex");
  return `images/${digest}${normalizedExtension}`;
}

async function scanExistingKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: "#pk, #sk",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      ExclusiveStartKey: startKey,
      ConsistentRead: true,
    }));
    for (const item of page.Items ?? []) {
      if (typeof item.pk === "string" && typeof item.sk === "string") keys.add(`${item.pk}\u0000${item.sk}`);
    }
    startKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return keys;
}

function keyOf(item: Record<string, unknown>): string {
  return `${String(item.pk)}\u0000${String(item.sk)}`;
}

async function writeAll(items: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < items.length; i += 25) {
    let pending: WriteRequest[] = items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } }));
    let attempts = 0;
    while (pending.length > 0) {
      const result = await doc.send(new BatchWriteCommand({
        RequestItems: { [tableName]: pending },
      }));
      pending = result.UnprocessedItems?.[tableName] ?? [];
      if (pending.length > 0) {
        attempts += 1;
        if (attempts > 8) throw new Error(`DynamoDB left ${pending.length} writes unprocessed after 8 retries`);
        await new Promise((resolve) => setTimeout(resolve, Math.min(100 * 2 ** attempts, 5000)));
      }
    }
  }
}

async function main() {
  if (unknownArgs.length) throw new Error(`Unknown option(s): ${unknownArgs.join(", ")}`);
  if (dryRun && replace) throw new Error("Use either --dry-run or --replace, not both.");
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required, for example postgres://user:pass@localhost:5432/stitch");
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const productColumnRows = (await pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'products' AND column_name = ANY($1::text[])",
      [["made_from", "image_background_color"]],
    )).rows;
    const productColumns = new Set(productColumnRows.map((row) => row.column_name));
    const madeFromColumn = productColumns.has("made_from") ? "made_from" : "''::text AS made_from";
    const imageBackgroundColumn = productColumns.has("image_background_color")
      ? "image_background_color"
      : "'#ffffff'::text AS image_background_color";
    const products = (await pool.query<ProductRow>(
      `SELECT id, name, description, ${madeFromColumn}, price, category, image_urls, ${imageBackgroundColumn}, created_at FROM products ORDER BY id`,
    )).rows;
    const orders = (await pool.query<OrderRow>(
      "SELECT id, name, email, address, total_amount, status, created_at FROM orders ORDER BY id",
    )).rows;
    const orderItems = (await pool.query<OrderItemRow>(
      "SELECT id, order_id, product_id, quantity, price_at_time FROM order_items ORDER BY id",
    )).rows;

    const items: Record<string, unknown>[] = [];
    const imagePlans = new Map<string, PlannedImage>();
    const productIds = new Set(products.map((product) => product.id));
    const orderIds = new Set(orders.map((order) => order.id));
    const itemIdsByOrder = new Set<string>();

    for (const product of products) {
      const imageUrls: string[] = [];
      for (const url of asUrlList(product.image_urls, product.id)) {
        const filename = localImageFilename(url);
        if (!filename) {
          imageUrls.push(url);
          continue;
        }
        const filePath = path.join(uploadsDir, filename);
        const extension = path.extname(filename).toLowerCase();
        const contentType = contentTypes[extension];
        if (!contentType) throw new Error(`Unsupported image type for ${url}: ${extension || "(none)"}`);
        let body: Buffer;
        try { body = await readFile(filePath); }
        catch { throw new Error(`Cannot read image ${url} at ${filePath}`); }
        const key = imageKey(body, extension);
        imagePlans.set(key, { source: url, key, contentType, body });
        imageUrls.push(`/${key}`);
      }
      items.push({
        pk: `PRODUCT#${product.id}`, sk: "META", gsi1pk: "PRODUCT", gsi1sk: String(product.id),
        id: String(product.id), name: product.name, description: product.description,
        madeFrom: product.made_from ?? "",
        price: product.price, category: product.category, imageUrls,
        imageBackgroundColor: product.image_background_color ?? "#ffffff",
        stockMode: "tracked",
        stockQuantity: 0,
        stockAvailable: "Out of stock",
        createdAt: iso(product.created_at, `Product ${product.id}`),
      });
      items.push({ pk: `CATEGORY#${product.category}`, sk: `PRODUCT#${product.id}`, productId: String(product.id) });
    }

    for (const order of orders) {
      items.push({
        pk: `ORDER#${order.id}`, sk: "META", id: String(order.id), name: order.name,
        email: order.email, address: order.address, totalAmount: order.total_amount,
        status: order.status ?? "pending", createdAt: iso(order.created_at, `Order ${order.id}`),
      });
    }
    for (const item of orderItems) {
      if (!orderIds.has(item.order_id)) throw new Error(`Order line ${item.id} refers to missing order ${item.order_id}`);
      if (!productIds.has(item.product_id)) throw new Error(`Order line ${item.id} refers to missing product ${item.product_id}`);
      const compoundId = `${item.order_id}:${item.id}`;
      if (itemIdsByOrder.has(compoundId)) throw new Error(`Duplicate order line id ${compoundId}`);
      itemIdsByOrder.add(compoundId);
      items.push({
        pk: `ORDER#${item.order_id}`, sk: `ITEM#${item.id}`, id: String(item.id),
        orderId: String(item.order_id), productId: String(item.product_id),
        quantity: item.quantity, priceAtTime: item.price_at_time,
      });
    }

    const uniqueKeys = new Set<string>();
    for (const item of items) {
      const key = keyOf(item);
      if (uniqueKeys.has(key)) throw new Error(`Migration would create duplicate DynamoDB key ${String(item.pk)} / ${String(item.sk)}`);
      uniqueKeys.add(key);
    }

    // This full, strongly consistent key scan happens before any S3 or DynamoDB writes.
    const existingKeys = await scanExistingKeys();
    const collisions = items.filter((item) => existingKeys.has(keyOf(item)));
    if (collisions.length && !replace && !dryRun) {
      throw new Error(
        `${collisions.length} destination item(s) already exist in ${tableName}. Preview with --dry-run, or pass --replace to overwrite only those exact migrated keys.`,
      );
    }

    console.log(`${dryRun ? "Would migrate" : "Validated"} ${products.length} products, ${orders.length} orders, ${orderItems.length} order lines.`);
    console.log(`${imagePlans.size} unique local image file(s) validated from ${uploadsDir}; ${collisions.length} destination key collision(s).`);
    if (dryRun) {
      if (collisions.length) console.log("A real run will stop on these collisions unless you pass --replace.");
      console.log("Dry run complete. No S3 or DynamoDB writes were made.");
      return;
    }

    // Content-addressed keys make image uploads repeatable and avoid UUID orphan copies.
    for (const image of imagePlans.values()) {
      await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: image.key, Body: image.body, ContentType: image.contentType,
      }));
    }
    await writeAll(items);
    console.log(`Migration complete: wrote ${items.length} DynamoDB items and uploaded ${imagePlans.size} images to ${bucket}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
