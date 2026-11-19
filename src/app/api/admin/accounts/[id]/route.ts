import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { AccountStatus } from '@/types/database';
import { jsonNoStore, requireAdmin } from '@/lib/auth/guard';
import { dbErrorResponse, serverErrorResponse } from '@/lib/api-error';
import { deleteR2Object } from '@/lib/r2';

const VALID_STATUSES: AccountStatus[] = ['Available', 'Installment', 'SoldOut'];

function extractR2KeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const baseUrl = (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
  if (baseUrl && trimmed.startsWith(`${baseUrl}/`)) {
    return trimmed.slice(baseUrl.length + 1) || null;
  }

  try {
    const parsed = new URL(trimmed);
    const key = parsed.pathname.replace(/^\/+/, '');
    return key || null;
  } catch {
    return null;
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const auth = await requireAdmin({ ownerOnly: true });
    if (!auth.ok) return auth.response;

    const { supabase } = auth.ctx;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return jsonNoStore({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (body.quickStatusOnly === true) {
      if (!VALID_STATUSES.includes(body.status)) {
        return jsonNoStore({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 });
      }

      const { error } = await supabase
        .from('accounts')
        .update({ status: body.status, updated_at: now })
        .eq('id', id);

      if (error) {
        return dbErrorResponse('accounts.id.quick_status', error, 400);
      }

      revalidateTag('accounts', { expire: 0 });
      return jsonNoStore({ ok: true });
    }

    const code = String(body.code ?? '').trim();
    if (!code) {
      return jsonNoStore({ error: 'กรุณาระบุรหัสไอดี' }, { status: 400 });
    }

    const nextMainUrl = body.main_image_url ? String(body.main_image_url).trim() : '';
    if (!nextMainUrl) {
      return jsonNoStore({ error: 'กรุณาอัปโหลดรูปป้ายหลักก่อนบันทึก' }, { status: 400 });
    }

    const { data: beforeRow } = await supabase
      .from('accounts')
      .select('main_image_url, gallery_urls')
      .eq('id', id)
      .maybeSingle();

    const status: AccountStatus = VALID_STATUSES.includes(body.status)
      ? body.status
      : 'Available';

    const priceNum = Math.max(0, Number(body.price) || 0);
    const nextGalleryUrls: string[] = Array.isArray(body.gallery_urls)
      ? body.gallery_urls.map((u: unknown) => String(u))
      : [];

    const updateData = {
      code,
      status,
      price: priceNum,
      min_down_weekly: Math.max(0, Math.trunc(Number(body.min_down_weekly) || 0)),
      min_down_monthly: Math.max(0, Math.trunc(Number(body.min_down_monthly) || 0)),
      interest_free_weeks: Math.max(0, Math.trunc(Number(body.interest_free_weeks) || 0)),
      interest_free_months: Math.max(0, Math.trunc(Number(body.interest_free_months) || 0)),
      tags: Array.isArray(body.tags) ? body.tags : [],
      description: body.description ? String(body.description) : null,
      main_image_url: nextMainUrl,
      gallery_urls: nextGalleryUrls,
      updated_at: now,
    };

    const { error: updateError } = await supabase
      .from('accounts')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      return dbErrorResponse('accounts.id.update', updateError, 400);
    }

    if (beforeRow) {
      const keepUrls = new Set<string>([nextMainUrl, ...nextGalleryUrls]);
      const oldUrls = [
        ...(beforeRow.main_image_url ? [String(beforeRow.main_image_url)] : []),
        ...(Array.isArray(beforeRow.gallery_urls)
          ? beforeRow.gallery_urls.map((u) => String(u))
          : []),
      ];
      const orphanKeys = new Set<string>();
      for (const oldUrl of oldUrls) {
        if (!keepUrls.has(oldUrl)) {
          const key = extractR2KeyFromUrl(oldUrl);
          if (key) orphanKeys.add(key);
        }
      }
      if (orphanKeys.size > 0) {
        await Promise.allSettled([...orphanKeys].map((k) => deleteR2Object(k)));
      }
    }

    revalidateTag('accounts', { expire: 0 });
    return jsonNoStore({ ok: true });
  } catch (err) {
    return serverErrorResponse('accounts.id.patch', err);
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const auth = await requireAdmin({ ownerOnly: true });
    if (!auth.ok) return auth.response;

    const { supabase } = auth.ctx;

    const { data: existing } = await supabase
      .from('accounts')
      .select('main_image_url, gallery_urls')
      .eq('id', id)
      .maybeSingle();

    const { error: deleteError } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return dbErrorResponse('accounts.id.delete', deleteError, 400);
    }

    if (existing) {
      const keys = new Set<string>();
      const mainKey = extractR2KeyFromUrl(existing.main_image_url);
      if (mainKey) keys.add(mainKey);

      if (Array.isArray(existing.gallery_urls)) {
        for (const url of existing.gallery_urls) {
          const k = extractR2KeyFromUrl(String(url));
          if (k) keys.add(k);
        }
      }

      if (keys.size > 0) {
        await Promise.allSettled([...keys].map((k) => deleteR2Object(k)));
      }
    }

    revalidateTag('accounts', { expire: 0 });
    return jsonNoStore({ ok: true });
  } catch (err) {
    return serverErrorResponse('accounts.id.delete', err);
  }
}