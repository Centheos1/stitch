import type { Express } from "express";
import type { Server } from "http";
import { OrderRequestError, storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { createImageUpload } from "./images";
import { changePassword, login, logout, requireAdmin } from "./auth";
import { deliver, MAIL_FROM, replyAddress, textToHtml } from "./mail";
import { putHtml, readBytes, createOutgoingUpload, deleteObjects } from "./mail-files";
import { MailInputError, messageHtml, removeThread, saveContactMessage, sendInboxMail } from "./inbox";
import type { OrderMessage } from "@shared/schema";
import { randomUUID } from "crypto";
import { logError } from "./logging";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Load balancer health check. Must stay in sync with healthCheckPath in the API stack.
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post(api.contact.submit.path, async (req, res) => {
    const input = api.contact.submit.input.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ message: "Enter a valid email address and a message of up to 10,000 characters." });
    }

    try {
      await saveContactMessage(input.data);
      res.status(204).end();
    } catch (err) {
      logError("Save contact message", err);
      res.status(500).json({ message: "We couldn't send your message. Please try again." });
    }
  });

  app.post(api.contact.report.path, async (req, res) => {
    const input = api.contact.report.input.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ message: "Enter a valid email address and a report of up to 10,000 characters." });
    }

    const { email, message, page } = input.data;
    try {
      await saveContactMessage({ email, message: `${message}\n\nPage: ${page}` }, "problem_report");
      res.status(204).end();
    } catch (err) {
      logError("Save website problem report", err);
      res.status(500).json({ message: "We couldn't send your report. Please try again." });
    }
  });

  app.get(api.products.list.path, async (req, res) => {
    try {
      const { category, search } = req.query;
      if ((category !== undefined && typeof category !== "string") ||
          (search !== undefined && typeof search !== "string")) {
        return res.status(400).json({ message: "Invalid product filters." });
      }
      const products = await storage.getProducts(category, search);
      res.json(products);
    } catch (err) {
      logError("List storefront products", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/products", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getProducts(undefined, undefined, true));
    } catch (err) {
      logError("List admin products", err);
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
      logError("Open storefront product", err);
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
          message: err.issues[0].message,
          field: err.issues[0].path.join('.'),
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
          message: err.issues[0].message,
          field: err.issues[0].path.join('.'),
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
      }).catch((err) => {
        // The order is already saved. Returning an error here invites a duplicate submission.
        logError("Record order confirmation email", err);
      });
      res.status(201).json(order);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.issues[0].message,
          field: err.issues[0].path.join("."),
        });
      }
      if (err instanceof OrderRequestError) {
        return res.status(err.status).json({ message: err.message });
      }
      logError("Create order", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/orders", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.listOrders());
    } catch (err) {
      logError("List orders", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/inbox", requireAdmin, async (req, res) => {
    try {
      const archived = req.query.box === "archive";
      res.json(await storage.listMailThreads(archived));
    } catch (err) {
      logError("List inbox threads", err);
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
      logError("Open inbox thread", err);
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
      logError("Delete inbox thread", err);
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
      logError("Send inbox mail", err);
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
      if (err instanceof Error && err.message === "That file type is not supported") {
        return res.status(400).json({ message: err.message });
      }
      logError("Prepare mail upload", err);
      res.status(500).json({ message: "Could not prepare the attachment upload." });
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
      logError("Delete mail uploads", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/mail/messages/:id/body", requireAdmin, async (req, res) => {
    try {
      const message = await storage.getMailMessage(String(req.params.id));
      if (!message) return res.status(404).json({ message: "Message not found" });
      res.json({ html: await messageHtml(message) });
    } catch (err) {
      logError("Read mailbox message", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/mail/messages/:id/attachments/:attachmentId", requireAdmin, async (req, res) => {
    try {
      const message = await storage.getMailMessage(String(req.params.id));
      const file = message?.attachments?.find((entry) => entry.id === String(req.params.attachmentId));
      if (!file) return res.status(404).json({ message: "Attachment not found" });
      const bytes = await readBytes(file.key);
      res.attachment(file.filename);
      res.setHeader("Content-Type", file.contentType || "application/octet-stream");
      res.send(bytes);
    } catch (err) {
      logError("Download mailbox attachment", err);
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
      logError("Open order", err);
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
      logError("Send order message", err);
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
      logError("Update order status", err);
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
      if (err instanceof Error && err.message === "Message not found") {
        return res.status(404).json({ message: err.message });
      }
      logError("Attach inbox message to order", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/upload-url", requireAdmin, async (req, res) => {
    try {
      const contentType = typeof req.body?.contentType === "string" ? req.body.contentType : "";
      const upload = await createImageUpload(contentType);
      res.json(upload);
    } catch (err) {
      if (err instanceof Error && err.message === "Only JPEG, PNG, WebP, and GIF images can be uploaded") {
        return res.status(400).json({ message: err.message });
      }
      logError("Prepare product image upload", err);
      res.status(500).json({ message: "Could not prepare the image upload." });
    }
  });

  app.post("/api/admin/login", login);
  app.post("/api/admin/logout", logout);
  app.post("/api/admin/password", requireAdmin, changePassword);
  app.get("/api/admin/session", requireAdmin, (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true });
  });

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
