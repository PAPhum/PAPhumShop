'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageCircle,
  ShieldCheck,
  ArrowUpRight,
  Gamepad2,
  Image as ImageIcon,
} from 'lucide-react';

const FACEBOOK_PROFILE_URL = 'https://www.facebook.com/phurinat.preedasuriyachai';
const FACEBOOK_CREDIT_URL = 'https://www.facebook.com/share/1Gn515Xq7N/';

export default function SiteChromeExtras() {
  const pathname = usePathname() || '/store';
  const isAdminRoute = pathname.startsWith('/admin');
  const isDeliverRoute = pathname.startsWith('/deliver');

  if (isAdminRoute || isDeliverRoute) {
    return null;
  }

  return (
    <>
      {/* ปุ่มลอยมุมขวาล่าง */}
      <a
        href={FACEBOOK_PROFILE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="ติดต่อ Facebook ร้าน PAPhum"
        className="fixed bottom-20 right-5 z-40 inline-flex h-11 items-center gap-2 rounded-full border border-[#93C5FD]/40 bg-[#12141C]/90 px-4 text-xs font-semibold text-[#F1F5F9] shadow-[0_12px_32px_rgba(0,0,0,0.65)] backdrop-blur-md transition-all active:scale-95 hover:border-[#93C5FD] hover:bg-[#191D29] hover:text-[#93C5FD]"
      >
        <MessageCircle className="h-4 w-4 text-[#93C5FD]" />
        <span>ติดต่อเฟสร้าน</span>
      </a>

      {/* แถบ Footer ด้านล่างสุด */}
      <footer className="mt-auto border-t border-white/[0.08] bg-[#08090D]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <img
                src="/me.jpg"
                alt="PAPhum"
                className="h-9 w-9 shrink-0 rounded-xl border border-[#93C5FD]/40 object-cover object-top"
              />
              <div>
                <span className="block text-sm font-bold tracking-tight text-[#F1F5F9]">
                  PAPhum
                </span>
                <a
                  href={FACEBOOK_PROFILE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#93C5FD] transition-colors hover:underline"
                >
                  <span>FB: Phurinat Preedasuriyachai (ภูมิ)</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <p className="text-xs text-zinc-400">
              ร้านซื้อ-ขายไอดีเกม RoV ผ่อนได้ และบริการออกแบบตัดรูปป้ายสกินครบวงจร
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs text-zinc-400">
              <Link
                href="/store"
                className="inline-flex items-center gap-1 transition-colors hover:text-[#93C5FD]"
              >
                <Gamepad2 className="h-3.5 w-3.5" />
                <span>ซื้อ-ขายไอดี</span>
              </Link>
              <span className="text-zinc-700">|</span>
              <Link
                href="/banners"
                className="inline-flex items-center gap-1 transition-colors hover:text-[#93C5FD]"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                <span>ตัวอย่างงานตัดป้าย</span>
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={FACEBOOK_CREDIT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-[#12141C] px-4 py-2 text-xs font-semibold text-zinc-200 transition-all active:scale-95 hover:border-[#93C5FD]/45 hover:text-[#93C5FD]"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[#93C5FD]" />
              <span>เช็คเครดิต (ปกเฟส)</span>
              <ArrowUpRight className="h-3.5 w-3.5 opacity-70" />
            </a>

            <a
              href={FACEBOOK_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#F1F5F9] px-4 py-2 text-xs font-semibold text-[#08090D] shadow-[0_2px_14px_rgba(241,245,249,0.2)] transition-all active:scale-95 hover:bg-white"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>Facebook ร้าน</span>
              <ArrowUpRight className="h-3.5 w-3.5 opacity-75" />
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}