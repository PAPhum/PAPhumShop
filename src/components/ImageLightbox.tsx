'use client';

import { useState, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import ModalPortal from './ModalPortal';

interface ImageLightboxProps {
  images: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export default function ImageLightbox({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  title,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoomed(false);
  }, [initialIndex, isOpen]);

  // ล็อกการเลื่อนของหน้าหลักด้านหลัง (รองรับทั้ง iOS Safari และ Desktop)
  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    const html = document.documentElement;
    const body = document.body;

    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyWidth = body.style.width;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.width = prevBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && images.length > 1) {
        setCurrentIndex((prev) => (prev + 1) % images.length);
        setZoomed(false);
      }
      if (e.key === 'ArrowLeft' && images.length > 1) {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
        setZoomed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, images.length, onClose]);

  if (!isOpen || images.length === 0) return null;

  const currentSrc = images[currentIndex] ?? images[0];

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[60] flex flex-col bg-[#070709]/95 backdrop-blur-md overscroll-none animate-modal-in"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <div className="flex items-center gap-3">
            {title && (
              <span className="font-[family-name:var(--font-mono)] text-sm font-semibold text-[#F1F5F9]">
                {title}
              </span>
            )}
            {images.length > 1 && (
              <span className="font-[family-name:var(--font-mono)] text-xs text-zinc-400">
                {currentIndex + 1} / {images.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setZoomed((z) => !z)}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#111216] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-white/25"
            >
              {zoomed ? (
                <>
                  <ZoomOut className="h-3.5 w-3.5 text-[#93C5FD]" />
                  <span>ย่อพอดีจอ</span>
                </>
              ) : (
                <>
                  <ZoomIn className="h-3.5 w-3.5 text-[#93C5FD]" />
                  <span>ซูมดูรายละเอียด</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] bg-[#111216] text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          className={`relative flex-1 overscroll-contain p-3 sm:p-6 ${
            zoomed ? 'overflow-auto' : 'overflow-hidden touch-none'
          }`}
        >
          <div className="flex min-h-full items-center justify-center">
            <img
              src={currentSrc}
              alt={title ?? 'ภาพขยาย'}
              onClick={() => setZoomed((z) => !z)}
              className={`rounded-md transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                zoomed
                  ? 'w-[180vw] max-w-none cursor-zoom-out sm:w-[130vw] lg:w-[95vw]'
                  : 'max-h-[82vh] w-auto max-w-full cursor-zoom-in object-contain'
              }`}
            />
          </div>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => {
                  setCurrentIndex(
                    (prev) => (prev - 1 + images.length) % images.length
                  );
                  setZoomed(false);
                }}
                aria-label="ก่อนหน้า"
                className="fixed left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-[#111216]/90 p-2.5 text-zinc-200 transition-transform hover:scale-105 hover:text-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentIndex((prev) => (prev + 1) % images.length);
                  setZoomed(false);
                }}
                aria-label="ถัดไป"
                className="fixed right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-[#111216]/90 p-2.5 text-zinc-200 transition-transform hover:scale-105 hover:text-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}