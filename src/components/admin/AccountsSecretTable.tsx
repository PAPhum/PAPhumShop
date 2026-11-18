'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, RefreshCw, ShieldCheck } from 'lucide-react';
import { AccountPublic, AccountSecretDecrypted } from '@/types/database';
import { generateTOTPCode, getTOTPSecondsRemaining } from '@/lib/totp';

export interface AccountWithSecretRow extends AccountPublic {
  secret: AccountSecretDecrypted;
}

interface AccountsSecretTableProps {
  rows: AccountWithSecretRow[];
}

export default function AccountsSecretTable({ rows }: AccountsSecretTableProps) {
  const [totpMap, setTotpMap] = useState<
    Record<string, { garenaOtp: string | null; gmailOtp: string | null }>
  >({});
  const [secondsLeft, setSecondsLeft] = useState<number>(30);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const refreshCodes = async () => {
      const nextMap: Record<
        string,
        { garenaOtp: string | null; gmailOtp: string | null }
      > = {};

      for (const item of rows) {
        const garenaOtp = item.secret.authenticator
          ? await generateTOTPCode(item.secret.authenticator)
          : null;
        const gmailOtp = item.secret.gmail_authenticator
          ? await generateTOTPCode(item.secret.gmail_authenticator)
          : null;
        nextMap[item.id] = { garenaOtp, gmailOtp };
      }

      if (active) {
        setTotpMap(nextMap);
        setSecondsLeft(getTOTPSecondsRemaining());
      }
    };

    refreshCodes();
    const timer = setInterval(() => {
      setSecondsLeft(getTOTPSecondsRemaining());
      refreshCodes();
    }, 1000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [rows]);

  const handleCopy = async (key: string, text: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const CopyChip = ({
    id,
    value,
    mono = true,
  }: {
    id: string;
    value: string;
    mono?: boolean;
  }) => {
    if (!value) return <span className="text-zinc-600">-</span>;
    return (
      <button
        type="button"
        onClick={() => handleCopy(id, value)}
        className={`inline-flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#0A0A0D] px-2 py-1 text-left text-xs text-zinc-200 transition-colors hover:border-[#93C5FD]/50 hover:text-white ${
          mono ? 'font-[family-name:var(--font-mono)]' : ''
        }`}
      >
        <span className="max-w-[160px] truncate">{value}</span>
        {copiedKey === id ? (
          <Check className="h-3 w-3 shrink-0 text-[#93C5FD]" />
        ) : (
          <Copy className="h-3 w-3 shrink-0 text-zinc-500" />
        )}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#111216] px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2 text-zinc-300">
          <ShieldCheck className="h-4 w-4 text-[#93C5FD]" />
          <span>ตารางข้อมูลลับและรหัส 2FA สด ({rows.length} รายการ)</span>
        </div>
        <div className="flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[#93C5FD]">
          <RefreshCw className="h-3 w-3" />
          <span>รีเฟรชใน {secondsLeft}s</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#111216]">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-white/[0.08] bg-[#0A0A0D] text-[11px] font-semibold text-zinc-400">
              <th className="whitespace-nowrap px-3.5 py-3">รหัส / สถานะ</th>
              <th className="whitespace-nowrap px-3.5 py-3">ราคา / ทุน</th>
              <th className="whitespace-nowrap px-3.5 py-3">Garena Login</th>
              <th className="whitespace-nowrap px-3.5 py-3">Garena 2FA</th>
              <th className="whitespace-nowrap px-3.5 py-3">Gmail Login</th>
              <th className="whitespace-nowrap px-3.5 py-3">Gmail 2FA / กู้ 8 หลัก</th>
              <th className="whitespace-nowrap px-3.5 py-3">ข้อมูลผูก / หมายเหตุ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {rows.map((row) => {
              const otps = totpMap[row.id];
              return (
                <tr key={row.id} className="align-top hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-3.5 py-3">
                    <span className="block font-[family-name:var(--font-mono)] font-bold text-[#F1F5F9]">
                      {row.code}
                    </span>
                    <span className="mt-0.5 inline-block rounded bg-white/[0.06] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-zinc-300">
                      {row.status}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-3.5 py-3 font-[family-name:var(--font-mono)]">
                    <span className="block font-semibold text-[#93C5FD]">
                      {row.price.toLocaleString('en-US')}.-
                    </span>
                    <span className="block text-[11px] text-zinc-500">
                      ทุน {row.secret.cost.toLocaleString('en-US')}.-
                    </span>
                  </td>

                  <td className="space-y-1.5 px-3.5 py-3">
                    <div>
                      <CopyChip id={`${row.id}-g-user`} value={row.secret.username} />
                    </div>
                    <div>
                      <CopyChip id={`${row.id}-g-pass`} value={row.secret.password} />
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-3.5 py-3">
                    {otps?.garenaOtp ? (
                      <button
                        type="button"
                        onClick={() => handleCopy(`${row.id}-g-otp`, otps.garenaOtp!)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#93C5FD]/30 bg-[#93C5FD]/10 px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-sm font-bold tracking-wider text-[#93C5FD] hover:bg-[#93C5FD]/20"
                      >
                        <span>{otps.garenaOtp}</span>
                        {copiedKey === `${row.id}-g-otp` ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : (
                      <span className="text-zinc-600">-</span>
                    )}
                  </td>

                  <td className="space-y-1.5 px-3.5 py-3">
                    <div>
                      <CopyChip id={`${row.id}-m-user`} value={row.secret.gmail} />
                    </div>
                    <div>
                      <CopyChip id={`${row.id}-m-pass`} value={row.secret.gmail_password} />
                    </div>
                  </td>

                  <td className="space-y-1.5 px-3.5 py-3">
                    {otps?.gmailOtp && (
                      <div>
                        <button
                          type="button"
                          onClick={() => handleCopy(`${row.id}-m-otp`, otps.gmailOtp!)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#93C5FD]/30 bg-[#93C5FD]/10 px-2.5 py-1 font-[family-name:var(--font-mono)] text-sm font-bold tracking-wider text-[#93C5FD] hover:bg-[#93C5FD]/20"
                        >
                          <span>{otps.gmailOtp}</span>
                          {copiedKey === `${row.id}-m-otp` ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                    {row.secret.gmail_recovery && (
                      <div>
                        <CopyChip
                          id={`${row.id}-m-rec`}
                          value={row.secret.gmail_recovery}
                        />
                      </div>
                    )}
                    {!otps?.gmailOtp && !row.secret.gmail_recovery && (
                      <span className="text-zinc-600">-</span>
                    )}
                  </td>

                  <td className="max-w-[200px] px-3.5 py-3 text-zinc-400">
                    <p className="text-zinc-300">{row.tags.join(', ') || '-'}</p>
                    {row.secret.private_notes && (
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {row.secret.private_notes}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}