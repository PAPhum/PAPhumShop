import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { jsonNoStore, requireAdmin } from '@/lib/auth/guard';
import { dbErrorResponse } from '@/lib/api-error';

const NUMERIC_FIELDS = [
  'weekly_interest_rate',
  'monthly_interest_rate',
] as const;

type NumericField = (typeof NUMERIC_FIELDS)[number];

export async function GET() {
  const auth = await requireAdmin({ ownerOnly: true });
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('installment_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    return dbErrorResponse('settings.get', error, 500);
  }

  return jsonNoStore({ settings: data ?? null });
}

export async function PATCH(req: NextRequest) {
  return updateSettings(req);
}

export async function POST(req: NextRequest) {
  return updateSettings(req);
}

async function updateSettings(req: NextRequest) {
  const auth = await requireAdmin({ ownerOnly: true });
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return jsonNoStore({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const patch: Partial<Record<NumericField, number>> = {};

  for (const field of NUMERIC_FIELDS) {
    const value = (body as Record<string, unknown>)[field];
    if (value === undefined) continue;

    const num = Number(value);
    if (!Number.isInteger(num) || num < 0 || num > 1_000_000) {
      return jsonNoStore({ error: 'ค่าที่กรอกไม่ถูกต้อง' }, { status: 400 });
    }

    patch[field] = num;
  }

  if (Object.keys(patch).length === 0) {
    return jsonNoStore({ error: 'ไม่มีข้อมูลให้บันทึก' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('installment_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('*')
    .maybeSingle();

  if (!data && !error) {
    return jsonNoStore({ error: 'ยังไม่มีแถวตั้งค่า' }, { status: 404 });
  }

  if (error) {
    return dbErrorResponse('settings.update', error, 500);
  }

  revalidateTag('settings', { expire: 0 });
  return jsonNoStore({ ok: true, settings: data ?? null });
}