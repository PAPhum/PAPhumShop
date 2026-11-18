import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BannerCategory, BannerItem } from '@/types/database';
import BannerCategoryDetailClient from '@/components/BannerCategoryDetailClient';

const PAGE_SIZE = 24;

async function CategoryDetailLoader({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: Promise<{ slug: string }>;
  searchParamsPromise: Promise<{ page?: string }>;
}) {
  await connection();
  const { slug } = await paramsPromise;
  const { page: pageParam } = await searchParamsPromise;

  const decodedSlug = decodeURIComponent(slug);
  const currentPage = Math.max(1, Number(pageParam) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();

  const { data: category } = await supabase
    .from('banner_categories')
    .select('*')
    .eq('slug', decodedSlug)
    .maybeSingle();

  if (!category) {
    notFound();
  }

  const { data: bannersData, count } = await supabase
    .from('banners')
    .select('*', { count: 'exact' })
    .contains('category_ids', [category.id])
    .eq('is_public', true)
    .order('is_pinned', { ascending: false })
    .order('pin_order', { ascending: true })
    .order('created_at', { ascending: false })
    .range(from, to);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <BannerCategoryDetailClient
      category={category as BannerCategory}
      banners={(bannersData ?? []) as BannerItem[]}
      currentPage={currentPage}
      totalPages={totalPages}
      totalCount={totalCount}
    />
  );
}

export default function BannerCategoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={`detail-skel-${i}`}
              className="aspect-[3/4] animate-pulse rounded-2xl border border-white/[0.06] bg-[#12141C]"
            />
          ))}
        </div>
      }
    >
      <CategoryDetailLoader
        paramsPromise={params}
        searchParamsPromise={searchParams}
      />
    </Suspense>
  );
}