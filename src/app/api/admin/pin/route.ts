import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hashAdminPin, verifyAdminPin } from '@/lib/crypto';

const PIN_COOKIE_NAME = 'paphum_admin_pin_ok';
const PIN_SESSION_SECONDS = 30 * 24 * 60 * 60; // 30 วัน (1 เดือน)

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: pinRow } = await supabase
    .from('admin_security')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const cookieStore = await cookies();
  const isUnlocked = cookieStore.get(PIN_COOKIE_NAME)?.value === user.id;

  return NextResponse.json({
    hasPin: Boolean(pinRow),
    isUnlocked,
  });
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const action = String(body?.action ?? 'verify');
    const pin = String(body?.pin ?? '');

    if (action === 'lock') {
      const res = NextResponse.json({ isUnlocked: false });
      res.cookies.delete(PIN_COOKIE_NAME);
      return res;
    }

    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        { error: 'กรุณากรอกรหัส PIN ตัวเลข 6 หลัก' },
        { status: 400 }
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
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      const res = NextResponse.json({ hasPin: true, isUnlocked: true });
      res.cookies.set(PIN_COOKIE_NAME, user.id, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: PIN_SESSION_SECONDS,
        path: '/',
      });
      return res;
    }

    const isValid = verifyAdminPin(pin, existingPin.pin_hash, existingPin.pin_salt);
    if (!isValid) {
      return NextResponse.json({ error: 'รหัส PIN ไม่ถูกต้อง' }, { status: 403 });
    }

    if (action === 'change') {
      const newPin = String(body?.newPin ?? '');
      if (!/^\d{6}$/.test(newPin)) {
        return NextResponse.json(
          { error: 'รหัส PIN ใหม่ต้องเป็นตัวเลข 6 หลัก' },
          { status: 400 }
        );
      }
      const { hash, salt } = hashAdminPin(newPin);
      await supabase
        .from('admin_security')
        .update({ pin_hash: hash, pin_salt: salt, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }

    const res = NextResponse.json({ hasPin: true, isUnlocked: true });
    res.cookies.set(PIN_COOKIE_NAME, user.id, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: PIN_SESSION_SECONDS,
      path: '/',
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' },
      { status: 500 }
    );
  }
}