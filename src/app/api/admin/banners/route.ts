import { NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { jsonNoStore, requireAdmin } from '@/lib/auth/guard';

const MAX_PINNED_PER_CATEGORY = 10;

function toUniqueStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => String(item).trim()).filter(Boolean))
  );
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { searchParams } = new URL(req.url);

  // ดึงเลขรหัสงานถัดไป (จำนวนงานทั้งหมด + 1)
  if (searchParams.get('meta') === 'next_code') {
    const { count, error } = await supabase
      .from('banners')
      .select('id', { count: 'exact', head: true });

    if (error) {
      return jsonNoStore({ error: error.message }, { status: 500 });
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
    .order('is_pinned', { ascending: false })
    .order('pin_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    return jsonNoStore({ error: error.message }, { status: 500 });
  }

  return jsonNoStore({ banners: data ?? [] });
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
      return jsonNoStore({ error: error.message }, { status: 400 });
    }

    return jsonNoStore({ category });
  }

  const watermarkedUrl = String(body.watermarkedUrl ?? body.watermarked_url ?? '').trim();
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
    })
    .select('*')
    .single();

  if (bannerError) {
    return jsonNoStore({ error: bannerError.message }, { status: 400 });
  }

  let deliveryToken: string | null = null;
  const origKey = body.originalR2Key ?? body.original_r2_key;
  const origName = body.originalFilename ?? body.original_filename;

  if (origKey && origName) {
    const nowIso = new Date().toISOString();
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // กวาดลบประวัติลิงก์ส่งงานที่หมดอายุแล้วออกอัตโนมัติ
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

  return jsonNoStore({ banner, deliveryToken });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const body = await req.json();

  if (body.action === 'reorder_pinned' && Array.isArray(body.orderedBannerIds)) {
    const ids = body.orderedBannerIds.map((id: unknown) => String(id));
    await Promise.all(
      ids.map((id: string, idx: number) =>
        supabase
          .from('banners')
          .update({ pin_order: idx + 1 })
          .eq('id', id)
      )
    );
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
      return jsonNoStore({ error: 'กรุณาเลือกหมวดหมู่อย่างน้อย 1 หมวด' }, { status: 400 });
    }

    const { data: existingRows, error: fetchErr } = await supabase
      .from('banners')
      .select('id, category_id, category_ids')
      .in('id', bannerIds);

    if (fetchErr || !existingRows) {
      return jsonNoStore(
        { error: fetchErr?.message ?? 'ไม่พบข้อมูลรูปภาพ' },
        { status: 400 }
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

        return supabase
          .from('banners')
          .update({
            category_id: nextIds[0] ?? null,
            category_ids: nextIds,
          })
          .eq('id', row.id);
      })
    );

    return jsonNoStore({ ok: true, updatedCount: existingRows.length });
  }

  if (body.action === 'update_categories') {
    const bannerId = String(body.bannerId ?? '').trim();
    const categoryIds = toUniqueStringArray(body.categoryIds);

    if (!bannerId) {
      return jsonNoStore({ error: 'Missing bannerId' }, { status: 400 });
    }

    const { error } = await supabase
      .from('banners')
      .update({
        category_id: categoryIds[0] ?? null,
        category_ids: categoryIds,
      })
      .eq('id', bannerId);

    if (error) {
      return jsonNoStore({ error: error.message }, { status: 400 });
    }

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
    .select('id, category_id, category_ids')
    .eq('id', bannerId)
    .single();

  if (!targetBanner) {
    return jsonNoStore({ error: 'ไม่พบรูปภาพ' }, { status: 404 });
  }

  const checkCatId = contextCategoryId || targetBanner.category_id;

  if (isPinned && checkCatId) {
    const { count } = await supabase
      .from('banners')
      .select('id', { count: 'exact', head: true })
      .contains('category_ids', [checkCatId])
      .eq('is_pinned', true);

    if ((count ?? 0) >= MAX_PINNED_PER_CATEGORY) {
      return jsonNoStore(
        {
          error: `ปักหมุดได้สูงสุด ${MAX_PINNED_PER_CATEGORY} รูปต่อหมวดหมู่ กรุณายกเลิกหมุดรูปอื่นก่อน`,
        },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('banners')
      .update({
        is_pinned: true,
        pin_order: (count ?? 0) + 1,
      })
      .eq('id', bannerId);

    if (error) {
      return jsonNoStore({ error: error.message }, { status: 400 });
    }
  } else {
    const { error } = await supabase
      .from('banners')
      .update({
        is_pinned: false,
        pin_order: 0,
      })
      .eq('id', bannerId);

    if (error) {
      return jsonNoStore({ error: error.message }, { status: 400 });
    }
  }

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

  const { error } = await supabase.from('banners').delete().eq('id', id);
  if (error) {
    return jsonNoStore({ error: error.message }, { status: 400 });
  }

  return jsonNoStore({ ok: true });
}