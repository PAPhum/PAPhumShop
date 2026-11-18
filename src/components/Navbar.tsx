'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Gamepad2,
  Image as ImageIcon,
  MessageCircle,
  ArrowUpRight,
} from 'lucide-react';

const FACEBOOK_PROFILE_URL = 'https://www.facebook.com/phurinat.preedasuriyachai';

export default function Navbar() {
  const pathname = usePathname() || '/store';
  const isAdminRoute = pathname.startsWith('/admin');
  const isDeliverRoute = pathname.startsWith('/deliver');
  const isBannersActive = pathname.startsWith('/banners');
  const isStoreActive =
    pathname === '/' ||
    pathname.startsWith('/store') ||
    pathname.startsWith('/id/');

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#08090D]/65 backdrop-blur-xl supports-[backdrop-filter]:bg-[#08090D]/55">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#93C5FD]/25 to-transparent"
      />

      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:h-16 sm:px-6">
        <Link
          href={isAdminRoute ? '/admin' : '/store'}
          className="group flex min-w-0 items-center gap-2.5 rounded-xl py-1 text-[#F1F5F9] transition-opacity active:opacity-80"
        >
          <img
            src="/me.jpg"
            alt="PAPhum"
            className="h-9 w-9 shrink-0 rounded-xl border border-[#93C5FD]/40 object-cover object-top shadow-[0_0_20px_rgba(147,197,253,0.22)]"
          />
          <div className="min-w-0 leading-tight">
            <span className="block text-sm font-bold tracking-tight sm:text-base">
              PAPhum
            </span>
            <span className="block truncate text-[10px] font-medium text-[#93C5FD]/90 sm:text-[11px]">
              FB: Phurinat Preedasuriyachai (ภูมิ)
            </span>
          </div>
        </Link>

        {!isAdminRoute && !isDeliverRoute && (
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            <nav
              aria-label="เมนูหลัก"
              className="relative flex items-center rounded-full border border-white/[0.12] bg-white/[0.04] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl"
            >
              <Link
                href="/store"
                aria-current={isStoreActive ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 sm:px-4 sm:text-sm ${
                  isStoreActive
                    ? 'bg-[#F1F5F9] text-[#08090D] shadow-[0_2px_12px_rgba(241,245,249,0.28)]'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Gamepad2 className="h-3.5 w-3.5" />
                <span>ID</span>
              </Link>

              <Link
                href="/banners"
                aria-current={isBannersActive ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 sm:px-4 sm:text-sm ${
                  isBannersActive
                    ? 'bg-[#F1F5F9] text-[#08090D] shadow-[0_2px_12px_rgba(241,245,249,0.28)]'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                <span>ตัดรูป</span>
              </Link>
            </nav>

            <a
              href={FACEBOOK_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="ติดต่อ Facebook ร้าน PAPhum"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#93C5FD]/30 bg-[#93C5FD]/10 px-2.5 text-xs font-semibold text-[#93C5FD] transition-all active:scale-95 hover:border-[#93C5FD]/60 hover:bg-[#93C5FD]/20 sm:h-10 sm:px-3.5 sm:text-sm"
            >
              <MessageCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">ติดต่อ</span>
              <ArrowUpRight className="hidden h-3.5 w-3.5 opacity-75 sm:inline" />
            </a>
          </div>
        )}
      </div>
    </header>
  );
}