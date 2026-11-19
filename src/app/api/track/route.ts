import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { parseUserAgent } from '@/lib/user-agent';

const SESSION_COOKIE_NAME = 'paphum_vsid';
const SESSION_TTL_SECONDS = 30 * 60; // 30 นาทีต่อ 1 Session

function extractClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}

function extractGeoLocation(req: NextRequest): string | null {
  const rawCity = req.headers.get('x-vercel-ip-city');
  const country = req.headers.get('x-vercel-ip-country')?.trim();
  let city = '';
  if (rawCity) {
    try {
      city = decodeURIComponent(rawCity).trim();
    } catch {
      city = rawCity.trim();
    }
  }
  if (city && country) return `${city}, ${country}`;
  if (country) return country;
  return null;
}

function normalizeReferrer(rawRef: unknown): string | null {
  if (typeof rawRef !== 'string' || !rawRef.trim()) return null;
  try {
    const url = new URL(rawRef.trim());
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (!host || host.includes('paphumshop') || host === 'localhost') {
      return null;
    }
    if (host.includes('facebook.com') || host.includes('fb.com')) return 'Facebook';
    if (host.includes('google.')) return 'Google';
    if (host.includes('tiktok.com')) return 'TikTok';
    if (host.includes('line.me')) return 'LINE';
    if (host.includes('instagram.com')) return 'Instagram';
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
    return host.slice(0, 80);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // ถ้ามี Session Cookie อยู่แล้ว (เข้าชมภายใน 30 นาที) ไม่บันทึกซ้ำ
    if (req.cookies.get(SESSION_COOKIE_NAME)?.value === '1') {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const ua = req.headers.get('user-agent');
    const parsed = parseUserAgent(ua);
    if (parsed.isBot) {
      return NextResponse.json({ ok: true, bot: true });
    }

    const body = await req.json().catch(() => ({}));
    const rawPath = typeof body?.path === 'string' ? body.path.trim() : '/';
    const path = rawPath.startsWith('/') ? rawPath.slice(0, 120) : '/';

    // ไม่บันทึกหน้าหลังบ้านหรือ API
    if (path.startsWith('/admin') || path.startsWith('/api')) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const ipAddress = extractClientIp(req);
    const location = extractGeoLocation(req);
    const referrer = normalizeReferrer(body?.referrer);

    const supabase = createSupabaseAdminClient();

    // ลบ Log เก่าที่เกิน 30 วันแบบสุ่ม 10% เพื่อไม่ให้ทำงานทุก Request
    if (Math.random() < 0.1) {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('visitor_logs').delete().lt('visited_at', cutoff);
    }

    await supabase.from('visitor_logs').insert({
      ip_address: ipAddress,
      location,
      device_type: parsed.deviceType,
      device_model: parsed.deviceModel,
      os_name: parsed.osName,
      browser_name: parsed.browserName,
      path,
      referrer,
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS,
      path: '/',
    });
    return res;
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}