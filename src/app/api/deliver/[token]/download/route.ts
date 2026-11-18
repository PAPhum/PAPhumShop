import { NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createPresignedAttachmentDownloadUrl } from '@/lib/r2';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

const TOKEN_LIMIT = 10;
const IP_LIMIT = 40;
const WINDOW_MS = 10 * 60 * 1000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!TOKEN_PATTERN.test(token)) {
    return new Response(
      JSON.stringify({ error: 'ลิงก์ดาวน์โหลดไม่ถูกต้อง' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }
    );
  }

  const ip = getClientIp(request);
  const tokenLimit = checkRateLimit(`deliver:token:${token}`, TOKEN_LIMIT, WINDOW_MS);
  const ipLimit = checkRateLimit(`deliver:ip:${ip}`, IP_LIMIT, WINDOW_MS);

  if (!tokenLimit.ok || !ipLimit.ok) {
    const retryAfter = Math.max(tokenLimit.retryAfter, ipLimit.retryAfter, 1);
    return new Response(
      JSON.stringify({ error: 'เรียกดาวน์โหลดบ่อยเกินไป กรุณารอสักครู่' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Retry-After': String(retryAfter),
        },
      }
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data: delivery, error } = await supabase
    .from('deliveries')
    .select('original_r2_key, original_filename, expires_at')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !delivery?.original_r2_key) {
    return new Response(
      JSON.stringify({
        error: 'ไม่พบไฟล์งาน หรือลิงก์ดาวน์โหลดหมดอายุแล้ว (เกิน 7 วัน)',
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }
    );
  }

  let downloadUrl: string;
  try {
    downloadUrl = await createPresignedAttachmentDownloadUrl({
      key: String(delivery.original_r2_key),
      downloadFilename: String(delivery.original_filename ?? 'file'),
    });
  } catch {
    return new Response(
      JSON.stringify({ error: 'สร้างลิงก์ดาวน์โหลดไม่สำเร็จ' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }
    );
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: downloadUrl,
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
