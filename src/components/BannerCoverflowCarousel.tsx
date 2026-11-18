'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BannerItem } from '@/types/database';
import { isOptimizableImageUrl } from '@/lib/image-url';

interface BannerCoverflowCarouselProps {
  banners: BannerItem[];
  categoryName: string;
  onSelectBanner: (index: number) => void;
}

function getCircularIndex(virtualIdx: number, length: number): number {
  return ((virtualIdx % length) + length) % length;
}

export default function BannerCoverflowCarousel({
  banners,
  categoryName,
  onSelectBanner,
}: BannerCoverflowCarouselProps) {
  const [virtualIndex, setVirtualIndex] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const count = banners.length;
  if (count === 0) return null;

  const activeRealIndex = getCircularIndex(virtualIndex, count);

  if (count === 1) {
    const single = banners[0];
    return (
      <div className="flex flex-col items-center py-2">
        <button
          type="button"
          onClick={() => onSelectBanner(0)}
          className="frost-card-interactive group relative aspect-[3/4] w-[230px] overflow-hidden rounded-2xl border border-[#93C5FD]/35 shadow-2xl sm:w-[270px] md:w-[295px]"
        >
          {isOptimizableImageUrl(single.watermarked_url) ? (
            <Image
              src={single.watermarked_url}
              alt={single.code ?? categoryName}
              fill
              priority
              sizes="(max-width: 640px) 230px, (max-width: 768px) 270px, 295px"
              className="object-cover object-top transition-transform duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
            />
          ) : (
            <img
              src={single.watermarked_url}
              alt={single.code ?? categoryName}
              loading="eager"
              decoding="async"
              className="h-full w-full object-cover object-top transition-transform duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
            />
          )}
          {single.code && (
            <span className="absolute bottom-3 left-3 rounded-lg border border-white/15 bg-[#090B10]/85 px-2.5 py-1 text-xs font-semibold tabular-nums text-zinc-200 backdrop-blur-sm">
              {single.code}
            </span>
          )}
        </button>
      </div>
    );
  }

  const goPrev = () => setVirtualIndex((prev) => prev - 1);
  const goNext = () => setVirtualIndex((prev) => prev + 1);

  const jumpToRealIndex = (targetRealIdx: number) => {
    const currentReal = getCircularIndex(virtualIndex, count);
    if (targetRealIdx === currentReal) return;

    const forwardSteps = (targetRealIdx - currentReal + count) % count;
    const backwardSteps = forwardSteps - count;
    const shortestDelta =
      Math.abs(forwardSteps) <= Math.abs(backwardSteps)
        ? forwardSteps
        : backwardSteps;

    setVirtualIndex((prev) => prev + shortestDelta);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      if (dx < 0) {
        goNext();
      } else {
        goPrev();
      }
    }
  };

  const offsets = [-3, -2, -1, 0, 1, 2, 3];

  return (
    <div className="space-y-3.5 select-none">
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative mx-auto flex h-[315px] w-full max-w-5xl items-center justify-center overflow-hidden sm:h-[375px] md:h-[415px]"
      >
        {offsets.map((offset) => {
          const slotVirtualIdx = virtualIndex + offset;
          const realIdx = getCircularIndex(slotVirtualIdx, count);
          const banner = banners[realIdx];
          const canOptimize = isOptimizableImageUrl(banner.watermarked_url);

          let positionClass = '';
          if (offset === 0) {
            positionClass =
              'z-30 translate-x-0 scale-100 opacity-100 brightness-100 border-[#93C5FD]/45 shadow-[0_20px_50px_rgba(0,0,0,0.75)]';
          } else if (offset === -1) {
            positionClass =
              'z-20 -translate-x-[54%] sm:-translate-x-[62%] md:-translate-x-[68%] scale-[0.84] opacity-80 brightness-[0.68] hover:brightness-90 border-white/[0.12]';
          } else if (offset === 1) {
            positionClass =
              'z-20 translate-x-[54%] sm:translate-x-[62%] md:translate-x-[68%] scale-[0.84] opacity-80 brightness-[0.68] hover:brightness-90 border-white/[0.12]';
          } else if (offset === -2) {
            positionClass =
              'z-10 pointer-events-none md:pointer-events-auto -translate-x-[82%] md:-translate-x-[122%] lg:-translate-x-[130%] scale-[0.66] md:scale-[0.68] opacity-0 md:opacity-55 brightness-[0.45] md:hover:brightness-75 border-white/[0.08]';
          } else if (offset === 2) {
            positionClass =
              'z-10 pointer-events-none md:pointer-events-auto translate-x-[82%] md:translate-x-[122%] lg:translate-x-[130%] scale-[0.66] md:scale-[0.68] opacity-0 md:opacity-55 brightness-[0.45] md:hover:brightness-75 border-white/[0.08]';
          } else if (offset <= -3) {
            positionClass =
              'z-0 pointer-events-none -translate-x-[95%] md:-translate-x-[162%] scale-[0.54] opacity-0 brightness-[0.35] border-transparent';
          } else {
            positionClass =
              'z-0 pointer-events-none translate-x-[95%] md:translate-x-[162%] scale-[0.54] opacity-0 brightness-[0.35] border-transparent';
          }

          return (
            <button
              key={slotVirtualIdx}
              type="button"
              tabIndex={offset === 0 ? 0 : -1}
              aria-hidden={Math.abs(offset) >= 3}
              aria-label={
                offset === 0
                  ? `ดูรูปขยาย ${banner.code ?? categoryName}`
                  : `เลื่อนไปยังรูปที่ ${realIdx + 1}`
              }
              onClick={() => {
                if (offset === 0) {
                  onSelectBanner(realIdx);
                } else {
                  setVirtualIndex(slotVirtualIdx);
                }
              }}
              className={`group absolute aspect-[3/4] w-[215px] overflow-hidden rounded-2xl border bg-[#12141C] transition-all duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform sm:w-[255px] md:w-[285px] ${positionClass}`}
            >
              {canOptimize ? (
                <Image
                  src={banner.watermarked_url}
                  alt={banner.code ?? categoryName}
                  fill
                  priority={offset === 0}
                  sizes="(max-width: 640px) 215px, (max-width: 768px) 255px, 285px"
                  draggable={false}
                  className={`object-cover object-top transition-transform duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    offset === 0 ? 'group-hover:scale-[1.03]' : ''
                  }`}
                />
              ) : (
                <img
                  src={banner.watermarked_url}
                  alt={banner.code ?? categoryName}
                  loading={Math.abs(offset) <= 1 ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable={false}
                  className={`h-full w-full object-cover object-top transition-transform duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    offset === 0 ? 'group-hover:scale-[1.03]' : ''
                  }`}
                />
              )}

              {offset === 0 && banner.code && (
                <span className="absolute bottom-3 left-3 rounded-lg border border-white/15 bg-[#090B10]/85 px-2.5 py-1 text-xs font-semibold tabular-nums text-zinc-200 backdrop-blur-sm">
                  {banner.code}
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={goPrev}
          aria-label="รูปก่อนหน้า"
          className="absolute left-2 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-[#0D0F14]/90 text-[#F1F5F9] shadow-xl backdrop-blur-md transition-all active:scale-90 hover:border-[#93C5FD] hover:bg-[#161B26] hover:text-[#93C5FD] sm:left-6 sm:h-11 sm:w-11 md:left-10"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={goNext}
          aria-label="รูปถัดไป"
          className="absolute right-2 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-[#0D0F14]/90 text-[#F1F5F9] shadow-xl backdrop-blur-md transition-all active:scale-90 hover:border-[#93C5FD] hover:bg-[#161B26] hover:text-[#93C5FD] sm:right-6 sm:h-11 sm:w-11 md:right-10"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-3">
        <div className="flex items-center gap-1.5">
          {banners.map((item, idx) => {
            const isActive = idx === activeRealIndex;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`ไปยังรูปปักหมุดที่ ${idx + 1}`}
                onClick={() => jumpToRealIndex(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  isActive
                    ? 'w-5 bg-[#93C5FD]'
                    : 'w-1.5 bg-white/20 hover:bg-white/40'
                }`}
              />
            );
          })}
        </div>

        <span className="text-[11px] font-medium tabular-nums text-zinc-500">
          {activeRealIndex + 1} / {count}
        </span>
      </div>
    </div>
  );
}