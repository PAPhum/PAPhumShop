import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NO_STORE_HEADERS } from '@/lib/auth/guard';

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // ignore signOut errors and always return ok
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}