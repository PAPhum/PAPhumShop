import { Suspense } from 'react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import Link from 'next/link';
import { Download, Clock, AlertCircle, Snowflake, ArrowLeft } from 'lucide-react';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface DeliverPageProps {
  params: Promise<{ token: string }>;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function ExpiredNotice() {
  return (
    <div className="mx-auto max-w-md pt-8 animate-panel-in">
      <div className="frost-card space-y-4 rounded-2xl p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-base font-bold text-[#F1F5F9]">
            ลิงก์ดาวน์โหลดหมดอายุหรือไม่พบไฟล์
          </h1>
          <p className="text-xs leading-relaxed text-zinc-400">
            ไฟล์ต้นฉบับความละเอียดสูงจะเก็บไว้ในระบบ 7 วันหลังส่งงาน
            หากต้องการรับไฟล์ใหม่กรุณาทักแชทร้านครับ
          </p>
        </div>
        <Link
          href="/banners"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-[#0D0F14] px-4 py-2 text-xs font-semibold text-zinc-200 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>ดูผลงานตัดรูป</span>
        </Link>
      </div>
    </div>
  );
}

async function DeliverContentLoader({ params }: DeliverPageProps) {
  await connection();
  const { token } = await params;

  if (!TOKEN_PATTERN.test(token)) {
    return <ExpiredNotice />;
  }

  const supabase = createSupabaseAdminClient();

  const { data: delivery } = await supabase
    .from('deliveries')
    .select(
      'original_filename, expires_at, banner_id, banner:banners(watermarked_url, code)'
    )
    .eq('token', token)
    .maybeSingle();

  const isExpired =
    !delivery || new Date(delivery.expires_at).getTime() < Date.now();

  if (isExpired) {
    return <ExpiredNotice />;
  }

  const expiresDate = new Date(delivery.expires_at).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const bannerInfo = Array.isArray(delivery.banner)
    ? delivery.banner[0]
    : delivery.banner;

  return (
    <div className="mx-auto max-w-lg pt-4 animate-panel-in">
      <div className="frost-card space-y-5 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#93C5FD]/30 bg-[#93C5FD]/10 text-[#93C5FD]">
              <Snowflake className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-sm font-bold text-[#F1F5F9] sm:text-base">
                ส่งงานไฟล์ต้นฉบับ (ไร้ลายน้ำ)
              </h1>
              <p className="text-xs text-zinc-400">
                ไฟล์ความละเอียดเต็มพร้อมใช้งาน
              </p>
            </div>
          </div>
        </div>

        {bannerInfo?.watermarked_url && (
          <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0D0F14]">
            <img
              src={bannerInfo.watermarked_url}
              alt={delivery.original_filename}
              className="mx-auto max-h-80 w-auto object-contain"
            />
          </div>
        )}

        <div className="space-y-2 rounded-xl border border-white/[0.08] bg-[#0D0F14]/90 p-3.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-400">ชื่อไฟล์</span>
            <span className="truncate font-semibold text-[#F1F5F9]">
              {delivery.original_filename}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-zinc-400">
              <Clock className="h-3.5 w-3.5 text-[#93C5FD]" />
              <span>หมดอายุลิงก์</span>
            </span>
            <span className="tabular-nums text-zinc-200">{expiresDate}</span>
          </div>
        </div>

        <a
          href={`/api/deliver/${encodeURIComponent(token)}/download`}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#F1F5F9] py-3 text-xs font-semibold text-[#090B10] transition-all active:scale-95 hover:bg-white sm:text-sm"
        >
          <Download className="h-4 w-4" />
          <span>ดาวน์โหลดไฟล์ต้นฉบับ</span>
        </a>
      </div>
    </div>
  );
}

export default function DeliverPage({ params }: DeliverPageProps) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg pt-4">
          <div className="h-96 animate-pulse rounded-2xl border border-white/[0.06] bg-[#12141C]" />
        </div>
      }
    >
      <DeliverContentLoader params={params} />
    </Suspense>
  );
}