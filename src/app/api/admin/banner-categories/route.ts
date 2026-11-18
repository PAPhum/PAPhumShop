import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function makeSlug(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙@_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `cat-${Date.now()}`;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: categories, error } = await supabase
    .from('banner_categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = await Promise.all(
    (categories ?? []).map(async (cat) => {
      const [totalRes, pinnedRes] = await Promise.all([
        supabase
          .from('banners')
          .select('id', { count: 'exact', head: true })
          .contains('category_ids', [cat.id]),
        supabase
          .from('banners')
          .select('id', { count: 'exact', head: true })
          .contains('category_ids', [cat.id])
          .eq('is_pinned', true),
      ]);

      return {
        ...cat,
        total_count: totalRes.count ?? 0,
        pinned_count: pinnedRes.count ?? 0,
      };
    })
  );

  return NextResponse.json({ categories: enriched });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const name = String(body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'กรุณาระบุชื่อหมวดหมู่' }, { status: 400 });
  }

  const { data: maxRow } = await supabase
    .from('banner_categories')
    .select('sort_order')
    .eq('hide_preview', false)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const { data: created, error } = await supabase
    .from('banner_categories')
    .insert({
      name,
      slug: makeSlug(name),
      description: body.description ? String(body.description).trim() : null,
      logo_url: body.logo_url ? String(body.logo_url).trim() : null,
      sort_order: nextOrder,
      hide_preview: Boolean(body.hide_preview),
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ category: created });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  if (body.action === 'reorder' && Array.isArray(body.orderedIds)) {
    const ids = body.orderedIds as string[];
    await Promise.all(
      ids.map((id, idx) =>
        supabase
          .from('banner_categories')
          .update({ sort_order: idx + 1 })
          .eq('id', id)
      )
    );
    return NextResponse.json({ ok: true });
  }

  const id = String(body.id ?? '').trim();
  const name = String(body.name ?? '').trim();
  if (!id || !name) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 });
  }

  const updatePayload: Record<string, unknown> = {
    name,
    description: body.description ? String(body.description).trim() : null,
    logo_url: body.logo_url ? String(body.logo_url).trim() : null,
  };

  if (typeof body.hide_preview === 'boolean') {
    updatePayload.hide_preview = body.hide_preview;
  }

  const { data: updated, error } = await supabase
    .from('banner_categories')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ category: updated });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const { error } = await supabase
    .from('banner_categories')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}