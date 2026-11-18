'use client';

import { useState, useEffect } from 'react';
import { Download, Copy, Check, AlertTriangle, Clock, Snowflake } from 'lucide-react';
import { DeliveryItem } from '@/types/database';

interface DeliveryDownloadClientProps {
  delivery: DeliveryItem;
  previewUrl?: string | null;
}

export default function DeliveryDownloadClient({
  delivery,
  previewUrl,
}: DeliveryDownloadClientProps) {
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    if (/FBAN|FBAV|FB_IAB|Messenger|Line\/|Instagram/i.test(ua)) {
      setIsInAppBrowser(true);
    }
  }, []);

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const expiresDate = new Date(delivery.expires_at);
  const formattedExpiry = expiresDate.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="mx-auto max-w-md pt-4 sm:pt-8 animate-panel-in">
      {isInAppBrowser && (
        <div className="mb-4 rounded-xl border border-[#93C5FD]/30 bg-[#111216] p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#93C5FD]" />
            <div className="text-xs leading-relaxed text-zinc-300">
              <p className="font-semibold text-[#F1F5F9]">
                แนะนำให้เปิดใน Chrome หรือ Safari
              </p>
              <p className="mt-1 text-zinc-400">
                เบราว์เซอร์ในแอปแชทอาจบล็อกการบันทึกรูปลงเครื่อง กดคัดลอกลิงก์ด้านล่างเพื่อเปิดในเบราว์เซอร์หลัก
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyLink}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#F1F5F9] py-2 text-xs font-semibold text-[#0A0A0D]"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>คัดลอกลิงก์แล้ว</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>คัดลอกลิงก์</span>
              </>
            )}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111216] p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <Snowflake className="h-4 w-4 text-[#93C5FD]" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-[#F1F5F9]">PAPhum Delivery</h1>
            <p className="truncate font-[family-name:var(--font-mono)] text-xs text-zinc-400">
              {delivery.original_filename}
            </p>
          </div>
        </div>

        {previewUrl && (
          <div className="mb-4 overflow-hidden rounded-lg border border-white/[0.08] bg-[#070709]">
            <img
              src={previewUrl}
              alt={delivery.original_filename}
              className="max-h-96 w-full object-contain"
            />
          </div>
        )}

        <div className="mb-4 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-[#0A0A0D] px-3 py-2 text-xs text-zinc-400">
          <Clock className="h-3.5 w-3.5 shrink-0 text-[#93C5FD]" />
          <span>หมดอายุ {formattedExpiry} น.</span>
        </div>

        <a
          href={`/api/deliver/${encodeURIComponent(delivery.token)}/download`}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#F1F5F9] py-3 text-xs font-semibold text-[#0A0A0D] transition-all hover:bg-white active:scale-[0.99] sm:text-sm"
        >
          <Download className="h-4 w-4" />
          <span>ดาวน์โหลดไฟล์ต้นฉบับ</span>
        </a>
      </div>
    </div>
  );
}