import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get(api.products.list.path, async (req, res) => {
    try {
      const { category, search } = req.query;
      const products = await storage.getProducts(category as string, search as string);
      res.json(products);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.products.get.path, async (req, res) => {
    try {
      const product = await storage.getProduct(Number(req.params.id));
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.products.create.path, async (req, res) => {
    try {
      const bodySchema = api.products.create.input.extend({
        price: z.coerce.number()
      });
      const input = bodySchema.parse(req.body);
      const product = await storage.createProduct(input);
      res.status(201).json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.products.update.path, async (req, res) => {
    try {
      const bodySchema = api.products.update.input.extend({
        price: z.coerce.number().optional()
      });
      const input = bodySchema.parse(req.body);
      const product = await storage.updateProduct(Number(req.params.id), input);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.products.delete.path, async (req, res) => {
    try {
      await storage.deleteProduct(Number(req.params.id));
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.orders.create.path, async (req, res) => {
    try {
      const input = api.orders.create.input.parse(req.body);
      const { items, ...orderData } = input;
      const order = await storage.createOrder(orderData, items);
      res.status(201).json(order);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Seed DB on startup
  seedDatabase().catch(console.error);

  return httpServer;
}

async function seedDatabase() {
  const existingProducts = await storage.getProducts();
  if (existingProducts.length === 0) {
    const seedProducts = [
      {
        name: "Handmade Felt Fox",
        description: "A cute little fox made from 100% wool felt. Perfect for a woodland nursery or as a shelf decoration.",
        price: 1500,
        category: "Animals",
        imageUrl: "https://images.unsplash.com/photo-1558235282-5989d38c644c?w=500&q=80",
      },
      {
        name: "Embroidered Tote Bag",
        description: "Sturdy canvas tote bag featuring a colorful embroidered floral pattern. Great for groceries or books.",
        price: 2500,
        category: "Bags",
        imageUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363?w=500&q=80",
      },
      {
        name: "Knitted Winter Scarf",
        description: "Chunky knit scarf in warm yellow. Very soft and cozy for cold winter days.",
        price: 3500,
        category: "Other Handmade Items",
        imageUrl: "https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?w=500&q=80",
      },
      {
        name: "Floral Hair Clips Set",
        description: "Set of three handmade hair clips decorated with miniature felt flowers.",
        price: 1200,
        category: "Hair Clips",
        imageUrl: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=500&q=80",
      },
      {
        name: "Felt Christmas Star",
        description: "Hand-stitched felt Christmas star ornament with gold thread detailing.",
        price: 850,
        category: "Christmas Decorations",
        imageUrl: "https://images.unsplash.com/photo-1543258103-a62bdc069871?w=500&q=80",
      }
    ];

    for (const product of seedProducts) {
      await storage.createProduct(product);
    }
    console.log("Database seeded with initial products.");
  }
}
