'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calculator,
  Copy,
  Check,
  Images,
  ShieldCheck,
} from 'lucide-react';
import { AccountPublic, InstallmentSettings } from '@/types/database';
import ImageLightbox from './ImageLightbox';

interface AccountDetailClientProps {
  account: AccountPublic;
  settings?: InstallmentSettings;
}

export default function AccountDetailClient({
  account,
  settings,
}: AccountDetailClientProps) {
  const allImages = useMemo(() => {
    const list: string[] = [];
    if (account.main_image_url) list.push(account.main_image_url);
    for (const img of account.gallery_urls ?? []) {
      if (img && !list.includes(img)) list.push(img);
    }
    return list;
  }, [account]);

  const planType: 'weekly' | 'monthly' =
    account.price > 5000 ? 'monthly' : 'weekly';

  const minDown =
    planType === 'weekly'
      ? account.min_down_weekly || settings?.default_min_down_weekly || 1000
      : account.min_down_monthly || settings?.default_min_down_monthly || 2000;

  const freePeriods =
    planType === 'weekly'
      ? account.interest_free_weeks
      : account.interest_free_months;

  const interestRate =
    planType === 'weekly'
      ? (settings?.weekly_interest_rate ?? 140)
      : (settings?.monthly_interest_rate ?? 600);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [downPayment, setDownPayment] = useState<number>(minDown);
  const [installmentCount, setInstallmentCount] = useState<number>(
    Math.max(1, freePeriods || (planType === 'weekly' ? 4 : 2))
  );
  const [copiedSummary, setCopiedSummary] = useState(false);

  const calculation = useMemo(() => {
    const safeDown = Math.max(
      minDown,
      Math.min(account.price, downPayment || minDown)
    );
    const periods = Math.max(1, installmentCount || 1);
    const principalAfterDown = Math.max(0, account.price - safeDown);
    const extraInterestPeriods = Math.max(0, periods - freePeriods);
    const totalInterest = extraInterestPeriods * interestRate;
    const totalToPay = principalAfterDown + totalInterest;
    const perPeriodAmount = Math.ceil(totalToPay / periods);

    return {
      downPayment: safeDown,
      principalAfterDown,
      periods,
      extraInterestPeriods,
      totalInterest,
      perPeriodAmount,
    };
  }, [
    account.price,
    minDown,
    downPayment,
    installmentCount,
    freePeriods,
    interestRate,
  ]);

  const unitLabel = planType === 'weekly' ? 'สัปดาห์' : 'เดือน';

  const handleCopyInquiry = async () => {
    const text = [
      `สนใจไอดี ${account.code}`,
      `ราคา: ${account.price.toLocaleString('en-US')} บาท`,
      `ผ่อนราย${unitLabel} (ดาวน์ ${calculation.downPayment.toLocaleString('en-US')} / ${calculation.periods} ${unitLabel})`,
      `งวดละ ${calculation.perPeriodAmount.toLocaleString('en-US')} บาท`,
    ].join('\n');

    await navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  return (
    <>
      <div className="space-y-6 animate-panel-in">
        <div className="flex items-center justify-between">
          <Link
            href="/store"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-[#12141C] px-3.5 py-2 text-xs font-semibold text-zinc-200 transition-colors active:scale-95 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>กลับหน้ารวมไอดี</span>
          </Link>

          <span className="rounded-full border border-[#93C5FD]/30 bg-[#93C5FD]/12 px-3.5 py-1 text-xs font-bold tabular-nums text-[#93C5FD]">
            {account.code}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* ฝั่งซ้าย: รูปป้ายหลัก + รูปเพิ่มเติม */}
          <div className="space-y-4 lg:col-span-7">
            {allImages.length > 0 && (
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => setLightboxIndex(0)}
                  className="frost-card-interactive group relative mx-auto block aspect-[4/5] w-full max-w-md overflow-hidden rounded-2xl bg-[#0D0F14]"
                >
                  <img
                    src={allImages[0]}
                    alt={account.code}
                    className="h-full w-full object-cover object-top transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.02]"
                  />
                  <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#090B10]/85 px-3 py-1.5 text-xs font-medium text-zinc-200">
                    <Images className="h-3.5 w-3.5 text-[#93C5FD]" />
                    <span>ดูรูปใหญ่ ({allImages.length})</span>
                  </span>
                </button>

                {allImages.length > 1 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-semibold text-zinc-400">
                      รูปเพิ่มเติม ({allImages.length - 1})
                    </p>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                      {allImages.slice(1).map((imgUrl, idx) => (
                        <button
                          key={`${account.id}-thumb-${idx}`}
                          type="button"
                          onClick={() => setLightboxIndex(idx + 1)}
                          className="frost-card-interactive aspect-square overflow-hidden rounded-xl bg-[#0D0F14]"
                        >
                          <img
                            src={imgUrl}
                            alt={`${account.code}-${idx + 2}`}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* รายละเอียดไอดี */}
            <div className="frost-card space-y-4 rounded-2xl p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.07] pb-4">
                <div>
                  <p className="text-xs text-zinc-400">รหัสไอดี</p>
                  <h1 className="text-xl font-bold tabular-nums text-[#F1F5F9]">
                    {account.code}
                  </h1>
                </div>

                <div className="text-right">
                  <p className="text-xs text-zinc-400">ราคา</p>
                  <p className="text-2xl font-bold tabular-nums text-[#F1F5F9]">
                    {account.price.toLocaleString('en-US')}.-
                  </p>
                </div>
              </div>

              {(account.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {account.tags.map((tag, idx) => (
                    <span
                      key={`${account.id}-detail-tag-${idx}`}
                      className="rounded-lg border border-white/[0.09] bg-[#0D0F14] px-3 py-1 text-xs font-medium text-zinc-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {account.description && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                  {account.description}
                </p>
              )}

              <div className="flex items-center gap-2 rounded-xl border border-[#93C5FD]/20 bg-[#93C5FD]/8 px-3.5 py-2.5 text-xs text-zinc-300">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#93C5FD]" />
                <span>ตรวจสอบข้อมูลบัญชีเรียบร้อย</span>
              </div>
            </div>
          </div>

          {/* ฝั่งขวา: คำนวณยอดผ่อน */}
          <div className="lg:col-span-5">
            <div className="frost-card sticky top-20 space-y-4 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] pb-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#93C5FD]/30 bg-[#93C5FD]/10 text-[#93C5FD]">
                    <Calculator className="h-4 w-4" />
                  </span>
                  <h2 className="text-sm font-bold text-[#F1F5F9]">
                    คำนวณยอดผ่อน
                  </h2>
                </div>

                <span className="rounded-full border border-[#93C5FD]/35 bg-[#93C5FD]/12 px-3 py-1 text-xs font-semibold text-[#93C5FD]">
                  ผ่อนราย{unitLabel}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-zinc-400">เงินดาวน์ (บาท)</label>
                  <span className="tabular-nums text-[#93C5FD]">
                    ขั้นต่ำ {minDown.toLocaleString('en-US')}.-
                  </span>
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={minDown}
                  max={account.price}
                  step={100}
                  value={downPayment}
                  onChange={(e) => setDownPayment(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3.5 py-2.5 text-sm font-semibold tabular-nums text-[#F1F5F9] focus:border-[#93C5FD]/50 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-zinc-400">
                    จำนวนงวด ({unitLabel})
                  </label>
                  <span className="text-[#93C5FD]">
                    {freePeriods > 0
                      ? `ฟรีดอก ${freePeriods} ${unitLabel}`
                      : `ดอก ${interestRate.toLocaleString('en-US')}.- / ${unitLabel}`}
                  </span>
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={24}
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3.5 py-2.5 text-sm font-semibold tabular-nums text-[#F1F5F9] focus:border-[#93C5FD]/50 focus:outline-none"
                />
              </div>

              <div className="space-y-2 rounded-xl border border-white/[0.08] bg-[#0D0F14]/90 p-4 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>ดาวน์</span>
                  <span className="font-semibold tabular-nums text-[#F1F5F9]">
                    {calculation.downPayment.toLocaleString('en-US')} บาท
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>ยอดเหลือ</span>
                  <span className="tabular-nums text-zinc-200">
                    {calculation.principalAfterDown.toLocaleString('en-US')} บาท
                  </span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>ดอก</span>
                  <span className="tabular-nums text-zinc-200">
                    +{calculation.totalInterest.toLocaleString('en-US')} บาท
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-t border-white/[0.08] pt-2.5">
                  <span className="font-semibold text-zinc-200">
                    ผ่อนงวดละ ({calculation.periods} งวด)
                  </span>
                  <span className="text-lg font-bold tabular-nums text-[#93C5FD]">
                    {calculation.perPeriodAmount.toLocaleString('en-US')}.-
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopyInquiry}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#F1F5F9] py-3 text-xs font-semibold text-[#090B10] transition-all active:scale-95 hover:bg-white sm:text-sm"
              >
                {copiedSummary ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>คัดลอกแล้ว</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>คัดลอกยอดผ่อน</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={allImages}
          initialIndex={lightboxIndex}
          isOpen={true}
          onClose={() => setLightboxIndex(null)}
          title={account.code}
        />
      )}
    </>
  );
}