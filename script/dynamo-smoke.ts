/**
 * Exercises the DynamoDB storage against the real table, then deletes what it wrote.
 * Requires TABLE_NAME and AWS credentials.
 */
import { storage } from "../server/storage";

const name = `Smoke test ${Date.now()}`;
let productId: string | undefined;

async function main() {
  const created = await storage.createProduct({
    name,
    description: "Temporary item created by the DynamoDB smoke test.",
    price: 1234,
    category: "Smoke",
    imageUrls: ["https://example.com/smoke.jpg"],
  });
  productId = created.id;

  const fetched = await storage.getProduct(created.id);
  if (fetched?.name !== name) throw new Error("getProduct did not return the created product");

  const byCategory = await storage.getProducts("Smoke");
  if (!byCategory.some((product) => product.id === created.id)) {
    throw new Error("category query missed the product");
  }

  const bySearch = await storage.getProducts(undefined, "smoke test");
  if (!bySearch.some((product) => product.id === created.id)) {
    throw new Error("name search missed the product");
  }

  const updated = await storage.updateProduct(created.id, {
    category: "Smoke Moved",
    price: 1500,
  });
  if (updated?.category !== "Smoke Moved" || updated.price !== 1500) {
    throw new Error("update did not apply");
  }
  const oldCategory = await storage.getProducts("Smoke");
  if (oldCategory.some((product) => product.id === created.id)) {
    throw new Error("product still listed under the old category");
  }

  const order = await storage.createOrder(
    {
      name: "Smoke Buyer",
      email: "smoke@example.com",
      address: "1 Test Street, Testville",
      totalAmount: 2000,
    },
    [{ productId: created.id, quantity: 1, priceAtTime: 1500 }],
  );
  if (!order.id || order.status !== "pending") throw new Error("order was not created");

  await storage.deleteProduct(created.id);
  productId = undefined;
  if (await storage.getProduct(created.id)) throw new Error("product was not deleted");

  console.log("DynamoDB smoke test passed.");
}

main()
  .catch(async (error) => {
    console.error(error);
    if (productId) await storage.deleteProduct(productId).catch(() => undefined);
    process.exit(1);
  });
