import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { randomBytes } from 'node:crypto';
import { deleteR2Object } from '@/lib/r2';
import { jsonNoStore, requireAdmin } from '@/lib/auth/guard';
import { dbErrorResponse } from '@/lib/api-error';

const MAX_PINNED_PER_CATEGORY = 10;

function keyFromPublicUrl(url: string | null | undefined): string | null {
  const base = (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
  if (!url || !base) return null;
  if (!url.startsWith(`${base}/`)) return null;

  const key = url.slice(base.length + 1);
  return key || null;
}

function toUniqueStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => String(item).trim()).filter(Boolean))
  );
}

function normalizePinOrders(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const num = Number(v);
    if (k && Number.isFinite(num)) {
      out[k] = num;
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { searchParams } = new URL(req.url);

  if (searchParams.get('meta') === 'next_code') {
    const { count, error } = await supabase
      .from('banners')
      .select('id', { count: 'exact', head: true });

    if (error) {
      return dbErrorResponse('banners.next_code', error, 500);
    }

    const total = count ?? 0;
    return jsonNoStore({ total, nextCode: String(total + 1) });
  }

  const categoryId = searchParams.get('categoryId');

  if (!categoryId) {
    return jsonNoStore({ error: 'Missing categoryId' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('banners')
    .select('*')
    .contains('category_ids', [categoryId])
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    return dbErrorResponse('banners.list', error, 500);
  }

  const normalized = (data ?? []).map((row) => {
    const pinnedCatIds = toUniqueStringArray(row.pinned_category_ids);
    const pinOrders = normalizePinOrders(row.pin_orders);
    const isPinnedInThisCat = pinnedCatIds.includes(categoryId);
    const orderInThisCat = pinOrders[categoryId] ?? 9999;

    return {
      ...row,
      pinned_category_ids: pinnedCatIds,
      pin_orders: pinOrders,
      is_pinned: isPinnedInThisCat,
      pin_order: isPinnedInThisCat ? orderInThisCat : 0,
    };
  });

  normalized.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    if (a.is_pinned && b.is_pinned) {
      const diff = a.pin_order - b.pin_order;
      if (diff !== 0) return diff;
    }
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
  });

  return jsonNoStore({ banners: normalized });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const body = await req.json();

  if (body.action === 'create_category') {
    const name = String(body.name ?? '').trim();
    if (!name) {
      return jsonNoStore({ error: 'กรุณาระบุชื่อหมวดหมู่' }, { status: 400 });
    }

    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9ก-๙@_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || `cat-${Date.now()}`;

    const { data: maxRow } = await supabase
      .from('banner_categories')
      .select('sort_order')
      .eq('hide_preview', false)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: category, error } = await supabase
      .from('banner_categories')
      .insert({
        name,
        slug,
        description: body.description ? String(body.description).trim() : null,
        logo_url: body.logo_url ? String(body.logo_url).trim() : null,
        sort_order: (maxRow?.sort_order ?? 0) + 1,
        hide_preview: Boolean(body.hide_preview),
      })
      .select('*')
      .single();

    if (error) {
      return dbErrorResponse('banners.create_category', error, 400);
    }

    revalidateTag('categories', { expire: 0 });
    revalidateTag('banners', { expire: 0 });
    return jsonNoStore({ category });
  }

  const watermarkedUrl = String(
    body.watermarkedUrl ?? body.watermarked_url ?? ''
  ).trim();
  if (!watermarkedUrl) {
    return jsonNoStore({ error: 'ไม่พบ URL รูปภาพ' }, { status: 400 });
  }

  const uniqueCategoryIds: string[] = Array.isArray(body.categoryIds)
    ? toUniqueStringArray(body.categoryIds)
    : body.categoryId || body.category_id
      ? [String(body.categoryId ?? body.category_id).trim()].filter(Boolean)
      : [];

  const { data: banner, error: bannerError } = await supabase
    .from('banners')
    .insert({
      category_id: uniqueCategoryIds[0] ?? null,
      category_ids: uniqueCategoryIds,
      code: body.code ? String(body.code).trim() : null,
      watermarked_url: watermarkedUrl,
      is_public: (body.isPublic ?? body.is_public) !== false,
      is_pinned: false,
      pin_order: 0,
      pinned_category_ids: [],
      pin_orders: {},
    })
    .select('*')
    .single();

  if (bannerError) {
    return dbErrorResponse('banners.insert', bannerError, 400);
  }

  let deliveryToken: string | null = null;
  const origKey = body.originalR2Key ?? body.original_r2_key;
  const origName = body.originalFilename ?? body.original_filename;

  if (origKey && origName) {
    const nowIso = new Date().toISOString();
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    await supabase.from('deliveries').delete().lt('expires_at', nowIso);

    const { error: deliveryError } = await supabase.from('deliveries').insert({
      token,
      banner_id: banner.id,
      original_r2_key: String(origKey),
      original_filename: String(origName),
      expires_at: expiresAt,
    });

    if (!deliveryError) {
      deliveryToken = token;
    }
  }

  revalidateTag('banners', { expire: 0 });
  return jsonNoStore({ banner, deliveryToken });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const body = await req.json();

  if (body.action === 'reorder_pinned' && Array.isArray(body.orderedBannerIds)) {
    const ids = body.orderedBannerIds.map((id: unknown) => String(id));
    const categoryId = body.categoryId ? String(body.categoryId).trim() : '';

    if (!categoryId) {
      return jsonNoStore({ error: 'Missing categoryId' }, { status: 400 });
    }

    const { data: rows } = await supabase
      .from('banners')
      .select('id, pinned_category_ids, pin_orders')
      .in('id', ids);

    const byId = new Map((rows ?? []).map((r) => [r.id, r]));

    await Promise.all(
      ids.map((id: string, idx: number) => {
        const existing = byId.get(id);
        const nextPinnedCats = Array.from(
          new Set([...toUniqueStringArray(existing?.pinned_category_ids), categoryId])
        );
        const nextPinOrders = {
          ...normalizePinOrders(existing?.pin_orders),
          [categoryId]: idx + 1,
        };

        return supabase
          .from('banners')
          .update({
            pinned_category_ids: nextPinnedCats,
            pin_orders: nextPinOrders,
            is_pinned: nextPinnedCats.length > 0,
            pin_order: idx + 1,
          })
          .eq('id', id);
      })
    );

    revalidateTag('banners', { expire: 0 });
    return jsonNoStore({ ok: true });
  }

  if (body.action === 'bulk_update_categories') {
    const bannerIds = toUniqueStringArray(body.bannerIds);
    const targetCategoryIds = toUniqueStringArray(body.categoryIds);
    const mode = String(body.mode ?? 'add') as 'add' | 'replace' | 'remove';

    if (bannerIds.length === 0) {
      return jsonNoStore({ error: 'กรุณาเลือกรูปอย่างน้อย 1 รูป' }, { status: 400 });
    }
    if ((mode === 'add' || mode === 'replace') && targetCategoryIds.length === 0) {
      return jsonNoStore(
        { error: 'กรุณาเลือกหมวดหมู่อย่างน้อย 1 หมวด' },
        { status: 400 }
      );
    }

    const { data: existingRows, error: fetchErr } = await supabase
      .from('banners')
      .select('id, category_id, category_ids, pinned_category_ids, pin_orders')
      .in('id', bannerIds);

    if (fetchErr || !existingRows) {
      return dbErrorResponse(
        'banners.bulk_update_categories',
        fetchErr ?? new Error('ไม่พบข้อมูลรูปภาพ'),
        400
      );
    }

    await Promise.all(
      existingRows.map((row) => {
        const currentIds: string[] =
          Array.isArray(row.category_ids) && row.category_ids.length > 0
            ? row.category_ids.map((id) => String(id))
            : row.category_id
              ? [String(row.category_id)]
              : [];

        let nextIds: string[];
        if (mode === 'replace') {
          nextIds = targetCategoryIds;
        } else if (mode === 'remove') {
          const removeSet = new Set<string>(targetCategoryIds);
          nextIds = currentIds.filter((id) => !removeSet.has(id));
        } else {
          nextIds = Array.from(new Set<string>([...currentIds, ...targetCategoryIds]));
        }

        const nextIdSet = new Set(nextIds);
        const nextPinnedCats = toUniqueStringArray(row.pinned_category_ids).filter(
          (catId) => nextIdSet.has(catId)
        );
        const currentOrders = normalizePinOrders(row.pin_orders);
        const nextPinOrders: Record<string, number> = {};
        for (const catId of nextPinnedCats) {
          if (currentOrders[catId] !== undefined) {
            nextPinOrders[catId] = currentOrders[catId];
          }
        }

        return supabase
          .from('banners')
          .update({
            category_id: nextIds[0] ?? null,
            category_ids: nextIds,
            pinned_category_ids: nextPinnedCats,
            pin_orders: nextPinOrders,
            is_pinned: nextPinnedCats.length > 0,
          })
          .eq('id', row.id);
      })
    );

    revalidateTag('banners', { expire: 0 });
    return jsonNoStore({ ok: true, updatedCount: existingRows.length });
  }

  if (body.action === 'update_categories') {
    const bannerId = String(body.bannerId ?? '').trim();
    const categoryIds = toUniqueStringArray(body.categoryIds);

    if (!bannerId) {
      return jsonNoStore({ error: 'Missing bannerId' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('banners')
      .select('pinned_category_ids, pin_orders')
      .eq('id', bannerId)
      .maybeSingle();

    const nextIdSet = new Set(categoryIds);
    const nextPinnedCats = toUniqueStringArray(
      existing?.pinned_category_ids
    ).filter((catId) => nextIdSet.has(catId));
    const currentOrders = normalizePinOrders(existing?.pin_orders);
    const nextPinOrders: Record<string, number> = {};
    for (const catId of nextPinnedCats) {
      if (currentOrders[catId] !== undefined) {
        nextPinOrders[catId] = currentOrders[catId];
      }
    }

    const { error } = await supabase
      .from('banners')
      .update({
        category_id: categoryIds[0] ?? null,
        category_ids: categoryIds,
        pinned_category_ids: nextPinnedCats,
        pin_orders: nextPinOrders,
        is_pinned: nextPinnedCats.length > 0,
      })
      .eq('id', bannerId);

    if (error) {
      return dbErrorResponse('banners.update_categories', error, 400);
    }

    revalidateTag('banners', { expire: 0 });
    return jsonNoStore({ ok: true, category_ids: categoryIds });
  }

  const bannerId = String(body.bannerId ?? '').trim();
  const isPinned = Boolean(body.isPinned);
  const contextCategoryId = body.categoryId ? String(body.categoryId).trim() : null;

  if (!bannerId) {
    return jsonNoStore({ error: 'Missing bannerId' }, { status: 400 });
  }

  const { data: targetBanner } = await supabase
    .from('banners')
    .select('id, category_id, category_ids, pinned_category_ids, pin_orders')
    .eq('id', bannerId)
    .single();

  if (!targetBanner) {
    return jsonNoStore({ error: 'ไม่พบรูปภาพ' }, { status: 404 });
  }

  const targetCatId = contextCategoryId || targetBanner.category_id;
  if (!targetCatId) {
    return jsonNoStore({ error: 'ไม่พบหมวดหมู่เป้าหมาย' }, { status: 400 });
  }

  const currentPinnedCats = toUniqueStringArray(
    targetBanner.pinned_category_ids
  );
  const currentPinOrders = normalizePinOrders(targetBanner.pin_orders);

  if (isPinned) {
    const { count } = await supabase
      .from('banners')
      .select('id', { count: 'exact', head: true })
      .contains('category_ids', [targetCatId])
      .contains('pinned_category_ids', [targetCatId]);

    const alreadyPinnedHere = currentPinnedCats.includes(targetCatId);
    if (!alreadyPinnedHere && (count ?? 0) >= MAX_PINNED_PER_CATEGORY) {
      return jsonNoStore(
        {
          error: `ปักหมุดได้สูงสุด ${MAX_PINNED_PER_CATEGORY} รูปต่อหมวดหมู่ กรุณายกเลิกหมุดรูปอื่นก่อน`,
        },
        { status: 400 }
      );
    }

    const nextPinnedCats = Array.from(new Set([...currentPinnedCats, targetCatId]));
    const nextOrder = alreadyPinnedHere
      ? currentPinOrders[targetCatId] ?? (count ?? 0)
      : (count ?? 0) + 1;
    const nextPinOrders = {
      ...currentPinOrders,
      [targetCatId]: nextOrder,
    };

    const { error } = await supabase
      .from('banners')
      .update({
        pinned_category_ids: nextPinnedCats,
        pin_orders: nextPinOrders,
        is_pinned: nextPinnedCats.length > 0,
        pin_order: nextOrder,
      })
      .eq('id', bannerId);

    if (error) {
      return dbErrorResponse('banners.pin', error, 400);
    }
  } else {
    const nextPinnedCats = currentPinnedCats.filter((id) => id !== targetCatId);
    const nextPinOrders = { ...currentPinOrders };
    delete nextPinOrders[targetCatId];

    const { error } = await supabase
      .from('banners')
      .update({
        pinned_category_ids: nextPinnedCats,
        pin_orders: nextPinOrders,
        is_pinned: nextPinnedCats.length > 0,
        pin_order: 0,
      })
      .eq('id', bannerId);

    if (error) {
      return dbErrorResponse('banners.unpin', error, 400);
    }
  }

  revalidateTag('banners', { expire: 0 });
  return jsonNoStore({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin({ ownerOnly: true });
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return jsonNoStore({ error: 'Missing id' }, { status: 400 });
  }

  const [{ data: banner }, { data: deliveryRows }] = await Promise.all([
    supabase
      .from('banners')
      .select('watermarked_url')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('deliveries')
      .select('original_r2_key')
      .eq('banner_id', id),
  ]);

  const { error } = await supabase.from('banners').delete().eq('id', id);
  if (error) {
    return dbErrorResponse('banners.delete', error, 400);
  }

  const keys = new Set<string>();
  const watermarkedKey = keyFromPublicUrl(banner?.watermarked_url);
  if (watermarkedKey) keys.add(watermarkedKey);

  for (const row of deliveryRows ?? []) {
    const key = String(row.original_r2_key ?? '').trim();
    if (key) keys.add(key);
  }

  if (keys.size > 0) {
    await Promise.allSettled([...keys].map((key) => deleteR2Object(key)));
  }

  revalidateTag('banners', { expire: 0 });
  return jsonNoStore({ ok: true });
}