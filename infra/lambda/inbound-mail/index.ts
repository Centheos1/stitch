import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { randomUUID } from "crypto";

const s3 = new S3Client({});
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const tableName = process.env.TABLE_NAME;
const bucket = process.env.MAIL_BUCKET;

type SesRecord = {
  ses?: {
    mail?: { messageId?: string };
    receipt?: {
      recipients?: string[];
      spamVerdict?: { status?: string };
      virusVerdict?: { status?: string };
    };
  };
};

function emailKey(messageId: string): string {
  return messageId.replace(/[<>]/g, "").trim().toLowerCase();
}

function addresses(value: AddressObject | AddressObject[] | undefined): string[] {
  if (!value) return [];
  const objects = Array.isArray(value) ? value : [value];
  return objects.flatMap((entry) => entry.value.map((item) => item.address || "")).filter(Boolean).map((address) => address.toLowerCase());
}

function referenceList(mail: ParsedMail): string[] {
  const refs = Array.isArray(mail.references) ? mail.references : mail.references ? [mail.references] : [];
  const reply = mail.inReplyTo ? [mail.inReplyTo] : [];
  return [...reply, ...refs].filter(Boolean);
}

async function readRaw(messageId: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `raw/${messageId}` }));
      return await result.Body!.transformToString("utf8");
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

async function lookup(ref: string): Promise<{ orderId?: string; threadId?: string } | undefined> {
  const found = await doc.send(new GetCommand({
    TableName: tableName,
    Key: { pk: `EMAIL#${emailKey(ref)}`, sk: "META" },
  }));
  return found.Item as { orderId?: string; threadId?: string } | undefined;
}

async function destination(mail: ParsedMail, recipients: string[]): Promise<{ orderId: string; threadId: string }> {
  for (const address of [...addresses(mail.to), ...addresses(mail.cc), ...recipients]) {
    const match = (address.split("@")[0] || "").match(/^order-([0-9a-f-]{36})$/i);
    if (match) return { orderId: match[1], threadId: "" };
  }
  for (const ref of referenceList(mail)) {
    const found = await lookup(ref);
    if (found?.orderId) return { orderId: String(found.orderId), threadId: "" };
    if (found?.threadId) return { orderId: "", threadId: String(found.threadId) };
  }
  return { orderId: "", threadId: "" };
}

async function storeParts(id: string, mail: ParsedMail): Promise<{ htmlKey?: string; attachments: Record<string, unknown>[] }> {
  const html = typeof mail.html === "string" ? mail.html : "";
  let htmlKey: string | undefined;
  if (html && bucket) {
    htmlKey = `html/${id}.html`;
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: htmlKey,
      Body: html,
      ContentType: "text/html; charset=utf-8",
    }));
  }
  const attachments = [];
  for (const part of mail.attachments ?? []) {
    if (!part.content?.length) continue;
    const attachmentId = randomUUID();
    const key = `attachments/${id}/${attachmentId}`;
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: part.content,
      ContentType: part.contentType || "application/octet-stream",
    }));
    attachments.push({
      id: attachmentId,
      filename: (part.filename || "attachment").split(/[/\\]/).pop()?.slice(0, 120) || "attachment",
      contentType: part.contentType || "application/octet-stream",
      size: part.size || part.content.length,
      key,
      contentId: part.cid || undefined,
    });
  }
  return { htmlKey, attachments };
}

async function fileMessage(mail: ParsedMail, sesMessageId: string, recipients: string[], spam: boolean): Promise<void> {
  const where = await destination(mail, recipients);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const threadId = where.orderId ? "" : (where.threadId || randomUUID());
  const stored = await storeParts(id, mail);
  const from = addresses(mail.from)[0] || "";
  const to = addresses(mail.to);
  const cc = addresses(mail.cc);
  const text = (mail.text || "").slice(0, 20000) || "(This email had no readable text.)";
  const message = {
    id,
    orderId: where.orderId || undefined,
    threadId: threadId || undefined,
    direction: "in",
    kind: "reply",
    from,
    to: (to[0] || recipients[0] || ""),
    cc: cc.join(", ") || undefined,
    subject: mail.subject || "(no subject)",
    text,
    htmlKey: stored.htmlKey,
    rawKey: `raw/${sesMessageId}`,
    attachments: stored.attachments,
    messageId: mail.messageId || `<${sesMessageId}@inbound>`,
    spam,
    createdAt,
  };
  const pk = where.orderId ? `ORDER#${where.orderId}` : `THREAD#${threadId}`;
  const sk = `MSG#${createdAt}#${id}`;
  let created = true;
  try {
    await doc.send(new PutCommand({
      TableName: tableName,
      Item: { pk, sk, ...message },
      ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
    }));
  } catch (err) {
    if ((err as { name?: string }).name !== "ConditionalCheckFailedException") throw err;
    created = false;
  }
  if (!created) return;
  await doc.send(new PutCommand({
    TableName: tableName,
    Item: { pk: `MAILMSG#${id}`, sk: "META", messagePk: pk, messageSk: sk },
  }));
  await doc.send(new PutCommand({
    TableName: tableName,
    Item: {
      pk: `EMAIL#${emailKey(message.messageId)}`,
      sk: "META",
      orderId: where.orderId,
      threadId,
      messagePk: pk,
      messageSk: sk,
    },
  }));
  if (where.orderId) {
    await doc.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: `ORDER#${where.orderId}`, sk: "META" },
      UpdateExpression: "ADD unreadCount :one",
      ExpressionAttributeValues: { ":one": 1 },
    }));
    return;
  }
  await doc.send(new UpdateCommand({
    TableName: tableName,
    Key: { pk: "MAILBOX#inbox", sk: `THREAD#${threadId}` },
    UpdateExpression: "SET threadId = :thread, subject = if_not_exists(subject, :subject), correspondent = :from, snippet = :snippet, lastMessageAt = :at, archived = :open ADD unreadCount :one",
    ExpressionAttributeValues: {
      ":thread": threadId,
      ":subject": message.subject,
      ":from": from,
      ":snippet": text.slice(0, 140),
      ":at": createdAt,
      ":open": false,
      ":one": 1,
    },
  }));
}

export async function handler(event: { Records?: SesRecord[] }): Promise<void> {
  if (!tableName || !bucket) throw new Error("Mail filing is not configured");
  for (const record of event.Records ?? []) {
    const sesMessageId = record.ses?.mail?.messageId;
    if (!sesMessageId) continue;
    const raw = await readRaw(sesMessageId);
    const mail = await simpleParser(raw);
    const recipients = (record.ses?.receipt?.recipients ?? []).map((address) => address.toLowerCase());
    const spam = record.ses?.receipt?.spamVerdict?.status === "FAIL"
      || record.ses?.receipt?.virusVerdict?.status === "FAIL";
    await fileMessage(mail, sesMessageId, recipients, spam);
  }
}
