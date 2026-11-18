import { unstable_cache } from 'next/cache';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type {
  AccountPublic,
  BannerCategory,
  BannerCategorySection,
  BannerItem,
  InstallmentSettings,
} from '@/types/database';

const PUBLIC_ACCOUNT_COLUMNS =
  'id, code, status, price, min_down_weekly, min_down_monthly, interest_free_weeks, interest_free_months, tags, description, main_image_url, gallery_urls, created_at, updated_at';

const PUBLIC_BANNER_COLUMNS =
  'id, category_id, category_ids, code, watermarked_url, is_public, is_pinned, pin_order, pinned_category_ids, pin_orders, created_at';

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function isPinnedInCategory(banner: BannerItem, categoryId: string): boolean {
  if (Array.isArray(banner.pinned_category_ids)) {
    return banner.pinned_category_ids.includes(categoryId);
  }
  return Boolean(banner.is_pinned);
}

function getPinOrderInCategory(banner: BannerItem, categoryId: string): number {
  const mapOrder = banner.pin_orders?.[categoryId];
  if (typeof mapOrder === 'number' && Number.isFinite(mapOrder)) {
    return mapOrder;
  }
  return banner.pin_order ?? 9999;
}

function sortBannersForCategory(
  list: BannerItem[],
  categoryId: string
): BannerItem[] {
  return [...list].sort((a, b) => {
    const aPinned = isPinnedInCategory(a, categoryId);
    const bPinned = isPinnedInCategory(b, categoryId);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned && bPinned) {
      const diff =
        getPinOrderInCategory(a, categoryId) -
        getPinOrderInCategory(b, categoryId);
      if (diff !== 0) return diff;
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

export const getCachedStoreAccounts = unstable_cache(
  async (): Promise<AccountPublic[]> => {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('accounts_public')
      .select(PUBLIC_ACCOUNT_COLUMNS)
      .in('status', ['Available', 'Installment', 'SoldOut'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as AccountPublic[];
  },
  ['public-store-accounts-v1'],
  { revalidate: 60, tags: ['accounts'] }
);

export const getCachedInstallmentSettings = unstable_cache(
  async (): Promise<InstallmentSettings | null> => {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('installment_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;
    return (data as InstallmentSettings) ?? null;
  },
  ['public-installment-settings-v1'],
  { revalidate: 300, tags: ['settings'] }
);

export async function getCachedAccountByCode(
  code: string
): Promise<AccountPublic | null> {
  const normalized = code.trim();
  if (!normalized) return null;

  return unstable_cache(
    async (): Promise<AccountPublic | null> => {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from('accounts_public')
        .select(PUBLIC_ACCOUNT_COLUMNS)
        .ilike('code', escapeIlikePattern(normalized))
        .maybeSingle();

      if (error) throw error;
      return (data as AccountPublic) ?? null;
    },
    ['public-account-by-code-v1', normalized.toLowerCase()],
    { revalidate: 60, tags: ['accounts'] }
  )();
}

export const getCachedBannerPortfolio = unstable_cache(
  async (): Promise<{
    sections: BannerCategorySection[];
    totalWorksCount: number;
  }> => {
    const supabase = createSupabaseAdminClient();

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
        .select(PUBLIC_BANNER_COLUMNS)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .range(0, 999),
      supabase
        .from('banners')
        .select(PUBLIC_BANNER_COLUMNS)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .range(1000, 1999),
    ]);

    if (categoriesRes.error) throw categoriesRes.error;
    if (countRes.error) throw countRes.error;
    if (page1Res.error) throw page1Res.error;
    if (page2Res.error) throw page2Res.error;

    const categories = (categoriesRes.data ?? []) as BannerCategory[];
    const allBanners = [
      ...((page1Res.data ?? []) as BannerItem[]),
      ...((page2Res.data ?? []) as BannerItem[]),
    ];

    const exactTotal = countRes.count ?? allBanners.length;
    if (exactTotal > 2000) {
      const { data: extraData, error: extraError } = await supabase
        .from('banners')
        .select(PUBLIC_BANNER_COLUMNS)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .range(2000, exactTotal - 1);

      if (extraError) throw extraError;
      if (extraData) {
        allBanners.push(...(extraData as BannerItem[]));
      }
    }

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
      const rawCatBanners = bannersByCategory.get(cat.id) ?? [];
      const totalCount = rawCatBanners.length;

      if (cat.hide_preview) {
        return {
          ...cat,
          pinned_banners: [],
          total_count: totalCount,
        };
      }

      const sortedCatBanners = sortBannersForCategory(rawCatBanners, cat.id);
      const pinned = sortedCatBanners
        .filter((b) => isPinnedInCategory(b, cat.id))
        .slice(0, 10);
      const showcase =
        pinned.length > 0 ? pinned : sortedCatBanners.slice(0, 10);

      return {
        ...cat,
        pinned_banners: showcase,
        total_count: totalCount,
      };
    });

    return {
      sections: sections.filter((sec) => sec.total_count > 0),
      totalWorksCount: exactTotal,
    };
  },
  ['public-banner-portfolio-v2'],
  { revalidate: 120, tags: ['banners', 'categories'] }
);

export async function getCachedBannerCategoryPage(
  slug: string,
  page: number,
  pageSize: number
): Promise<{
  category: BannerCategory;
  banners: BannerItem[];
  totalCount: number;
} | null> {
  const normalizedSlug = slug.trim();
  const safePage = Math.max(1, Math.trunc(page) || 1);
  const safeSize = Math.max(1, Math.trunc(pageSize) || 24);

  return unstable_cache(
    async () => {
      const supabase = createSupabaseAdminClient();

      const { data: category, error: catError } = await supabase
        .from('banner_categories')
        .select('*')
        .eq('slug', normalizedSlug)
        .maybeSingle();

      if (catError) throw catError;
      if (!category) return null;

      const { data: bannersData, error: bannerError } = await supabase
        .from('banners')
        .select(PUBLIC_BANNER_COLUMNS)
        .contains('category_ids', [category.id])
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(2000);

      if (bannerError) throw bannerError;

      const sorted = sortBannersForCategory(
        (bannersData ?? []) as BannerItem[],
        category.id
      );
      const from = (safePage - 1) * safeSize;
      const to = from + safeSize;

      return {
        category: category as BannerCategory,
        banners: sorted.slice(from, to),
        totalCount: sorted.length,
      };
    },
    [
      'public-banner-category-page-v2',
      normalizedSlug,
      String(safePage),
      String(safeSize),
    ],
    { revalidate: 120, tags: ['banners', 'categories'] }
  )();
}