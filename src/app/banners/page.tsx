import { Suspense } from 'react';
import { getCachedBannerPortfolio } from '@/lib/public-data';
import BannerPortfolioClient from '@/components/BannerPortfolioClient';

async function BannersSectionsLoader() {
  const { sections, totalWorksCount } = await getCachedBannerPortfolio();

  return (
    <BannerPortfolioClient
      sections={sections}
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