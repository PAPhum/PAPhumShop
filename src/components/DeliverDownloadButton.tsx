'use client';

import { useState } from 'react';
import { Download, Loader2, ExternalLink } from 'lucide-react';

interface DeliverDownloadButtonProps {
  token: string;
  filename: string;
}

export default function DeliverDownloadButton({
  token,
  filename,
}: DeliverDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const downloadEndpoint = `/api/deliver/${encodeURIComponent(token)}/download`;

  const triggerClassicDownload = (blobUrl: string, targetFilename: string) => {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = targetFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleSaveOrShare = async () => {
    if (downloading) return;
    setDownloading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(downloadEndpoint, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('ไม่สามารถดึงไฟล์ต้นฉบับได้ ลิงก์อาจหมดอายุแล้ว');
      }

      const blob = await res.blob();
      const mimeType =
        blob.type && blob.type !== 'application/octet-stream'
          ? blob.type
          : 'image/png';
      const file = new File([blob], filename || 'paphum-artwork.png', {
        type: mimeType,
      });

      // รองรับ iOS Safari / Instagram In-App Browser / Android Chrome เด้งหน้าต่าง "บันทึกภาพ"
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            files: [file],
            title: filename,
          });
          return;
        } catch (shareErr) {
          // หากผู้ใช้กดปิดหน้าต่าง Share Sheet เอง ไม่ถือว่าเป็น Error
          if (
            shareErr instanceof Error &&
            shareErr.name === 'AbortError'
          ) {
            return;
          }
        }
      }

      // Fallback สำหรับคอมพิวเตอร์ (Desktop) หรือเบราว์เซอร์ที่ไม่รองรับ Web Share Files
      const blobUrl = URL.createObjectURL(blob);
      triggerClassicDownload(blobUrl, filename || 'paphum-artwork.png');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'เกิดข้อผิดพลาด กรุณาลองกดปุ่มสำรองด้านล่าง'
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        disabled={downloading}
        onClick={handleSaveOrShare}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-[#F1F5F9] py-3 text-xs font-semibold text-[#090B10] transition-all active:scale-95 hover:bg-white disabled:opacity-60 sm:text-sm"
      >
        {downloading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>กำลังเตรียมไฟล์ต้นฉบับ...</span>
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            <span>บันทึก / ดาวน์โหลดไฟล์ต้นฉบับ</span>
          </>
        )}
      </button>

      {errorMsg && (
        <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-center text-xs text-red-400">
          {errorMsg}
        </p>
      )}

      <a
        href={downloadEndpoint}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full items-center justify-center gap-1.5 rounded-full border border-white/[0.1] bg-[#0D0F14] py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-white/25 hover:text-zinc-200"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        <span>เปิดไฟล์เต็ม (สำรอง)</span>
      </a>
    </div>
  );
}