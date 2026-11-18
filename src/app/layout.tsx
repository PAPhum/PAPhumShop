import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Noto_Sans_Thai } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import SiteChromeExtras from '@/components/SiteChromeExtras';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-en',
  display: 'swap',
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-th',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PAPhum | รับซื้อ ขาย ทำป้ายRoV',
  description: 'RoV by PAPhum ผ่อน-ผ่านกลางได้และรับทำป้ายขายไอดีงานไวม้าก',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="th"
      className={`${jakarta.variable} ${notoSansThai.variable} dark`}
    >
      <body className="flex min-h-screen flex-col bg-[#08090D] font-sans text-[#F1F5F9] antialiased selection:bg-[#93C5FD]/25 selection:text-[#F1F5F9]">
        {/* เลเยอร์พื้นหลัง Ambient Frost Glow + ลายจุดละเอียด */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute -top-36 left-1/2 h-[420px] w-[780px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(147,197,253,0.11)_0%,rgba(56,189,248,0.03)_48%,transparent_75%)]" />
          <div className="absolute -bottom-40 -right-24 h-[360px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(147,197,253,0.06)_0%,transparent_70%)]" />
          <div className="bg-dot-matrix absolute inset-0 opacity-45" />
        </div>

        <Suspense fallback={<div className="h-14 border-b border-white/[0.08] bg-[#08090D]/65 sm:h-16" />}>
          <Navbar />
        </Suspense>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
          {children}
        </main>

        <Suspense fallback={null}>
          <SiteChromeExtras />
        </Suspense>
      </body>
    </html>
  );
}