import { randomUUID } from "crypto";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { MailAttachment } from "@shared/schema";

const bucket = process.env.MAIL_BUCKET;
const client = new S3Client({ region: process.env.AWS_REGION || "ap-southeast-2" });

export function mailBucketReady(): boolean {
  return Boolean(bucket);
}

export async function putHtml(id: string, html: string): Promise<string | undefined> {
  if (!bucket || !html) return undefined;
  const key = `html/${id}.html`;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: html,
    ContentType: "text/html; charset=utf-8",
  }));
  return key;
}

export async function readHtml(key: string): Promise<string> {
  if (!bucket) return "";
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return result.Body?.transformToString("utf8") ?? "";
}

export async function readBytes(key: string): Promise<Buffer> {
  if (!bucket) throw new Error("Mail storage is not configured");
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await result.Body?.transformToByteArray();
  return Buffer.from(bytes ?? []);
}

export async function describeObject(key: string): Promise<{ size: number; contentType: string }> {
  if (!bucket) throw new Error("Mail storage is not configured");
  const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return { size: result.ContentLength ?? 0, contentType: result.ContentType || "application/octet-stream" };
}

export async function copyObject(sourceKey: string, destKey: string): Promise<void> {
  if (!bucket) throw new Error("Mail storage is not configured");
  await client.send(new CopyObjectCommand({
    Bucket: bucket,
    CopySource: `${bucket}/${sourceKey}`,
    Key: destKey,
  }));
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (!bucket) return;
  await Promise.all(keys.filter(Boolean).map((key) => client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }))));
}

export async function signedGet(key: string): Promise<string> {
  if (!bucket) return "";
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 900 });
}

export async function createOutgoingUpload(contentType: string, filename: string): Promise<{ uploadUrl: string; key: string; filename: string }> {
  if (!bucket) throw new Error("Mail storage is not configured");
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(contentType)) throw new Error("That file type is not supported");
  const safeName = filename.split(/[/\\]/).pop()?.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "attachment";
  const key = `outgoing/${randomUUID()}`;
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 300 });
  return { uploadUrl, key, filename: safeName };
}

export function objectKeys(message: { htmlKey?: string; rawKey?: string; attachments?: MailAttachment[] }): string[] {
  return [
    message.htmlKey ?? "",
    message.rawKey ?? "",
    ...(message.attachments ?? []).map((file) => file.key),
  ].filter(Boolean);
}
