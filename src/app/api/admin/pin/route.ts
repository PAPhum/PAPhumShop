import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { hashAdminPin, verifyAdminPin } from '@/lib/crypto';
import {
  PIN_COOKIE_NAME,
  PIN_SESSION_SECONDS,
  pinVersionFromSalt,
  signPinToken,
} from '@/lib/pin-token';
import { isPinUnlocked, NO_STORE_HEADERS } from '@/lib/auth/guard';
import { getClientIp } from '@/lib/rate-limit';
import { checkPinAttempts, clearPinAttempts } from '@/lib/pin-attempts';
import { dbErrorResponse, serverErrorResponse } from '@/lib/api-error';

const PIN_MAX_ATTEMPTS = 5;
const PIN_WINDOW_MS = 15 * 60 * 1000;
const PIN_IP_MAX_ATTEMPTS = 20;

function pinCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: PIN_SESSION_SECONDS,
    path: '/',
  };
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const { data: pinRow } = await supabase
    .from('admin_security')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const unlocked = await isPinUnlocked(supabase, user.id);

  return NextResponse.json(
    { hasPin: Boolean(pinRow), isUnlocked: unlocked },
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action ?? 'verify');

    if (action === 'lock') {
      const res = NextResponse.json(
        { isUnlocked: false },
        { headers: NO_STORE_HEADERS }
      );
      res.cookies.delete(PIN_COOKIE_NAME);
      return res;
    }

    const pin = String(body?.pin ?? '');
    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        { error: 'กรุณากรอกรหัส PIN ตัวเลข 6 หลัก' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const admin = createSupabaseAdminClient();
    const ip = getClientIp(request);
    const userLimitKey = `pin:user:${user.id}:${ip}`;
    const ipLimitKey = `pin:ip:${ip}`;

    const userLimit = await checkPinAttempts(
      admin,
      userLimitKey,
      PIN_MAX_ATTEMPTS,
      PIN_WINDOW_MS
    );
    const ipLimit = await checkPinAttempts(
      admin,
      ipLimitKey,
      PIN_IP_MAX_ATTEMPTS,
      PIN_WINDOW_MS
    );

    if (!userLimit.ok || !ipLimit.ok) {
      const retryAfter = Math.max(userLimit.retryAfter, ipLimit.retryAfter);
      return NextResponse.json(
        {
          error: `ลองผิดหลายครั้งเกินไป กรุณารอ ${Math.ceil(retryAfter / 60)} นาที`,
        },
        {
          status: 429,
          headers: { ...NO_STORE_HEADERS, 'Retry-After': String(retryAfter) },
        }
      );
    }

    const { data: existingPin } = await supabase
      .from('admin_security')
      .select('pin_hash, pin_salt')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existingPin) {
      const { hash, salt } = hashAdminPin(pin);
      const { error: insertError } = await supabase
        .from('admin_security')
        .insert({
          user_id: user.id,
          pin_hash: hash,
          pin_salt: salt,
        });

      if (insertError) {
        return dbErrorResponse('pin.insert', insertError, 500);
      }

      await Promise.all([
        clearPinAttempts(admin, userLimitKey),
        clearPinAttempts(admin, ipLimitKey),
      ]);

      const res = NextResponse.json(
        { hasPin: true, isUnlocked: true },
        { headers: NO_STORE_HEADERS }
      );
      res.cookies.set(
        PIN_COOKIE_NAME,
        signPinToken(user.id, pinVersionFromSalt(salt)),
        pinCookieOptions()
      );
      return res;
    }

    const isValid = verifyAdminPin(pin, existingPin.pin_hash, existingPin.pin_salt);
    if (!isValid) {
      return NextResponse.json(
        { error: 'รหัส PIN ไม่ถูกต้อง' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    let pinSalt = String(existingPin.pin_salt);

    if (action === 'change') {
      const newPin = String(body?.newPin ?? '');
      if (!/^\d{6}$/.test(newPin)) {
        return NextResponse.json(
          { error: 'รหัส PIN ใหม่ต้องเป็นตัวเลข 6 หลัก' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const { hash, salt } = hashAdminPin(newPin);
      const { error: updateError } = await supabase
        .from('admin_security')
        .update({
          pin_hash: hash,
          pin_salt: salt,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (updateError) {
        return dbErrorResponse('pin.change', updateError, 500);
      }

      pinSalt = salt;
    }

    await Promise.all([
      clearPinAttempts(admin, userLimitKey),
      clearPinAttempts(admin, ipLimitKey),
    ]);

    const res = NextResponse.json(
      { hasPin: true, isUnlocked: true },
      { headers: NO_STORE_HEADERS }
    );
    res.cookies.set(
      PIN_COOKIE_NAME,
      signPinToken(user.id, pinVersionFromSalt(pinSalt)),
      pinCookieOptions()
    );
    return res;
  } catch (err) {
    return serverErrorResponse('pin.post', err);
  }
}

export async function DELETE() {
  const res = NextResponse.json(
    { isUnlocked: false },
    { headers: NO_STORE_HEADERS }
  );
  res.cookies.delete(PIN_COOKIE_NAME);
  return res;
}