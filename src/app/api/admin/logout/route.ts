import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PIN_COOKIE_NAME } from '@/lib/pin-token';
import { NO_STORE_HEADERS } from '@/lib/auth/guard';

export async function POST() {
  const supabase = await createSupabaseServerClient();

  await supabase.auth.signOut().catch(() => null);

  const res = NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  res.cookies.delete(PIN_COOKIE_NAME);
  return res;
}
