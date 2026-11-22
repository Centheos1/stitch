import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { createImageUpload } from "./images";
import { changePassword, login, logout, requireAdmin } from "./auth";
import { deliver, MAIL_FROM, replyAddress, textToHtml } from "./mail";
import { putHtml, readBytes, createOutgoingUpload, deleteObjects } from "./mail-files";
import { MailInputError, messageHtml, removeThread, sendInboxMail } from "./inbox";
import type { OrderMessage } from "@shared/schema";
import { randomUUID } from "crypto";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Load balancer health check. Must stay in sync with healthCheckPath in the API stack.
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get(api.products.list.path, async (req, res) => {
    try {
      const { category, search } = req.query;
      const products = await storage.getProducts(category as string, search as string);
      res.json(products);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/products", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getProducts(undefined, undefined, true));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.products.get.path, async (req, res) => {
    try {
      const product = await storage.getProduct(String(req.params.id));
      if (!product || !product.shopVisible) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.products.create.path, requireAdmin, async (req, res) => {
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

  app.put(api.products.update.path, requireAdmin, async (req, res) => {
    try {
      const bodySchema = api.products.update.input.extend({
        price: z.coerce.number().optional()
      });
      const input = bodySchema.parse(req.body);
      const product = await storage.updateProduct(String(req.params.id), input);
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

  app.delete(api.products.delete.path, requireAdmin, async (req, res) => {
    try {
      await storage.deleteProduct(String(req.params.id));
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.orders.create.path, async (req, res) => {
    try {
      const input = api.orders.create.input.parse(req.body);
      const { order, items } = await storage.createOrder(input);
      const summary = items.map((item) => {
        const picks = (item.options ?? []).map((option) => `${option.name}: ${option.choice}`).join(", ");
        const label = `${item.quantity} x ${item.productName ?? "Item"}${picks ? ` (${picks})` : ""}`;
        return `${label} — $${((item.unitPrice ?? 0) / 100).toFixed(2)} each`;
      }).join("\n");
      const text = [
        `Hello ${order.name},`,
        "",
        "We have your request. This is not a payment yet. We'll reply to confirm the details.",
        "",
        summary,
        "",
        `Total, including $5.00 shipping: $${(order.totalAmount / 100).toFixed(2)}`,
        "",
        "Reply to this email and your message comes straight back to the shop.",
      ].join("\n");
      await sendOrderNote({
        orderId: order.id,
        to: order.email,
        subject: "Your STITCH request",
        text,
        kind: "order",
      });
      res.status(201).json(order);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      const message = err instanceof Error ? err.message : "Internal server error";
      const status = message.includes("no longer available") || message.includes("Choose") || message.includes("is not a") ? 400 : message.includes("in stock") ? 409 : 500;
      res.status(status).json({ message: status === 500 ? "Internal server error" : message });
    }
  });

  app.get("/api/admin/orders", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.listOrders());
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/inbox", requireAdmin, async (req, res) => {
    try {
      const archived = req.query.box === "archive";
      res.json(await storage.listMailThreads(archived));
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/inbox/:threadId", requireAdmin, async (req, res) => {
    try {
      const found = await storage.getMailThread(String(req.params.threadId));
      if (!found) return res.status(404).json({ message: "That conversation was not found." });
      await storage.markThreadRead(found.thread.threadId);
      res.json({ ...found, thread: { ...found.thread, unreadCount: 0 } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/inbox/:threadId/archive", requireAdmin, async (req, res) => {
    try {
      const archived = req.body?.archived !== false;
      await storage.setThreadArchived(String(req.params.threadId), archived);
      res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      res.status(message.includes("not found") || message.includes("ConditionalCheckFailed") ? 404 : 500).json({
        message: message.includes("not found") ? "That conversation was not found." : "Internal server error",
      });
    }
  });

  app.delete("/api/admin/inbox/:threadId", requireAdmin, async (req, res) => {
    try {
      await removeThread(String(req.params.threadId));
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/mail/send", requireAdmin, async (req, res) => {
    try {
      const sent = await sendInboxMail({
        from: String(req.body?.from ?? ""),
        to: String(req.body?.to ?? ""),
        cc: typeof req.body?.cc === "string" ? req.body.cc : "",
        bcc: typeof req.body?.bcc === "string" ? req.body.bcc : "",
        subject: typeof req.body?.subject === "string" ? req.body.subject : "",
        html: typeof req.body?.html === "string" ? req.body.html : "",
        text: typeof req.body?.text === "string" ? req.body.text : "",
        threadId: typeof req.body?.threadId === "string" ? req.body.threadId : "",
        mode: typeof req.body?.mode === "string" ? req.body.mode : "new",
        attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
      });
      await storage.markThreadRead(sent.threadId);
      res.status(201).json(sent);
    } catch (err) {
      if (err instanceof MailInputError) return res.status(400).json({ message: err.message });
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/mail/upload-url", requireAdmin, async (req, res) => {
    try {
      const contentType = typeof req.body?.contentType === "string" ? req.body.contentType : "";
      const filename = typeof req.body?.filename === "string" ? req.body.filename : "attachment";
      const size = Number(req.body?.size);
      if (!Number.isFinite(size) || size < 1 || size > 10 * 1024 * 1024) {
        return res.status(400).json({ message: "Attachments must be 10 MB or smaller." });
      }
      res.json(await createOutgoingUpload(contentType, filename));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      res.status(400).json({ message });
    }
  });

  app.delete("/api/admin/mail/uploads", requireAdmin, async (req, res) => {
    try {
      const key = typeof req.body?.key === "string" ? req.body.key : "";
      if (!key.startsWith("outgoing/") || key.includes("..")) {
        return res.status(400).json({ message: "That file is not available." });
      }
      await deleteObjects([key]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/mail/messages/:id/body", requireAdmin, async (req, res) => {
    try {
      const message = await storage.getMailMessage(String(req.params.id));
      if (!message) return res.status(404).json({ message: "Message not found" });
      res.json({ html: await messageHtml(message) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/mail/messages/:id/attachments/:attachmentId", requireAdmin, async (req, res) => {
    try {
      const message = await storage.getMailMessage(String(req.params.id));
      const file = message?.attachments?.find((entry) => entry.id === String(req.params.attachmentId));
      if (!file) return res.status(404).json({ message: "Attachment not found" });
      const bytes = await readBytes(file.key);
      const filename = file.filename.replace(/"/g, "");
      res.setHeader("Content-Type", file.contentType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(bytes);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/orders/:id", requireAdmin, async (req, res) => {
    try {
      const bundle = await storage.getOrder(String(req.params.id));
      if (!bundle) return res.status(404).json({ message: "Order not found" });
      await storage.markOrderRead(bundle.order.id);
      res.json({ ...bundle, order: { ...bundle.order, unreadCount: 0 } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/orders/:id/messages", requireAdmin, async (req, res) => {
    try {
      const bundle = await storage.getOrder(String(req.params.id));
      if (!bundle) return res.status(404).json({ message: "Order not found" });
      const kind = req.body?.kind === "payment_request" ? "payment_request" : req.body?.kind === "question" ? "question" : "reply";
      const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
      if (!text) return res.status(400).json({ message: "Write a message first." });
      let paymentAmount: number | undefined;
      if (kind === "payment_request") {
        const parsed = Number(req.body?.amountCents);
        if (!Number.isInteger(parsed) || parsed < 1) {
          return res.status(400).json({ message: "Enter the payment amount." });
        }
        paymentAmount = parsed;
      }
      const subject = kind === "payment_request"
        ? "Payment for your STITCH order"
        : kind === "question"
          ? "A question about your STITCH order"
          : "Re: Your STITCH order";
      const amountLine = paymentAmount
        ? `The amount to pay is $${(paymentAmount / 100).toFixed(2)}.\n\n`
        : "";
      const body = `${text}\n\n${amountLine}Reply to this email and it comes back to the shop.`;
      const previous = [...bundle.messages].reverse().find((entry) => entry.messageId);
      const message = await sendOrderNote({
        orderId: bundle.order.id,
        to: bundle.order.email,
        subject,
        text: body,
        kind,
        inReplyTo: previous?.messageId,
      });
      const status = kind === "payment_request" ? "payment_requested" : "waiting_on_customer";
      const order = await storage.setOrderStatus(
        bundle.order.id,
        status,
        kind === "payment_request" ? paymentAmount : undefined,
      );
      res.status(201).json({ message, order });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/orders/:id/status", requireAdmin, async (req, res) => {
    try {
      const status = String(req.body?.status ?? "");
      if (!["approved", "paid", "fulfilled", "declined", "new"].includes(status)) {
        return res.status(400).json({ message: "That status is not available." });
      }
      const bundle = await storage.getOrder(String(req.params.id));
      if (!bundle) return res.status(404).json({ message: "Order not found" });
      const order = await storage.setOrderStatus(bundle.order.id, status);
      const notes: Record<string, string> = {
        approved: "Your order has been approved.",
        paid: "We've received your payment. Thank you.",
        fulfilled: "Your order is finished and on its way.",
        declined: "We can't take this order. Reply if you'd like to talk it through.",
      };
      if (notes[status]) {
        await sendOrderNote({
          orderId: bundle.order.id,
          to: bundle.order.email,
          subject: "Your STITCH order",
          text: `${notes[status]}\n\nReply to this email and it comes back to the shop.`,
          kind: status,
        });
      }
      res.json(order);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "";
      if (message.startsWith("Insufficient stock") || message.startsWith("Stock changed")) {
        return res.status(409).json({ message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/inbox/:messageId/attach", requireAdmin, async (req, res) => {
    try {
      const orderId = typeof req.body?.orderId === "string" ? req.body.orderId : "";
      const bundle = await storage.getOrder(orderId);
      if (!bundle) return res.status(404).json({ message: "Order not found" });
      await storage.attachMail(String(req.params.messageId), orderId);
      res.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      res.status(message === "Message not found" ? 404 : 500).json({ message });
    }
  });

  app.post("/api/upload-url", requireAdmin, async (req, res) => {
    try {
      const contentType = typeof req.body?.contentType === "string" ? req.body.contentType : "";
      const upload = await createImageUpload(contentType);
      res.json(upload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      res.status(400).json({ message });
    }
  });

  app.post("/api/admin/login", login);
  app.post("/api/admin/logout", logout);
  app.post("/api/admin/password", requireAdmin, changePassword);
  app.get("/api/admin/session", requireAdmin, (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true });
  });

  // Seed DB on startup
  seedDatabase().catch(console.error);

  return httpServer;
}

async function sendOrderNote(input: {
  orderId: string;
  to: string;
  subject: string;
  text: string;
  kind: string;
  inReplyTo?: string;
}): Promise<OrderMessage> {
  const html = textToHtml(input.text);
  const delivery = await deliver({
    from: MAIL_FROM,
    to: [input.to],
    replyTo: replyAddress(input.orderId),
    subject: input.subject,
    text: input.text,
    html,
    inReplyTo: input.inReplyTo,
    references: input.inReplyTo ? [input.inReplyTo] : undefined,
  });
  const id = randomUUID();
  const htmlKey = await putHtml(id, html);
  const message: OrderMessage = {
    id,
    orderId: input.orderId,
    direction: "out",
    kind: input.kind,
    from: MAIL_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    htmlKey,
    messageId: delivery.messageId,
    delivered: delivery.delivered,
    deliveryError: delivery.deliveryError,
    createdAt: new Date().toISOString(),
  };
  await storage.saveOrderMessage(input.orderId, message);
  return message;
}

async function seedDatabase() {
  const existingProducts = await storage.getProducts(undefined, undefined, true);
  if (existingProducts.length === 0) {
    const seedProducts = [
      {
        name: "Handmade Felt Fox",
        description: "A cute little fox made from 100% wool felt. Perfect for a woodland nursery or as a shelf decoration.",
        price: 1500,
        category: "Animals",
        imageUrls: ["https://images.unsplash.com/photo-1558235282-5989d38c644c?w=500&q=80"],
      },
      {
        name: "Embroidered Tote Bag",
        description: "Sturdy canvas tote bag featuring a colorful embroidered floral pattern. Great for groceries or books.",
        price: 2500,
        category: "Bags",
        imageUrls: ["https://images.unsplash.com/photo-1544816155-12df9643f363?w=500&q=80"],
      },
      {
        name: "Knitted Winter Scarf",
        description: "Chunky knit scarf in warm yellow. Very soft and cozy for cold winter days.",
        price: 3500,
        category: "Other Handmade Items",
        imageUrls: ["https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?w=500&q=80"],
      },
      {
        name: "Floral Hair Clips Set",
        description: "Set of three handmade hair clips decorated with miniature felt flowers.",
        price: 1200,
        category: "Hair Clips",
        imageUrls: ["https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=500&q=80"],
      },
      {
        name: "Felt Christmas Star",
        description: "Hand-stitched felt Christmas star ornament with gold thread detailing.",
        price: 850,
        category: "Christmas Decorations",
        imageUrls: ["https://images.unsplash.com/photo-1543258103-a62bdc069871?w=500&q=80"],
      }
    ];

    for (const product of seedProducts) {
      await storage.createProduct(product);
    }
    console.log("Database seeded with initial products.");
  }
}
