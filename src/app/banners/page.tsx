import { Suspense } from 'react';
import { connection } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  BannerCategory,
  BannerCategorySection,
  BannerItem,
} from '@/types/database';
import BannerPortfolioClient from '@/components/BannerPortfolioClient';

async function BannersSectionsLoader() {
  await connection();
  const supabase = await createSupabaseServerClient();

  const [categoriesRes, countRes, page1Res, page2Res] = await Promise.all([
    supabase
      .from('banner_categories')
      .select('*')
      .order('hide_preview', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('banners')
      .select('id', { count: 'exact', head: true })
      .eq('is_public', true),
    supabase
      .from('banners')
      .select('id, category_id, category_ids, code, watermarked_url, is_public, is_pinned, pin_order, created_at')
      .eq('is_public', true)
      .order('is_pinned', { ascending: false })
      .order('pin_order', { ascending: true })
      .order('created_at', { ascending: false })
      .range(0, 999),
    supabase
      .from('banners')
      .select('id, category_id, category_ids, code, watermarked_url, is_public, is_pinned, pin_order, created_at')
      .eq('is_public', true)
      .order('is_pinned', { ascending: false })
      .order('pin_order', { ascending: true })
      .order('created_at', { ascending: false })
      .range(1000, 1999),
  ]);

  const categories = (categoriesRes.data ?? []) as BannerCategory[];
  const allBanners = [
    ...((page1Res.data ?? []) as BannerItem[]),
    ...((page2Res.data ?? []) as BannerItem[]),
  ];

  // หากมีมากกว่า 2,000 ชิ้น ดึงส่วนที่เหลือเพิ่มอัตโนมัติ
  const exactTotal = countRes.count ?? allBanners.length;
  if (exactTotal > 2000) {
    const { data: extraData } = await supabase
      .from('banners')
      .select('id, category_id, category_ids, code, watermarked_url, is_public, is_pinned, pin_order, created_at')
      .eq('is_public', true)
      .order('is_pinned', { ascending: false })
      .order('pin_order', { ascending: true })
      .order('created_at', { ascending: false })
      .range(2000, exactTotal - 1);

    if (extraData) {
      allBanners.push(...(extraData as BannerItem[]));
    }
  }

  const totalWorksCount = exactTotal;

  // จัดกลุ่มผลงานเข้าแต่ละหมวดหมู่ในครั้งเดียว
  const bannersByCategory = new Map<string, BannerItem[]>();
  for (const banner of allBanners) {
    const ids =
      Array.isArray(banner.category_ids) && banner.category_ids.length > 0
        ? banner.category_ids
        : banner.category_id
          ? [banner.category_id]
          : [];

    for (const catId of ids) {
      const list = bannersByCategory.get(catId);
      if (list) {
        list.push(banner);
      } else {
        bannersByCategory.set(catId, [banner]);
      }
    }
  }

  const sections: BannerCategorySection[] = categories.map((cat) => {
    const catBanners = bannersByCategory.get(cat.id) ?? [];
    const totalCount = catBanners.length;

    if (cat.hide_preview) {
      return {
        ...cat,
        pinned_banners: [],
        total_count: totalCount,
      };
    }

    const pinned = catBanners.filter((b) => b.is_pinned).slice(0, 10);
    const showcase = pinned.length > 0 ? pinned : catBanners.slice(0, 10);

    return {
      ...cat,
      pinned_banners: showcase,
      total_count: totalCount,
    };
  });

  const nonEmptySections = sections.filter((sec) => sec.total_count > 0);

  return (
    <BannerPortfolioClient
      sections={nonEmptySections}
      totalWorksCount={totalWorksCount}
    />
  );
}

export default function BannersPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`cat-skel-${i}`}
              className="h-64 animate-pulse rounded-2xl border border-white/[0.06] bg-[#12141C]"
            />
          ))}
        </div>
      }
    >
      <BannersSectionsLoader />
    </Suspense>
  );
}