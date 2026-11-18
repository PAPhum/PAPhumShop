'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  Send,
  X,
} from 'lucide-react';
import { AccountPublic, AccountSecretDecrypted } from '@/types/database';
import { generateTOTPCode, getTOTPSecondsRemaining } from '@/lib/totp';
import ModalPortal from '@/components/ModalPortal';

export interface AccountWithSecretRow extends AccountPublic {
  secret: AccountSecretDecrypted;
}

interface AccountsSecretTableProps {
  rows: AccountWithSecretRow[];
}

interface CopySections {
  garena: boolean;
  garenaAuth: boolean;
  gmail: boolean;
  gmailAuth: boolean;
  recovery: boolean;
}

const DEFAULT_SECTIONS: CopySections = {
  garena: true,
  garenaAuth: true,
  gmail: true,
  gmailAuth: true,
  recovery: true,
};

function buildCustomerHandoverText(
  row: AccountWithSecretRow,
  sections: CopySections
): string {
  const blocks: string[] = [`━━━ ข้อมูลไอดี ${row.code} ━━━`];
  const { secret } = row;

  if (sections.garena && (secret.username || secret.password)) {
    const lines = ['▸ Garena'];
    if (secret.username) lines.push(secret.username.trim());
    if (secret.password) lines.push(secret.password.trim());
    blocks.push(lines.join('\n'));
  }

  if (sections.garenaAuth && secret.authenticator) {
    blocks.push(['▸ Garena Authenticator', secret.authenticator.trim()].join('\n'));
  }

  if (sections.gmail && (secret.gmail || secret.gmail_password)) {
    const lines = ['▸ Gmail'];
    if (secret.gmail) lines.push(secret.gmail.trim());
    if (secret.gmail_password) lines.push(secret.gmail_password.trim());
    blocks.push(lines.join('\n'));
  }

  if (sections.gmailAuth && secret.gmail_authenticator) {
    blocks.push(
      ['▸ Gmail Authenticator', secret.gmail_authenticator.trim()].join('\n')
    );
  }

  if (sections.recovery && secret.gmail_recovery) {
    const codes = secret.gmail_recovery
      .split(/[\r\n,]+/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (codes.length > 0) {
      blocks.push(['▸ รหัสสำรอง (Backup Codes)', ...codes].join('\n'));
    }
  }

  blocks.push('━━━━━━━━━━━━━━━');
  return blocks.join('\n\n');
}

export default function AccountsSecretTable({ rows }: AccountsSecretTableProps) {
  const [totpMap, setTotpMap] = useState<
    Record<string, { garenaOtp: string | null; gmailOtp: string | null }>
  >({});
  const [secondsLeft, setSecondsLeft] = useState<number>(30);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [shareTarget, setShareTarget] = useState<AccountWithSecretRow | null>(
    null
  );
  const [sections, setSections] = useState<CopySections>(DEFAULT_SECTIONS);
  const [copiedBundle, setCopiedBundle] = useState(false);

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

  const openShareModal = (row: AccountWithSecretRow) => {
    setShareTarget(row);
    setSections({
      garena: Boolean(row.secret.username || row.secret.password),
      garenaAuth: Boolean(row.secret.authenticator),
      gmail: Boolean(row.secret.gmail || row.secret.gmail_password),
      gmailAuth: Boolean(row.secret.gmail_authenticator),
      recovery: Boolean(row.secret.gmail_recovery),
    });
    setCopiedBundle(false);
  };

  const formattedBundleText = useMemo(() => {
    if (!shareTarget) return '';
    return buildCustomerHandoverText(shareTarget, sections);
  }, [shareTarget, sections]);

  const handleCopyBundle = async () => {
    if (!formattedBundleText) return;
    await navigator.clipboard.writeText(formattedBundleText);
    setCopiedBundle(true);
    setTimeout(() => setCopiedBundle(false), 2000);
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
    <>
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
                <th className="whitespace-nowrap px-3.5 py-3">
                  Gmail 2FA / กู้ 8 หลัก
                </th>
                <th className="whitespace-nowrap px-3.5 py-3">
                  ข้อมูลผูก / หมายเหตุ
                </th>
                <th className="whitespace-nowrap px-3.5 py-3 text-right">
                  ส่งมอบลูกค้า
                </th>
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
                        <CopyChip
                          id={`${row.id}-g-user`}
                          value={row.secret.username}
                        />
                      </div>
                      <div>
                        <CopyChip
                          id={`${row.id}-g-pass`}
                          value={row.secret.password}
                        />
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-3.5 py-3">
                      {otps?.garenaOtp ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(`${row.id}-g-otp`, otps.garenaOtp!)
                          }
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
                        <CopyChip
                          id={`${row.id}-m-user`}
                          value={row.secret.gmail}
                        />
                      </div>
                      <div>
                        <CopyChip
                          id={`${row.id}-m-pass`}
                          value={row.secret.gmail_password}
                        />
                      </div>
                    </td>

                    <td className="space-y-1.5 px-3.5 py-3">
                      {otps?.gmailOtp && (
                        <div>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(`${row.id}-m-otp`, otps.gmailOtp!)
                            }
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
                      <p className="text-zinc-300">
                        {row.tags.join(', ') || '-'}
                      </p>
                      {row.secret.private_notes && (
                        <p className="mt-1 text-[11px] text-zinc-500">
                          {row.secret.private_notes}
                        </p>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-3.5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openShareModal(row)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#93C5FD]/35 bg-[#93C5FD]/12 px-3 py-1.5 text-xs font-semibold text-[#93C5FD] transition-all active:scale-95 hover:border-[#93C5FD] hover:bg-[#93C5FD]/20"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>คัดลอกข้อมูล</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal เลือกหัวข้อข้อมูลที่จะคัดลอกส่งให้ลูกค้า */}
      <ModalPortal>
        {shareTarget && (
          <div
            onClick={() => setShareTarget(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-panel-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="frost-card w-full max-w-md space-y-4 rounded-2xl border border-white/[0.12] bg-[#12141C] p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#F1F5F9]">
                    คัดลอกข้อมูลส่งลูกค้า ({shareTarget.code})
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    ติ๊กเลือกเฉพาะหัวข้อที่ต้องการส่งให้ลูกค้า
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShareTarget(null)}
                  aria-label="ปิดหน้าต่าง"
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* รายการ Checkbox เลือกหัวข้อ */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    {
                      key: 'garena',
                      label: 'Garena',
                      hasData: Boolean(
                        shareTarget.secret.username ||
                          shareTarget.secret.password
                      ),
                    },
                    {
                      key: 'garenaAuth',
                      label: 'Garena Authenticator',
                      hasData: Boolean(shareTarget.secret.authenticator),
                    },
                    {
                      key: 'gmail',
                      label: 'Gmail',
                      hasData: Boolean(
                        shareTarget.secret.gmail ||
                          shareTarget.secret.gmail_password
                      ),
                    },
                    {
                      key: 'gmailAuth',
                      label: 'Gmail Authenticator',
                      hasData: Boolean(shareTarget.secret.gmail_authenticator),
                    },
                    {
                      key: 'recovery',
                      label: 'รหัสสำรอง',
                      hasData: Boolean(shareTarget.secret.gmail_recovery),
                    },
                  ] as const
                ).map((item) => (
                  <label
                    key={item.key}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                      !item.hasData
                        ? 'cursor-not-allowed border-white/[0.05] bg-[#0A0A0D]/50 text-zinc-600'
                        : sections[item.key]
                          ? 'border-[#93C5FD]/40 bg-[#93C5FD]/10 text-[#F1F5F9]'
                          : 'border-white/[0.08] bg-[#0D0F14] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!item.hasData}
                      checked={item.hasData && sections[item.key]}
                      onChange={(e) =>
                        setSections((prev) => ({
                          ...prev,
                          [item.key]: e.target.checked,
                        }))
                      }
                      className="h-3.5 w-3.5 rounded border-white/20 accent-[#93C5FD]"
                    />
                    <span className="truncate">{item.label}</span>
                  </label>
                ))}
              </div>

              {/* กล่องตัวอย่างข้อความที่จะถูกคัดลอก */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-zinc-400">
                  ตัวอย่างข้อความที่จะคัดลอก:
                </p>
                <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/[0.08] bg-[#090B10] p-3.5 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-zinc-200">
                  {formattedBundleText}
                </pre>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShareTarget(null)}
                  className="flex-1 rounded-xl border border-white/[0.1] bg-[#0D0F14] py-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:text-white"
                >
                  ปิด
                </button>
                <button
                  type="button"
                  onClick={handleCopyBundle}
                  className="inline-flex flex-[2] items-center justify-center gap-1.5 rounded-xl bg-[#F1F5F9] py-2.5 text-xs font-semibold text-[#090B10] transition-all active:scale-95 hover:bg-white"
                >
                  {copiedBundle ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>คัดลอกข้อความแล้ว</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>คัดลอกส่งลูกค้า</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </ModalPortal>
    </>
  );
}