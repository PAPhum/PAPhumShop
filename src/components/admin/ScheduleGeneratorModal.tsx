'use client';

import { useState, useMemo } from 'react';
import { Calendar, Copy, Check, X } from 'lucide-react';
import {
  InstallmentMode,
  WEEKLY_INTEREST_RATE,
  MONTHLY_INTEREST_RATE,
  generatePaymentSchedule,
  formatAdminScheduleText,
  getDefaultInstallmentMode,
} from '@/lib/installment';
import ModalPortal from '@/components/ModalPortal';

interface ScheduleGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
  initialPrice?: number;
  initialMode?: InstallmentMode;
  initialDownWeekly?: number;
  initialDownMonthly?: number;
  initialFreeWeeks?: number;
  initialFreeMonths?: number;
  weeklyRate?: number;
  monthlyRate?: number;
}

export default function ScheduleGeneratorModal({
  isOpen,
  onClose,
  initialCode = 'PM0001',
  initialPrice = 3290,
  initialMode,
  initialDownWeekly = 1000,
  initialDownMonthly = 2000,
  initialFreeWeeks = 2,
  initialFreeMonths = 1,
  weeklyRate = WEEKLY_INTEREST_RATE,
  monthlyRate = MONTHLY_INTEREST_RATE,
}: ScheduleGeneratorModalProps) {
  const todayISO = new Date().toISOString().slice(0, 10);

  const resolvedInitialMode: InstallmentMode =
    initialMode ?? getDefaultInstallmentMode(initialPrice);
  const initialIsMonthly = resolvedInitialMode === 'monthly';

  const [mode, setMode] = useState<InstallmentMode>(resolvedInitialMode);
  const [code, setCode] = useState(initialCode);
  const [price, setPrice] = useState(String(initialPrice));
  const [downPayment, setDownPayment] = useState(
    String(initialIsMonthly ? initialDownMonthly : initialDownWeekly)
  );
  const [freePeriods, setFreePeriods] = useState(
    String(initialIsMonthly ? initialFreeMonths : initialFreeWeeks)
  );
  const [periods, setPeriods] = useState('4');
  const [startDateISO, setStartDateISO] = useState(todayISO);
  const [copied, setCopied] = useState(false);

  const handleModeSwitch = (nextMode: InstallmentMode) => {
    setMode(nextMode);
    setDownPayment(
      String(nextMode === 'weekly' ? initialDownWeekly : initialDownMonthly)
    );
    setFreePeriods(
      String(nextMode === 'weekly' ? initialFreeWeeks : initialFreeMonths)
    );
  };

  const previewText = useMemo(() => {
    try {
      const schedule = generatePaymentSchedule({
        code,
        price: Number(price) || 0,
        downPayment: Number(downPayment) || 0,
        minDownPayment: 0,
        mode,
        periods: Math.max(1, Number(periods) || 1),
        interestFreePeriods: Math.max(0, Number(freePeriods) || 0),
        weeklyRate,
        monthlyRate,
        startDateISO,
      });
      return formatAdminScheduleText(schedule);
    } catch (err) {
      return err instanceof Error ? err.message : 'ข้อมูลไม่ถูกต้อง';
    }
  }, [
    code,
    price,
    downPayment,
    mode,
    periods,
    freePeriods,
    weeklyRate,
    monthlyRate,
    startDateISO,
  ]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(previewText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 px-3 py-6 sm:px-6 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#111216] p-4 sm:p-5 shadow-2xl animate-modal-in">
          <div className="mb-4 flex items-center justify-between border-b border-white/[0.08] pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#93C5FD]" />
              <h2 className="text-sm font-semibold text-[#F1F5F9]">
                สร้างตารางวันเปิดสัญญาและนัดชำระ
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* แถบสลับโหมดพร้อมแถบเลื่อนสมูท */}
          <div className="relative mb-4 grid grid-cols-2 rounded-lg border border-white/[0.08] bg-[#0A0A0D] p-1">
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-md bg-[#F1F5F9] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                mode === 'monthly' ? 'translate-x-full' : 'translate-x-0'
              }`}
            />

            <button
              type="button"
              onClick={() => handleModeSwitch('weekly')}
              className={`relative z-10 rounded-md py-2 text-xs font-semibold transition-colors ${
                mode === 'weekly'
                  ? 'text-[#0A0A0D]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              รายสัปดาห์ ({weeklyRate}฿/งวด)
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('monthly')}
              className={`relative z-10 rounded-md py-2 text-xs font-semibold transition-colors ${
                mode === 'monthly'
                  ? 'text-[#0A0A0D]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              รายเดือน ({monthlyRate}฿/งวด)
            </button>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">รหัสไอดี</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0A0D] px-3 py-2 font-[family-name:var(--font-mono)] text-sm text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">ราคาไอดี</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0A0D] px-3 py-2 font-[family-name:var(--font-mono)] text-sm text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">เงินดาวน์</label>
              <input
                type="number"
                value={downPayment}
                onChange={(e) => setDownPayment(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0A0D] px-3 py-2 font-[family-name:var(--font-mono)] text-sm text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                ปลอดดอก ({mode === 'weekly' ? 'สัปดาห์' : 'เดือน'})
              </label>
              <input
                type="number"
                value={freePeriods}
                onChange={(e) => setFreePeriods(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0A0D] px-3 py-2 font-[family-name:var(--font-mono)] text-sm text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">จำนวนงวด</label>
              <input
                type="number"
                min={1}
                value={periods}
                onChange={(e) => setPeriods(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0A0D] px-3 py-2 font-[family-name:var(--font-mono)] text-sm text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">วันเริ่มสัญญา</label>
              <input
                type="date"
                value={startDateISO}
                onChange={(e) => setStartDateISO(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0A0D] px-3 py-2 font-[family-name:var(--font-mono)] text-xs text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none"
              />
            </div>
          </div>

          <pre className="mb-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-white/[0.08] bg-[#0A0A0D] p-3.5 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-[#93C5FD]">
            {previewText}
          </pre>

          <button
            type="button"
            onClick={handleCopy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#F1F5F9] py-2.5 text-xs font-semibold text-[#0A0A0D] transition-colors hover:bg-white sm:text-sm"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                <span>คัดลอกตารางนัดชำระแล้ว</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>คัดลอกตารางส่งให้ลูกค้า</span>
              </>
            )}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}