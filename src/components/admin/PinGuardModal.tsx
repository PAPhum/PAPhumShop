'use client';

import { useState, useRef } from 'react';
import { Lock, ShieldCheck, X } from 'lucide-react';

interface PinGuardModalProps {
  isOpen: boolean;
  hasPin: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PinGuardModal({
  isOpen,
  hasPin,
  onClose,
  onSuccess,
}: PinGuardModalProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  if (!isOpen) return null;

  const verifyOrSetupPin = async (targetPin: string, targetConfirm: string) => {
    if (submittingRef.current) return;
    setError(null);

    if (!/^\d{6}$/.test(targetPin)) {
      setError('กรอกตัวเลขให้ครบ 6 หลัก');
      return;
    }

    if (!hasPin && targetPin !== targetConfirm) {
      setError('รหัส PIN ไม่ตรงกัน');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: hasPin ? 'verify' : 'setup',
          pin: targetPin,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'รหัส PIN ไม่ถูกต้อง');
        setPin('');
        return;
      }

      setPin('');
      setConfirmPin('');
      onSuccess();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handlePinChange = (rawValue: string) => {
    const cleaned = rawValue.replace(/\D/g, '').slice(0, 6);
    setPin(cleaned);
    if (error) setError(null);

    if (hasPin && cleaned.length === 6) {
      void verifyOrSetupPin(cleaned, '');
    }
  };

  const handleConfirmPinChange = (rawValue: string) => {
    const cleaned = rawValue.replace(/\D/g, '').slice(0, 6);
    setConfirmPin(cleaned);
    if (error) setError(null);

    if (!hasPin && pin.length === 6 && cleaned.length === 6) {
      void verifyOrSetupPin(pin, cleaned);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await verifyOrSetupPin(pin, confirmPin);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 px-4 pt-12 pb-12 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-xl border border-white/[0.1] bg-[#111216] p-5 animate-modal-in">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-white/[0.07] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-[#0A0A0D] text-[#93C5FD]">
              {hasPin ? <Lock className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#F1F5F9]">
                {hasPin ? 'ใส่รหัส PIN' : 'ตั้งรหัส PIN 6 หลัก'}
              </h2>
              <p className="text-xs text-zinc-400">
                {hasPin
                  ? 'กรอกรหัส 6 หลักเพื่อดูข้อมูลบัญชี'
                  : 'ใช้สำหรับล็อกรหัสผ่านและโค้ด 2FA'}
              </p>
            </div>
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

        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">
              รหัส PIN
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              name="paphum-pin-entry"
              maxLength={6}
              autoFocus
              disabled={submitting}
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              placeholder="••••••"
              style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
              className="w-full rounded-lg border border-white/[0.1] bg-[#0A0A0D] px-4 py-3 text-center font-[family-name:var(--font-mono)] text-xl tracking-[0.5em] text-[#F1F5F9] placeholder:text-zinc-600 focus:border-[#93C5FD]/60 focus:outline-none disabled:opacity-60"
            />
          </div>

          {!hasPin && (
            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                ยืนยันรหัสอีกครั้ง
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                name="paphum-pin-confirm"
                maxLength={6}
                disabled={submitting}
                value={confirmPin}
                onChange={(e) => handleConfirmPinChange(e.target.value)}
                placeholder="••••••"
                style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0A0D] px-4 py-3 text-center font-[family-name:var(--font-mono)] text-xl tracking-[0.5em] text-[#F1F5F9] placeholder:text-zinc-600 focus:border-[#93C5FD]/60 focus:outline-none disabled:opacity-60"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#F1F5F9] py-2.5 text-xs font-semibold text-[#0A0A0D] transition-colors hover:bg-white disabled:opacity-50 sm:text-sm"
          >
            {submitting
              ? 'กำลังตรวจสอบ...'
              : hasPin
                ? 'ปลดล็อก'
                : 'บันทึก PIN'}
          </button>
        </form>
      </div>
    </div>
  );
}