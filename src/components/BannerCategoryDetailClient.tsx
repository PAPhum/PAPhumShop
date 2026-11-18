'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, ArrowUp } from 'lucide-react';
import { BannerCategory, BannerItem } from '@/types/database';
import ImageLightbox from './ImageLightbox';
import ModalPortal from './ModalPortal';

interface BannerCategoryDetailClientProps {
  category: BannerCategory;
  banners: BannerItem[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

export default function BannerCategoryDetailClient({
  category,
  banners,
  currentPage,
  totalPages,
  totalCount,
}: BannerCategoryDetailClientProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 420);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="space-y-6 animate-panel-in">
      <div className="frost-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <Link
            href="/banners"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors active:scale-95 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>กลับ</span>
          </Link>

          {category.logo_url && (
            <img
              src={category.logo_url}
              alt={category.name}
              className="h-10 w-10 rounded-xl border border-white/[0.12] bg-[#0D0F14] object-cover"
            />
          )}

          <div>
            <h1 className="text-base font-bold text-[#F1F5F9] sm:text-lg">
              {category.name}
            </h1>
            {category.description && (
              <p className="text-xs text-zinc-400">{category.description}</p>
            )}
          </div>
        </div>

        <span className="rounded-full border border-[#93C5FD]/25 bg-[#93C5FD]/10 px-3.5 py-1 text-xs font-semibold tabular-nums text-[#93C5FD]">
          ทั้งหมด {totalCount} รายการ
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {banners.map((banner, idx) => (
          <button
            key={banner.id}
            type="button"
            onClick={() => setLightboxIndex(idx)}
            className="frost-card-interactive group relative aspect-[3/4] overflow-hidden rounded-2xl text-left"
          >
            <img
              src={banner.watermarked_url}
              alt={banner.code ?? category.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
            />
            {banner.code && (
              <span className="absolute bottom-2.5 left-2.5 rounded-lg border border-white/15 bg-[#090B10]/85 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-200">
                {banner.code}
              </span>
            )}
          </button>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          {currentPage > 1 && (
            <Link
              href={`/banners/${encodeURIComponent(category.slug)}?page=${
                currentPage - 1
              }`}
              className="inline-flex items-center gap-1 rounded-xl border border-white/[0.1] bg-[#141720] px-3.5 py-2 text-xs font-semibold text-zinc-200 active:scale-95 hover:text-white"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>ก่อนหน้า</span>
            </Link>
          )}

          <span className="px-3 text-xs font-medium tabular-nums text-zinc-400">
            หน้า {currentPage} / {totalPages}
          </span>

          {currentPage < totalPages && (
            <Link
              href={`/banners/${encodeURIComponent(category.slug)}?page=${
                currentPage + 1
              }`}
              className="inline-flex items-center gap-1 rounded-xl border border-white/[0.1] bg-[#141720] px-3.5 py-2 text-xs font-semibold text-zinc-200 active:scale-95 hover:text-white"
            >
              <span>ถัดไป</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}

      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="กลับขึ้นด้านบน"
          className="fixed bottom-6 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-[#93C5FD]/35 bg-[#12141C]/90 text-[#93C5FD] shadow-lg backdrop-blur-md transition-all active:scale-95 hover:border-[#93C5FD] hover:bg-[#191D29]"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}

      <ModalPortal>
        <ImageLightbox
          images={banners.map((b) => b.watermarked_url)}
          initialIndex={lightboxIndex ?? 0}
          isOpen={lightboxIndex !== null}
          onClose={() => setLightboxIndex(null)}
          title={category.name}
        />
      </ModalPortal>
    </div>
  );
}