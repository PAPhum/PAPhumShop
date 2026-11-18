'use client';

import { useState, useEffect } from 'react';
import { Upload, Check, Link2, Loader2, Tag } from 'lucide-react';
import { BannerCategory } from '@/types/database';
import { processImageToWebP } from '@/lib/image-processor';

interface BannerBulkUploaderProps {
  categories: BannerCategory[];
  onCategoryCreated?: (cat: BannerCategory) => void;
}

interface UploadedResultItem {
  filename: string;
  code: string | null;
  deliveryLink: string | null;
  watermarkedUrl: string;
}

async function uploadBlobToR2(
  blob: Blob,
  folder: string,
  filename: string,
  contentType: string
): Promise<{ publicUrl: string; key: string }> {
  const presignRes = await fetch('/api/admin/upload/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder,
      filename,
      contentType,
    }),
  });

  const presign = await presignRes.json().catch(() => ({}));
  if (!presignRes.ok || !presign.uploadUrl) {
    throw new Error(presign.error ?? `ขอสิทธิ์อัปโหลดไม่สำเร็จ (${presignRes.status})`);
  }

  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });

  if (!putRes.ok) {
    throw new Error(`อัปโหลดไฟล์ขึ้น Cloudflare R2 ไม่สำเร็จ (${putRes.status})`);
  }

  return {
    publicUrl: presign.publicUrl,
    key: presign.key ?? '',
  };
}

export default function BannerBulkUploader({
  categories,
}: BannerBulkUploaderProps) {
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    categories[0]?.id ? [categories[0].id] : []
  );
  const [bannerCode, setBannerCode] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [createDeliveryLink, setCreateDeliveryLink] = useState(true);
  const [watermarkText, setWatermarkText] = useState('PAPhum');

  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [results, setResults] = useState<UploadedResultItem[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const fetchNextBannerCode = async () => {
    try {
      const res = await fetch('/api/admin/banners?meta=next_code');
      const data = await res.json();
      if (res.ok && data.nextCode) {
        setBannerCode(String(data.nextCode));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchNextBannerCode();
  }, []);

  const toggleCategory = (catId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setUploading(true);
    setUploadError(null);
    const uploadedBatch: UploadedResultItem[] = [];

    const trimmedCode = bannerCode.trim();
    const isNumericCode = /^\d+$/.test(trimmedCode);
    const startingNumber = isNumericCode ? parseInt(trimmedCode, 10) : null;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgressText(`กำลังประมวลผลรูปที่ ${i + 1} จาก ${files.length}...`);

        const currentCode =
          startingNumber !== null
            ? String(startingNumber + i)
            : trimmedCode || null;

        const watermarkedBlob = await processImageToWebP(file, {
          watermarkText: watermarkText.trim() || undefined,
          quality: 0.88,
          maxWidth: 1600,
        });

        const portUploaded = await uploadBlobToR2(
          watermarkedBlob,
          'portfolio',
          `${file.name.replace(/\.[^.]+$/, '')}.webp`,
          'image/webp'
        );

        let originalR2Key: string | null = null;
        if (createDeliveryLink) {
          const origUploaded = await uploadBlobToR2(
            file,
            'temp-deliveries',
            file.name,
            file.type || 'image/png'
          );
          originalR2Key = origUploaded.key || null;
        }

        const saveRes = await fetch('/api/admin/banners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryIds: selectedCategoryIds,
            code: currentCode,
            watermarkedUrl: portUploaded.publicUrl,
            isPublic,
            originalR2Key,
            originalFilename: file.name,
          }),
        });

        const saveData = await saveRes.json();
        if (!saveRes.ok) {
          throw new Error(saveData.error ?? 'บันทึกข้อมูลผลงานลงฐานข้อมูลไม่สำเร็จ');
        }

        const origin = window.location.origin;

        uploadedBatch.push({
          filename: file.name,
          code: currentCode,
          watermarkedUrl: portUploaded.publicUrl,
          deliveryLink: saveData.deliveryToken
            ? `${origin}/deliver/${saveData.deliveryToken}`
            : null,
        });
      }

      setResults((prev) => [...uploadedBatch, ...prev]);
      await fetchNextBannerCode();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาดระหว่างอัปโหลดรูปภาพ'
      );
    } finally {
      setUploading(false);
      setProgressText('');
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="frost-card space-y-5 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-[#F1F5F9]">
          อัปโหลดผลงานตัดป้าย / สร้างลิงก์ส่งงาน
        </h2>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300">
              <Tag className="h-3.5 w-3.5 text-[#93C5FD]" />
              <span>เลือกหมวดหมู่ (เลือกได้มากกว่า 1 หมวด แต่นับเป็น 1 ผลงาน)</span>
            </label>
            <span className="text-[11px] tabular-nums text-[#93C5FD]">
              เลือกอยู่ {selectedCategoryIds.length} หมวด
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/[0.08] bg-[#0D0F14]/90 p-3">
            {categories.map((cat) => {
              const active = selectedCategoryIds.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                    active
                      ? 'border-[#93C5FD] bg-[#93C5FD]/20 text-[#93C5FD]'
                      : 'border-white/[0.08] bg-[#141720] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">
              รหัสงาน (ค่าเริ่มต้นนับต่อจากจำนวนงานทั้งหมด)
            </label>
            <input
              type="text"
              value={bannerCode}
              onChange={(e) => setBannerCode(e.target.value)}
              placeholder="1231"
              className="w-full rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3.5 py-2 text-xs tabular-nums text-[#F1F5F9] placeholder:text-zinc-600 focus:border-[#93C5FD]/60 focus:outline-none sm:text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">ลายน้ำหน้าพอร์ต</label>
            <input
              type="text"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              className="w-full rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3.5 py-2 text-xs text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none sm:text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-5 text-xs text-zinc-300">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 rounded accent-[#93C5FD]"
            />
            <span>แสดงบนหน้าพอร์ตโฟลิโอทันที</span>
          </label>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={createDeliveryLink}
              onChange={(e) => setCreateDeliveryLink(e.target.checked)}
              className="h-4 w-4 rounded accent-[#93C5FD]"
            />
            <span>สร้างลิงก์ดาวน์โหลดต้นฉบับ (หมดอายุ 7 วัน)</span>
          </label>
        </div>

        {uploadError && (
          <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">
            {uploadError}
          </p>
        )}

        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.16] bg-[#0D0F14] px-4 py-8 text-center transition-colors hover:border-[#93C5FD]/60">
          {uploading ? (
            <>
              <Loader2 className="mb-2 h-6 w-6 animate-spin text-[#93C5FD]" />
              <span className="text-xs font-medium text-[#93C5FD] sm:text-sm">
                {progressText}
              </span>
            </>
          ) : (
            <>
              <Upload className="mb-2 h-6 w-6 text-[#93C5FD]" />
              <span className="text-xs font-semibold text-[#F1F5F9] sm:text-sm">
                แตะเพื่อเลือกรูปภาพ (อัปโหลดได้พร้อมกันหลายไฟล์)
              </span>
              <span className="mt-1 text-xs text-zinc-500">
                บีบอัด WebP + ลายน้ำขึ้นพอร์ต และแยกไฟล์ต้นฉบับสร้างลิงก์ส่งงานอัตโนมัติ
              </span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={handleFilesSelected}
            className="hidden"
          />
        </label>
      </div>

      {results.length > 0 && (
        <div className="frost-card rounded-2xl p-4">
          <h3 className="mb-3 text-xs font-semibold text-zinc-400">
            อัปโหลดล่าสุด ({results.length})
          </h3>
          <div className="divide-y divide-white/[0.06]">
            {results.map((item, idx) => (
              <div
                key={`res-${idx}`}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-[#F1F5F9]">
                    {item.code ? `#${item.code} — ` : ''}
                    {item.filename}
                  </p>
                  {item.deliveryLink && (
                    <p className="truncate text-xs tabular-nums text-[#93C5FD]">
                      {item.deliveryLink}
                    </p>
                  )}
                </div>

                {item.deliveryLink && (
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(item.deliveryLink!);
                      setCopiedIndex(idx);
                      setTimeout(() => setCopiedIndex(null), 2000);
                    }}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#F1F5F9] px-3.5 py-1.5 text-xs font-semibold text-[#090B10] active:scale-95 hover:bg-white"
                  >
                    {copiedIndex === idx ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>คัดลอกแล้ว</span>
                      </>
                    ) : (
                      <>
                        <Link2 className="h-3.5 w-3.5" />
                        <span>คัดลอกลิงก์ส่งงาน</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}