import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { randomUUID } from "crypto";
import { INBOX_FROM_ADDRESSES } from "@shared/schema";

const client = new SESv2Client({
  region: process.env.AWS_REGION || "ap-southeast-2",
});

export const MAIL_DOMAIN = process.env.ORDER_DOMAIN || "stitchhandmade.shop";
export const MAIL_FROM = process.env.MAIL_FROM || `orders@${MAIL_DOMAIN}`;

const DISPLAY_NAMES: Record<string, string> = {
  [MAIL_FROM]: "Stitch Handmade",
  "info@stitchhandmade.shop": "Stitch Handmade",
  "audrey@stitchhandmade.shop": "Audrey",
};

const ALLOWED_FROM = new Set<string>([MAIL_FROM, ...INBOX_FROM_ADDRESSES]);

export function replyAddress(orderId: string): string {
  return `order-${orderId}@${MAIL_DOMAIN}`;
}

export function makeMessageId(): string {
  return `<${randomUUID()}@${MAIL_DOMAIN}>`;
}

export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!DOCTYPE html><html><body style="font-family:Georgia,serif;font-size:16px;color:#222;line-height:1.5">${paragraphs}</body></html>`;
}

export type OutboundAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
  cid?: string;
};

export type OutboundMail = {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: OutboundAttachment[];
};

export type DeliveryResult = {
  messageId: string;
  delivered: boolean;
  deliveryError?: string;
};

export class MailRejected extends Error {}

function formatFrom(address: string): string {
  const name = DISPLAY_NAMES[address] ?? "Stitch Handmade";
  return `${name} <${address}>`;
}

export async function deliver(mail: OutboundMail): Promise<DeliveryResult> {
  const from = mail.from.trim().toLowerCase();
  if (!ALLOWED_FROM.has(from)) {
    return { messageId: makeMessageId(), delivered: false, deliveryError: "That from address is not available." };
  }
  const messageId = makeMessageId();
  const total = (mail.attachments ?? []).reduce((sum, file) => sum + file.content.length, 0);
  if (total > 10 * 1024 * 1024) {
    return { messageId, delivered: false, deliveryError: "Attachments must be 10 MB or smaller." };
  }
  try {
    const composer = new MailComposer({
      from: formatFrom(from),
      to: mail.to,
      cc: mail.cc?.length ? mail.cc : undefined,
      bcc: mail.bcc?.length ? mail.bcc : undefined,
      subject: mail.subject,
      text: mail.text,
      html: mail.html || textToHtml(mail.text),
      replyTo: mail.replyTo,
      messageId,
      inReplyTo: mail.inReplyTo,
      references: mail.references,
      attachments: (mail.attachments ?? []).map((file) => ({
        filename: file.filename,
        content: file.content,
        contentType: file.contentType,
        cid: file.cid,
      })),
    });
    const raw = await composer.compile().build();
    await client.send(new SendEmailCommand({
      FromEmailAddress: formatFrom(from),
      Destination: {
        ToAddresses: mail.to,
        CcAddresses: mail.cc?.length ? mail.cc : undefined,
        BccAddresses: mail.bcc?.length ? mail.bcc : undefined,
      },
      Content: { Raw: { Data: raw } },
    }));
    return { messageId, delivered: true };
  } catch (err) {
    const deliveryError = err instanceof Error ? err.message : "Email was not sent";
    console.error("Email failed", deliveryError);
    return { messageId, delivered: false, deliveryError };
  }
}
