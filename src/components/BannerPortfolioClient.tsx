'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  Snowflake,
  Sparkles,
  Archive,
  ArrowUp,
} from 'lucide-react';
import { BannerCategorySection, BannerItem } from '@/types/database';
import ImageLightbox from './ImageLightbox';
import BannerCoverflowCarousel from './BannerCoverflowCarousel';
import ModalPortal from './ModalPortal';

interface BannerPortfolioClientProps {
  sections: BannerCategorySection[];
  totalWorksCount?: number;
}

export default function BannerPortfolioClient({
  sections,
  totalWorksCount,
}: BannerPortfolioClientProps) {
  const [lightboxData, setLightboxData] = useState<{
    images: string[];
    index: number;
    title: string;
  } | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 420);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (sections.length === 0) {
    return (
      <div className="frost-card flex flex-col items-center justify-center rounded-2xl py-24 text-center animate-panel-in">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#93C5FD]/25 bg-[#93C5FD]/10 text-[#93C5FD]">
          <Snowflake className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-zinc-300">ยังไม่มีผลงานในหมวดหมู่</p>
        <p className="mt-1 text-xs text-zinc-500">
          อัปโหลดรูปหรือจัดหมวดหมู่ได้ที่หน้าหลังบ้าน
        </p>
      </div>
    );
  }

  const openCategoryLightbox = (section: BannerCategorySection, idx: number) => {
    setLightboxData({
      images: section.pinned_banners.map((b: BannerItem) => b.watermarked_url),
      index: idx,
      title: section.name,
    });
  };

  const regularSections = sections.filter((s) => !s.hide_preview);
  const archiveSections = sections.filter((s) => s.hide_preview);

  return (
    <div className="space-y-10 animate-panel-in">
      {/* แถบสรุปยอดผลงานรวมทั้งหมดของร้าน */}
      {typeof totalWorksCount === 'number' && totalWorksCount > 0 && (
        <div className="frost-card flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#93C5FD]/30 bg-[#93C5FD]/10 text-[#93C5FD]">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-semibold text-[#F1F5F9] sm:text-sm">
                คลังผลงานออกแบบ & ตัดป้าย
              </p>
              <p className="text-[11px] text-zinc-400">
                ปัดซ้าย-ขวาเพื่อเลื่อนดูผลงานแนะนำ หรือกดดูทั้งหมดในแต่ละหมวด
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-[#93C5FD]/30 bg-[#93C5FD]/12 px-4 py-1.5 text-xs font-bold tabular-nums text-[#93C5FD] sm:text-sm">
            <span>ผลงานทั้งหมด {totalWorksCount.toLocaleString('en-US')} ชิ้น</span>
          </div>
        </div>
      )}

      {/* หมวดหมู่หลักแบบ Infinite Coverflow Carousel */}
      {regularSections.map((section) => (
        <section key={section.id} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-[#93C5FD] to-[#38BDF8]"
              />

              {section.logo_url && (
                <img
                  src={section.logo_url}
                  alt={section.name}
                  className="h-9 w-9 shrink-0 rounded-xl border border-white/[0.12] bg-[#12141C] object-cover shadow-sm"
                />
              )}

              <div className="min-w-0">
                <h2 className="truncate text-base font-bold tracking-tight text-[#F1F5F9] sm:text-lg">
                  {section.name}
                </h2>
                {section.description && (
                  <p className="truncate text-xs text-zinc-400">
                    {section.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden rounded-full border border-white/[0.08] bg-[#12141C]/90 px-3 py-1 text-xs font-medium tabular-nums text-zinc-400 sm:inline-block">
                {section.total_count} รายการ
              </span>

              <Link
                href={`/banners/${encodeURIComponent(section.slug)}`}
                className="inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-[#141720] px-3.5 py-1.5 text-xs font-semibold text-zinc-200 transition-colors active:scale-95 hover:border-[#93C5FD]/45 hover:text-[#93C5FD]"
              >
                <span>ดูทั้งหมด ({section.total_count})</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <BannerCoverflowCarousel
            banners={section.pinned_banners}
            categoryName={section.name}
            onSelectBanner={(idx) => openCategoryLightbox(section, idx)}
          />
        </section>
      ))}

      {/* แถบ Archive ด้านล่างสุด (เช่น เก่าฝุ่นเกาะ: โชว์เฉพาะจำนวน + ปุ่มดูทั้งหมด) */}
      {archiveSections.length > 0 && (
        <div className="space-y-3 pt-2">
          {archiveSections.map((section) => (
            <div
              key={section.id}
              className="frost-card flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3.5 sm:px-5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#0D0F14] text-zinc-400">
                  <Archive className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-zinc-200 sm:text-base">
                    {section.name}
                  </h2>
                  {section.description && (
                    <p className="truncate text-xs text-zinc-500">
                      {section.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full border border-white/[0.08] bg-[#0D0F14] px-3 py-1 text-xs font-medium tabular-nums text-zinc-400">
                  {section.total_count} รายการ
                </span>

                <Link
                  href={`/banners/${encodeURIComponent(section.slug)}`}
                  className="inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-[#141720] px-3.5 py-1.5 text-xs font-semibold text-zinc-200 transition-colors active:scale-95 hover:border-[#93C5FD]/45 hover:text-[#93C5FD]"
                >
                  <span>ดูทั้งหมด ({section.total_count})</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ปุ่มลอยกลับขึ้นด้านบน */}
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
        {lightboxData && (
          <ImageLightbox
            images={lightboxData.images}
            initialIndex={lightboxData.index}
            isOpen={true}
            onClose={() => setLightboxData(null)}
            title={lightboxData.title}
          />
        )}
      </ModalPortal>
    </div>
  );
}