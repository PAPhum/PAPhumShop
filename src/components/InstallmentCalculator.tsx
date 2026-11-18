'use client';

import { useState, useMemo } from 'react';
import { Copy, Check, AlertCircle } from 'lucide-react';
import {
  InstallmentMode,
  WEEKLY_INTEREST_RATE,
  MONTHLY_INTEREST_RATE,
  getDefaultInstallmentMode,
  calculateInstallmentPlan,
  formatCustomerQuoteText,
} from '@/lib/installment';

interface InstallmentCalculatorProps {
  code: string;
  price: number;
  minDownWeekly: number;
  minDownMonthly: number;
  interestFreeWeeks: number;
  interestFreeMonths: number;
}

export default function InstallmentCalculator({
  code,
  price,
  minDownWeekly,
  minDownMonthly,
  interestFreeWeeks,
  interestFreeMonths,
}: InstallmentCalculatorProps) {
  const defaultMode = useMemo(() => getDefaultInstallmentMode(price), [price]);
  const [mode, setMode] = useState<InstallmentMode>(defaultMode);

  const activeMinDown = mode === 'weekly' ? minDownWeekly : minDownMonthly;
  const activeFreePeriods =
    mode === 'weekly' ? interestFreeWeeks : interestFreeMonths;

  const [downPaymentInput, setDownPaymentInput] = useState<string>(
    String(defaultMode === 'weekly' ? minDownWeekly : minDownMonthly)
  );
  const [maxPeriodsInput, setMaxPeriodsInput] = useState<string>('8');
  const [copied, setCopied] = useState(false);

  const handleSwitchMode = (nextMode: InstallmentMode) => {
    setMode(nextMode);
    const nextMinDown = nextMode === 'weekly' ? minDownWeekly : minDownMonthly;
    setDownPaymentInput(String(nextMinDown));
  };

  const downPayment = Number(downPaymentInput) || 0;
  const maxPeriods = Math.min(24, Math.max(1, Number(maxPeriodsInput) || 8));

  const validationError = useMemo(() => {
    if (downPayment < activeMinDown) {
      return `ดาวน์ขั้นต่ำแบบ${
        mode === 'weekly' ? 'รายสัปดาห์' : 'รายเดือน'
      } ${activeMinDown.toLocaleString('en-US')} บาท`;
    }
    if (downPayment >= price) {
      return 'ยอดดาวน์ถึงราคาขายสดแล้ว';
    }
    return null;
  }, [downPayment, activeMinDown, price, mode]);

  const quotePreviewText = useMemo(() => {
    if (validationError) return '';
    return formatCustomerQuoteText({
      price,
      downPayment,
      minDownPayment: activeMinDown,
      mode,
      interestFreePeriods: activeFreePeriods,
      maxPeriods,
    });
  }, [
    validationError,
    price,
    downPayment,
    activeMinDown,
    mode,
    activeFreePeriods,
    maxPeriods,
  ]);

  const planRows = useMemo(() => {
    if (validationError) return [];
    const startP = mode === 'weekly' ? Math.max(1, activeFreePeriods) : 1;
    const endP = Math.max(startP, maxPeriods);
    const rows = [];

    for (let p = startP; p <= endP; p++) {
      rows.push(
        calculateInstallmentPlan({
          price,
          downPayment,
          minDownPayment: activeMinDown,
          mode,
          periods: p,
          interestFreePeriods: activeFreePeriods,
        })
      );
    }
    return rows;
  }, [
    validationError,
    price,
    downPayment,
    activeMinDown,
    mode,
    activeFreePeriods,
    maxPeriods,
  ]);

  const handleCopyQuote = async () => {
    if (!quotePreviewText) return;
    const textWithCode = `รหัสไอดี: ${code}\n${quotePreviewText}`;
    await navigator.clipboard.writeText(textWithCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="rounded-xl border border-white/[0.08] bg-[#111216] p-4 sm:p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-[#F1F5F9]">คำนวณยอดผ่อน</h2>
        <span className="text-xs text-zinc-400">
          {mode === 'weekly'
            ? `ปลอดดอก ${activeFreePeriods} สัปดาห์ (เกิน ${WEEKLY_INTEREST_RATE}฿/งวด)`
            : `ปลอดดอก ${activeFreePeriods} เดือน (เกิน ${MONTHLY_INTEREST_RATE}฿/งวด)`}
        </span>
      </div>

      {/* ปุ่มสลับโหมดพร้อมแถบเลื่อนสมูท */}
      <div className="relative mb-4 grid grid-cols-2 rounded-lg border border-white/[0.08] bg-[#0A0A0D] p-1">
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-md bg-[#F1F5F9] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            mode === 'monthly' ? 'translate-x-full' : 'translate-x-0'
          }`}
        />

        <button
          type="button"
          onClick={() => handleSwitchMode('weekly')}
          className={`relative z-10 rounded-md py-2 text-xs font-semibold transition-colors ${
            mode === 'weekly' ? 'text-[#0A0A0D]' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          รายสัปดาห์
        </button>
        <button
          type="button"
          onClick={() => handleSwitchMode('monthly')}
          className={`relative z-10 rounded-md py-2 text-xs font-semibold transition-colors ${
            mode === 'monthly' ? 'text-[#0A0A0D]' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          รายเดือน
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">
            เงินดาวน์ (ขั้นต่ำ {activeMinDown.toLocaleString('en-US')})
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={activeMinDown}
            max={price}
            value={downPaymentInput}
            onChange={(e) => setDownPaymentInput(e.target.value)}
            className="w-full rounded-lg border border-white/[0.1] bg-[#0A0A0D] px-3 py-2 font-[family-name:var(--font-mono)] text-sm font-semibold text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-400">
            จำนวน{mode === 'weekly' ? 'สัปดาห์' : 'เดือน'}สูงสุด
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={24}
            value={maxPeriodsInput}
            onChange={(e) => setMaxPeriodsInput(e.target.value)}
            className="w-full rounded-lg border border-white/[0.1] bg-[#0A0A0D] px-3 py-2 font-[family-name:var(--font-mono)] text-sm font-semibold text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none"
          />
        </div>
      </div>

      {validationError ? (
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0A0A0D] p-3 text-xs text-zinc-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-[#93C5FD]" />
          <span>{validationError}</span>
        </div>
      ) : (
        <>
          <div className="mb-4 divide-y divide-white/[0.06] rounded-lg border border-white/[0.08] bg-[#0A0A0D]">
            {planRows.map((row) => (
              <div
                key={row.periods}
                className="flex items-center justify-between px-3.5 py-2.5 text-xs sm:text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-zinc-300">
                    {row.periods} {mode === 'weekly' ? 'สัปดาห์' : 'เดือน'}
                  </span>
                  {row.totalInterest === 0 && (
                    <span className="rounded bg-[#93C5FD]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#93C5FD]">
                      ฟรีดอก
                    </span>
                  )}
                </div>
                <span className="font-[family-name:var(--font-mono)] font-semibold tabular-nums text-[#F1F5F9]">
                  {row.amountPerPeriod.toLocaleString('en-US')}.- / งวด
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopyQuote}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#F1F5F9] py-2.5 text-xs font-semibold text-[#0A0A0D] transition-all hover:bg-white active:scale-[0.99] sm:text-sm"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                <span>คัดลอกรายการผ่อนแล้ว</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>คัดลอกยอดผ่อน</span>
              </>
            )}
          </button>
        </>
      )}
    </section>
  );
}