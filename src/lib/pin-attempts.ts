import type { SupabaseClient } from '@supabase/supabase-js';

export interface PinAttemptResult {
  ok: boolean;
  retryAfter: number;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function retryAfterSeconds(
  oldestISO: string,
  windowMs: number,
  now: number = Date.now()
): number {
  const oldestMs = Date.parse(oldestISO);
  if (!Number.isFinite(oldestMs)) return 0;

  const expiresMs = oldestMs + windowMs;
  const remainingMs = expiresMs - now;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

export async function checkPinAttempts(
  admin: SupabaseClient,
  key: string,
  limit: number,
  windowMs: number
): Promise<PinAttemptResult> {
  const now = Date.now();
  const cleanupBeforeISO = new Date(now - ONE_DAY_MS).toISOString();
  const windowStartISO = new Date(now - windowMs).toISOString();

  const { error: cleanupError } = await admin
    .from('pin_attempts')
    .delete()
    .lt('created_at', cleanupBeforeISO);

  if (cleanupError) {
    throw cleanupError;
  }

  const { count, error: countError } = await admin
    .from('pin_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('attempt_key', key)
    .gte('created_at', windowStartISO);

  if (countError) {
    throw countError;
  }

  if ((count ?? 0) >= limit) {
    const { data: oldestRow, error: oldestError } = await admin
      .from('pin_attempts')
      .select('created_at')
      .eq('attempt_key', key)
      .gte('created_at', windowStartISO)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (oldestError) {
      throw oldestError;
    }

    const retryAfter = oldestRow?.created_at
      ? retryAfterSeconds(String(oldestRow.created_at), windowMs, now)
      : Math.ceil(windowMs / 1000);

    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }

  const { error: insertError } = await admin
    .from('pin_attempts')
    .insert({ attempt_key: key });

  if (insertError) {
    throw insertError;
  }

  return { ok: true, retryAfter: 0 };
}

export async function clearPinAttempts(
  admin: SupabaseClient,
  key: string
): Promise<void> {
  const { error } = await admin
    .from('pin_attempts')
    .delete()
    .eq('attempt_key', key);

  if (error) {
    throw error;
  }
}