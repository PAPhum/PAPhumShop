import { NextRequest } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  buildR2ObjectKey,
  createR2Client,
  getR2ConfigFromEnv,
  type R2FolderCategory,
} from '@/lib/r2';
import { jsonNoStore, requireAdmin } from '@/lib/auth/guard';

const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg']);
const ALLOWED_EXT = new Set(['webp', 'png', 'jpg', 'jpeg']);
const ALLOWED_FOLDERS = new Set<R2FolderCategory>([
  'portfolio',
  'accounts',
  'temp-deliveries',
]);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;

const EXT_MIME: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin({ pin: true });
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return jsonNoStore({ error: 'ข้อมูลอัปโหลดไม่ถูกต้อง' }, { status: 400 });
  }

  const folder = String((body as Record<string, unknown>).folder ?? '') as R2FolderCategory;
  if (!ALLOWED_FOLDERS.has(folder)) {
    return jsonNoStore({ error: 'โฟลเดอร์อัปโหลดไม่ถูกต้อง' }, { status: 400 });
  }

  const contentType = String(
    (body as Record<string, unknown>).contentType ?? ''
  )
    .toLowerCase()
    .trim();

  if (!ALLOWED_MIME.has(contentType)) {
    return jsonNoStore({ error: 'ชนิดไฟล์ไม่รองรับ' }, { status: 400 });
  }

  const rawFilename = String((body as Record<string, unknown>).filename ?? '').trim();
  const extMatch = rawFilename.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';

  if (!ALLOWED_EXT.has(ext) || EXT_MIME[ext] !== contentType) {
    return jsonNoStore({ error: 'นามสกุลไฟล์ไม่ตรงกับชนิดไฟล์' }, { status: 400 });
  }

  const size = Number((body as Record<string, unknown>).size);
  const maxBytes = folder === 'temp-deliveries' ? MAX_ORIGINAL_BYTES : MAX_IMAGE_BYTES;

  if (!Number.isInteger(size) || size <= 0) {
    return jsonNoStore({ error: 'ไม่พบขนาดไฟล์' }, { status: 400 });
  }

  if (size > maxBytes) {
    return jsonNoStore(
      { error: `ไฟล์ใหญ่เกินกำหนด (สูงสุด ${Math.round(maxBytes / 1024 / 1024)} MB)` },
      { status: 400 }
    );
  }

  let config;
  try {
    config = getR2ConfigFromEnv();
  } catch {
    return jsonNoStore(
      {
        error:
          'ยังไม่ได้ตั้งค่า R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME / R2_PUBLIC_URL',
      },
      { status: 500 }
    );
  }

  const key = buildR2ObjectKey(folder, rawFilename);
  const client = createR2Client(config);

  // ผูก Content-Type และ Content-Length เข้า signature เพื่อไม่ให้ผู้ถือ URL อัปโหลดไฟล์อื่นแทนได้
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: 300,
    signableHeaders: new Set(['content-type', 'content-length']),
  });

  return jsonNoStore({
    uploadUrl,
    publicUrl: `${config.publicBaseUrl}/${key}`,
    key,
  });
}
