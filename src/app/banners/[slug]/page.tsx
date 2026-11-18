import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getCachedBannerCategoryPage } from '@/lib/public-data';
import BannerCategoryDetailClient from '@/components/BannerCategoryDetailClient';

const PAGE_SIZE = 24;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  let decodedSlug = '';
  try {
    decodedSlug = decodeURIComponent(slug).trim();
  } catch {
    return { title: 'ผลงานออกแบบ | PAPhum Studio' };
  }

  const result = await getCachedBannerCategoryPage(decodedSlug, 1, 1);
  if (!result) {
    return { title: 'ผลงานออกแบบ | PAPhum Studio' };
  }

  const title = `${result.category.name} (${result.totalCount} ผลงาน) | PAPhum Studio`;
  const description =
    result.category.description ||
    `รวมผลงานออกแบบและตัดป้ายหมวดหมู่ ${result.category.name}`;
  const previewImg =
    result.banners[0]?.watermarked_url || result.category.logo_url;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: previewImg ? [{ url: previewImg }] : [],
    },
  };
}

async function CategoryDetailLoader({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: Promise<{ slug: string }>;
  searchParamsPromise: Promise<{ page?: string }>;
}) {
  const { slug } = await paramsPromise;
  const { page: pageParam } = await searchParamsPromise;

  let decodedSlug = '';
  try {
    decodedSlug = decodeURIComponent(slug).trim();
  } catch {
    notFound();
  }

  if (!decodedSlug) {
    notFound();
  }

  const currentPage = Math.max(1, Number(pageParam) || 1);
  const result = await getCachedBannerCategoryPage(
    decodedSlug,
    currentPage,
    PAGE_SIZE
  );

  if (!result) {
    notFound();
  }

  const totalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE));

  return (
    <BannerCategoryDetailClient
      category={result.category}
      banners={result.banners}
      currentPage={currentPage}
      totalPages={totalPages}
      totalCount={result.totalCount}
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