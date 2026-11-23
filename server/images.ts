import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = process.env.IMAGES_BUCKET ?? "stitch-images-437329951890";
const region = process.env.IMAGES_BUCKET_REGION ?? "us-east-1";

const extensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const client = new S3Client({ region });

/**
 * Returns a short-lived URL the browser can PUT the file to, and the site path
 * CloudFront uses to serve it. The path is what gets stored on the product.
 */
export async function createImageUpload(contentType: string): Promise<{ uploadUrl: string; url: string }> {
  if (!Object.hasOwn(extensions, contentType)) {
    throw new Error("Only JPEG, PNG, WebP, and GIF images can be uploaded");
  }
  const extension = extensions[contentType];

  const key = `images/${randomUUID()}${extension}`;
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 300 },
  );

  return { uploadUrl, url: `/${key}` };
}
