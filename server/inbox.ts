import { invoicePaymentDue } from "@shared/invoice-terms";
import { INVOICE_LOGO_HTML, STITCH_LOGO_URL, isPaymentInvoice } from "@shared/branding";
import { randomUUID } from "crypto";
import { INBOX_FROM_ADDRESSES, PROBLEM_REPORT_SUBJECT, type MailAttachment, type OrderMessage } from "@shared/schema";
import { deliver, makeMessageId, textToHtml } from "./mail";
import { copyObject, deleteObjects, describeObject, objectKeys, putHtml, readBytes, readHtml } from "./mail-files";
import { htmlToText, renderMailHtml, sanitizeMailHtml } from "./mail-html";
import { storage } from "./storage";

export class MailInputError extends Error {}

export async function saveContactMessage(
  { email, message }: { email: string; message: string },
  kind: "contact" | "problem_report" = "contact",
): Promise<void> {
  const id = randomUUID();
  const subject = kind === "problem_report" ? PROBLEM_REPORT_SUBJECT : "Website contact form";
  await storage.saveThreadMessage({
    threadId: id,
    subject,
    correspondent: email,
    snippet: message,
    message: {
      id,
      direction: "in",
      kind,
      from: email,
      to: INBOX_FROM_ADDRESSES[0],
      subject,
      text: message,
      // Include a stable reference in the first reply so incoming mail can find this thread.
      messageId: makeMessageId(),
      createdAt: new Date().toISOString(),
    },
  });
}

function parseAddressList(value: string): string[] {
  if (!value.trim()) return [];
  const addresses = value.split(/[,;]/).map((part) => part.trim().toLowerCase()).filter(Boolean);
  for (const address of addresses) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new MailInputError(`${address} is not an email address.`);
  }
  return addresses;
}

function assertFrom(value: string): string {
  const from = value.trim().toLowerCase();
  if (!INBOX_FROM_ADDRESSES.includes(from as typeof INBOX_FROM_ADDRESSES[number])) {
    throw new MailInputError("Choose info@stitchhandmade.shop or audrey@stitchhandmade.shop.");
  }
  return from;
}

async function loadAttachments(files: { key: string; filename: string; contentType: string }[]): Promise<MailAttachment[]> {
  let total = 0;
  const attachments: MailAttachment[] = [];
  for (const file of files) {
    if (!file.key.startsWith("outgoing/") || file.key.includes("..")) {
      throw new MailInputError("That attachment is not available.");
    }
    const described = await describeObject(file.key);
    total += described.size;
    if (total > 10 * 1024 * 1024) throw new MailInputError("Attachments must be 10 MB or smaller.");
    const filename = file.filename.split(/[/\\]/).pop()?.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "attachment";
    attachments.push({
      id: randomUUID(),
      filename,
      contentType: described.contentType || file.contentType || "application/octet-stream",
      size: described.size,
      key: file.key,
    });
  }
  return attachments;
}

async function quoteOriginal(message: OrderMessage): Promise<{ text: string; html: string }> {
  const originalHtml = message.htmlKey ? await readHtml(message.htmlKey) : textToHtml(message.text);
  const quotedText = message.text.split("\n").map((line) => `> ${line}`).join("\n");
  return {
    text: quotedText,
    html: `<blockquote style="margin:16px 0 0;border-left:3px solid #ccc;padding-left:12px;color:#444">${originalHtml}</blockquote>`,
  };
}

export async function sendInboxMail(input: {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  html?: string;
  text?: string;
  threadId?: string;
  mode?: string;
  attachments?: { key: string; filename: string; contentType: string }[];
}): Promise<{ threadId: string; message: OrderMessage }> {
  const from = assertFrom(input.from);
  const to = parseAddressList(input.to);
  const cc = parseAddressList(input.cc ?? "");
  const bcc = parseAddressList(input.bcc ?? "");
  if (to.length === 0) throw new MailInputError("Add a recipient.");
  if (to.length + cc.length + bcc.length > 20) throw new MailInputError("Too many recipients.");
  let draftHtml = (input.html ?? "").trim();
  const dueDateMarker = /<span data-invoice-due="true">[^<]*<\/span>/g;
  const hasDueDate = draftHtml.includes('<span data-invoice-due="true">');
  if (hasDueDate) {
    const terms = await storage.getInvoiceTerms();
    draftHtml = draftHtml.replace(dueDateMarker, invoicePaymentDue(terms.days));
  }
  const writtenHtml = sanitizeMailHtml(draftHtml);
  const writtenText = ((hasDueDate ? htmlToText(writtenHtml) : input.text) || htmlToText(writtenHtml)).trim();
  if (!writtenText && !writtenHtml) throw new MailInputError("Write a message first.");

  const mode = input.mode === "reply" || input.mode === "replyAll" || input.mode === "forward" ? input.mode : "new";
  let threadId = input.threadId?.trim() || "";
  let subject = (input.subject ?? "").trim();
  let inReplyTo: string | undefined;
  let references: string[] | undefined;
  let correspondent = to[0];
  let quote = { text: "", html: "" };
  let carried: MailAttachment[] = [];

  if (mode !== "new") {
    if (!threadId) throw new MailInputError("Choose a message to reply to.");
    const existing = await storage.getMailThread(threadId);
    if (!existing) throw new MailInputError("That conversation was not found.");
    const previous = [...existing.messages].reverse().find((entry) => entry.messageId);
    if (mode !== "forward" && previous?.messageId) {
      inReplyTo = previous.messageId;
      references = existing.messages.map((entry) => entry.messageId).filter((entry): entry is string => Boolean(entry));
    }
    const quotedMessage = existing.messages[existing.messages.length - 1];
    quote = await quoteOriginal(quotedMessage);
    if (mode === "forward") carried = quotedMessage.attachments ?? [];
    if (!subject) subject = existing.thread.subject;
    if (mode !== "forward" && !/^re:/i.test(subject)) subject = `Re: ${subject}`;
    if (mode === "forward" && !/^fwd:/i.test(subject)) subject = `Fwd: ${subject}`;
    correspondent = mode === "forward" ? to[0] : existing.thread.correspondent || to[0];
    if (threadId.startsWith("unmatched-")) {
      threadId = randomUUID();
      const original = existing.messages[0];
      await storage.saveThreadMessage({
        threadId,
        subject: original.subject,
        correspondent: original.from,
        snippet: original.text,
        message: { ...original, threadId },
      });
      await storage.discardUnmatched(original);
    }
  } else {
    threadId = randomUUID();
    if (!subject) throw new MailInputError("Add a subject.");
  }

  const text = [writtenText, quote.text].filter(Boolean).join("\n\n");
  let body = writtenHtml || textToHtml(writtenText);
  if (isPaymentInvoice(writtenText) && !body.includes(`src="${STITCH_LOGO_URL}"`)) {
    body = INVOICE_LOGO_HTML + body;
  }
  const html = sanitizeMailHtml(`${body}${quote.html}`);
  let deliveryHtml = html;
  const logoSrc = `src="${STITCH_LOGO_URL}"`;
  const logoCid = "stitch-invoice-logo@stitchhandmade.shop";
  let logo: Buffer | undefined;
  if (body.includes(logoSrc)) {
    try {
      const response = await fetch(STITCH_LOGO_URL, { signal: AbortSignal.timeout(5000) });
      if (response.ok && response.headers.get("content-type")?.startsWith("image/png")) {
        logo = Buffer.from(await response.arrayBuffer());
        deliveryHtml = html.replaceAll(logoSrc, `src="cid:${logoCid}"`);
      }
    } catch {
      // The hosted logo remains in the email if the inline copy cannot be loaded.
    }
  }
  const attachments = await loadAttachments(input.attachments ?? []);
  const copies: MailAttachment[] = [...attachments];
  for (const file of carried) {
    const id = randomUUID();
    const key = `attachments/${id}/${file.id}`;
    await copyObject(file.key, key);
    copies.push({ ...file, id, key });
  }
  if (copies.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) {
    throw new MailInputError("Attachments must be 10 MB or smaller.");
  }
  const payload = await Promise.all(copies.map(async (file) => ({
    filename: file.filename,
    contentType: file.contentType,
    content: await readBytes(file.key),
  })));

  const delivery = await deliver({
    from,
    to,
    cc,
    bcc,
    replyTo: from,
    subject,
    text,
    html: deliveryHtml,
    inReplyTo,
    references,
    attachments: logo
      ? [...payload, { filename: "STITCH-logo.png", contentType: "image/png", content: logo, cid: logoCid }]
      : payload,
  });

  const id = randomUUID();
  const htmlKey = await putHtml(id, html);
  const message: OrderMessage = {
    id,
    threadId,
    direction: "out",
    kind: mode,
    from,
    to: to.join(", "),
    cc: cc.join(", ") || undefined,
    bcc: bcc.join(", ") || undefined,
    subject,
    text,
    htmlKey,
    attachments: copies,
    messageId: delivery.messageId,
    delivered: delivery.delivered,
    deliveryError: delivery.deliveryError,
    createdAt: new Date().toISOString(),
  };
  await storage.saveThreadMessage({
    threadId,
    subject,
    correspondent,
    snippet: writtenText || subject,
    message,
  });
  return { threadId, message };
}

export async function messageHtml(message: OrderMessage): Promise<string> {
  const html = message.htmlKey ? await readHtml(message.htmlKey) : textToHtml(message.text);
  return renderMailHtml(html, message.attachments ?? []);
}

export async function removeThread(threadId: string): Promise<void> {
  const messages = await storage.deleteMailThread(threadId);
  await deleteObjects(messages.flatMap((message) => objectKeys(message)));
}
