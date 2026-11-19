import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AdminRole } from '@/types/database';

export const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, max-age=0',
};

export function jsonNoStore(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> }
) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) },
  });
}

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface AdminContext {
  supabase: ServerSupabase;
  user: User;
  role: AdminRole;
}

export type AdminGuardResult =
  | { ok: true; ctx: AdminContext }
  | { ok: false; response: NextResponse };

export async function requireAdmin(options?: {
  ownerOnly?: boolean;
}): Promise<AdminGuardResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: jsonNoStore({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: roleRow, error: roleError } = await supabase
    .from('admin_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (roleError) {
    return {
      ok: false,
      response: jsonNoStore(
        { error: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' },
        { status: 500 }
      ),
    };
  }

  if (!roleRow) {
    return {
      ok: false,
      response: jsonNoStore(
        { error: 'ไม่มีสิทธิ์เข้าถึงหลังบ้าน' },
        { status: 403 }
      ),
    };
  }

  const role: AdminRole = roleRow.role === 'owner' ? 'owner' : 'staff';

  if (options?.ownerOnly && role !== 'owner') {
    return {
      ok: false,
      response: jsonNoStore(
        { error: 'เฉพาะ Owner เท่านั้น' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, ctx: { supabase, user, role } };
}