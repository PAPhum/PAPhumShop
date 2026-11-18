import crypto from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type R2FolderCategory = 'portfolio' | 'accounts' | 'temp-deliveries';

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/webp',
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl: string;
}

export function getR2ConfigFromEnv(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID ?? '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? '';
  const bucketName = process.env.R2_BUCKET_NAME ?? '';
  const publicBaseUrl = (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicBaseUrl) {
    throw new Error('Missing required Cloudflare R2 environment variables.');
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicBaseUrl,
  };
}

export function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function isAllowedImageMimeType(contentType: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.has(contentType.toLowerCase().trim());
}

/**
 * สร้าง Object Key แยกโฟลเดอร์ตามประเภทการใช้งาน
 */
export function buildR2ObjectKey(
  folder: R2FolderCategory,
  originalFilename: string,
  date: Date = new Date()
): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const randomId = crypto.randomBytes(8).toString('hex');

  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(originalFilename.trim());
  const safeExt = extMatch ? extMatch[1].toLowerCase() : 'webp';

  return `${folder}/${year}/${month}/${randomId}.${safeExt}`;
}

/**
 * สร้าง Presigned PUT URL ให้ฝั่งแอดมินอัปโหลดไฟล์จากเบราว์เซอร์ตรงเข้า R2 โดยไม่ผ่าน Server
 */
export async function createPresignedUploadUrl(
  params: {
    folder: R2FolderCategory;
    filename: string;
    contentType: string;
  },
  customConfig?: R2Config
): Promise<{
  key: string;
  uploadUrl: string;
  publicUrl: string;
}> {
  if (!isAllowedImageMimeType(params.contentType)) {
    throw new Error(`Unsupported file type: ${params.contentType}`);
  }

  const config = customConfig ?? getR2ConfigFromEnv();
  const client = createR2Client(config);
  const key = buildR2ObjectKey(params.folder, params.filename);

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    ContentType: params.contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 600 }); // อายุลิงก์อัปโหลด 10 นาที
  const publicUrl = `${config.publicBaseUrl}/${key}`;

  return {
    key,
    uploadUrl,
    publicUrl,
  };
}

/**
 * สร้างลิงก์ดาวน์โหลดตรงพร้อม Header บังคับเซฟลงเครื่อง (Content-Disposition: attachment)
 */
export async function createPresignedAttachmentDownloadUrl(
  params: {
    key: string;
    downloadFilename: string;
  },
  customConfig?: R2Config
): Promise<string> {
  const config = customConfig ?? getR2ConfigFromEnv();
  const client = createR2Client(config);

  const safeFilename = params.downloadFilename.replace(/["\\\r\n]/g, '_');
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: params.key,
    ResponseContentDisposition: `attachment; filename="${safeFilename}"`,
  });

  return getSignedUrl(client, command, { expiresIn: 3600 }); // อายุลิงก์โหลด 1 ชั่วโมง
}

/**
 * ลบไฟล์ออกจาก Cloudflare R2 (ใช้ตอนแอดมินลบไอดีหรือลบผลงาน)
 */
export async function deleteR2Object(
  key: string,
  customConfig?: R2Config
): Promise<void> {
  if (!key) return;
  const config = customConfig ?? getR2ConfigFromEnv();
  const client = createR2Client(config);

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    })
  );
}