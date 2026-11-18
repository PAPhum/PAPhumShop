'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  Snowflake,
  SlidersHorizontal,
  X,
  ArrowUpRight,
} from 'lucide-react';
import { AccountPublic } from '@/types/database';

interface AccountCatalogClientProps {
  accounts?: AccountPublic[];
  initialAccounts?: AccountPublic[];
}

type PublicStatusFilter = 'ALL' | 'Available' | 'Installment' | 'SoldOut';

const STATUS_BADGE: Record<
  Exclude<PublicStatusFilter, 'ALL'>,
  { label: string; className: string }
> = {
  Available: {
    label: 'พร้อมขาย',
    className: 'border-[#93C5FD]/40 bg-[#090B10]/85 text-[#93C5FD]',
  },
  Installment: {
    label: 'ติดผ่อน',
    className: 'border-amber-500/40 bg-[#090B10]/85 text-amber-300',
  },
  SoldOut: {
    label: 'ขายแล้ว',
    className: 'border-red-500/40 bg-[#090B10]/85 text-red-300',
  },
};

export default function AccountCatalogClient({
  accounts,
  initialAccounts,
}: AccountCatalogClientProps) {
  const sourceAccounts = useMemo(
    () => accounts ?? initialAccounts ?? [],
    [accounts, initialAccounts]
  );

  const [statusFilter, setStatusFilter] = useState<PublicStatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const visibleAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const priceCap = Number(maxPrice);

    return sourceAccounts
      .filter((acc) => acc.status !== 'Unavailable')
      .filter((acc) => {
        if (statusFilter !== 'ALL' && acc.status !== statusFilter) {
          return false;
        }
        if (priceCap > 0 && acc.price > priceCap) {
          return false;
        }
        if (!q) return true;
        const inCode = acc.code.toLowerCase().includes(q);
        const inTags = (acc.tags ?? []).some((t) =>
          t.toLowerCase().includes(q)
        );
        const inDesc = (acc.description ?? '').toLowerCase().includes(q);
        return inCode || inTags || inDesc;
      });
  }, [sourceAccounts, statusFilter, searchQuery, maxPrice]);

  const counts = useMemo(() => {
    const publicList = sourceAccounts.filter(
      (acc) => acc.status !== 'Unavailable'
    );
    return {
      ALL: publicList.length,
      Available: publicList.filter((a) => a.status === 'Available').length,
      Installment: publicList.filter((a) => a.status === 'Installment').length,
      SoldOut: publicList.filter((a) => a.status === 'SoldOut').length,
    };
  }, [sourceAccounts]);

  return (
    <div className="space-y-4 animate-panel-in">
      {/* แถบค้นหาและตัวกรอง */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหารหัสไอดี เช่น PM0204 หรือสกินที่สนใจ..."
              className="w-full rounded-2xl border border-white/[0.09] bg-[#12141C]/90 py-2.5 pl-10 pr-9 text-xs text-[#F1F5F9] placeholder:text-zinc-500 focus:border-[#93C5FD]/50 focus:outline-none sm:py-3 sm:text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="ล้างคำค้นหา"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex h-[42px] shrink-0 items-center gap-1.5 rounded-2xl border px-3 text-xs font-semibold transition-colors active:scale-95 sm:h-[46px] sm:px-3.5 ${
              showFilters || maxPrice
                ? 'border-[#93C5FD]/45 bg-[#93C5FD]/15 text-[#93C5FD]'
                : 'border-white/[0.09] bg-[#12141C]/90 text-zinc-300 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">งบประมาณ</span>
          </button>
        </div>

        {showFilters && (
          <div className="frost-card flex flex-wrap items-center gap-2 rounded-2xl p-3">
            <span className="text-xs font-medium text-zinc-400">
              ราคาไม่เกิน (บาท):
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="เช่น 3000"
              className="w-32 rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3 py-1.5 text-xs tabular-nums text-[#F1F5F9] placeholder:text-zinc-600 focus:border-[#93C5FD]/50 focus:outline-none"
            />
            {[1000, 3000, 5000, 10000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setMaxPrice(String(preset))}
                className="rounded-full border border-white/[0.08] bg-[#0D0F14] px-2.5 py-1 text-xs tabular-nums text-zinc-300 active:scale-95 hover:border-[#93C5FD]/40 hover:text-[#93C5FD]"
              >
                ≤ {preset.toLocaleString('en-US')}
              </button>
            ))}
            {maxPrice && (
              <button
                type="button"
                onClick={() => setMaxPrice('')}
                className="text-xs text-zinc-400 underline hover:text-white"
              >
                ล้าง
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {(
            [
              { key: 'ALL', label: 'ทั้งหมด' },
              { key: 'Available', label: 'พร้อมขาย' },
              { key: 'Installment', label: 'ติดผ่อน' },
              { key: 'SoldOut', label: 'ขายแล้ว' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums transition-all active:scale-95 sm:px-3.5 ${
                statusFilter === tab.key
                  ? 'border-[#F1F5F9] bg-[#F1F5F9] text-[#090B10]'
                  : 'border-white/[0.08] bg-[#12141C]/90 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label} ({counts[tab.key]})
            </button>
          ))}
        </div>
      </div>

      {/* รายการไอดีเกม (มือถือ 2 คอลัมน์ / จอใหญ่ 3-4 คอลัมน์) */}
      {visibleAccounts.length === 0 ? (
        <div className="frost-card flex flex-col items-center justify-center rounded-2xl py-20 text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#93C5FD]/25 bg-[#93C5FD]/10 text-[#93C5FD]">
            <Snowflake className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium text-zinc-300">
            ไม่พบไอดีที่ตรงกับเงื่อนไข
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            ลองเปลี่ยนตัวกรองสถานะหรือล้างคำค้นหาดูอีกครั้ง
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {visibleAccounts.map((acc) => {
            const badge =
              STATUS_BADGE[acc.status as Exclude<PublicStatusFilter, 'ALL'>] ??
              STATUS_BADGE.Available;

            const isMonthly = acc.price > 5000;
            const lowestDown = isMonthly
              ? acc.min_down_monthly
              : acc.min_down_weekly;

            return (
              <Link
                key={acc.id}
                href={`/id/${encodeURIComponent(acc.code)}`}
                className="frost-card-interactive group flex flex-col justify-between overflow-hidden rounded-2xl"
              >
                <div>
                  {/* รูปป้ายแนวตั้งเหมือนหน้าตัดรูป ชิดบน */}
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#0D0F14]">
                    {acc.main_image_url ? (
                      <img
                        src={acc.main_image_url}
                        alt={acc.code}
                        loading="lazy"
                        className="h-full w-full object-cover object-top transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-zinc-600">
                        ไม่มีรูปป้าย
                      </div>
                    )}

                    <span className="absolute top-2 left-2 rounded-md border border-white/15 bg-[#090B10]/85 px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#F1F5F9] sm:top-2.5 sm:left-2.5 sm:text-xs">
                      {acc.code}
                    </span>

                    <span
                      className={`absolute top-2 right-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:top-2.5 sm:right-2.5 sm:text-[11px] ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* ราคา & แท็ก */}
                  <div className="space-y-2 p-2.5 sm:space-y-2.5 sm:p-3.5">
                    <div className="flex items-baseline justify-between gap-1">
                      <div>
                        <p className="text-[10px] text-zinc-400 sm:text-[11px]">
                          ราคา
                        </p>
                        <p className="text-base font-bold tabular-nums text-[#F1F5F9] sm:text-lg">
                          {acc.price.toLocaleString('en-US')}.-
                        </p>
                      </div>

                      {acc.status === 'Available' && lowestDown > 0 && (
                        <div className="text-right">
                          <p className="text-[10px] text-zinc-400 sm:text-[11px]">
                            ดาวน์เริ่ม
                          </p>
                          <p className="text-xs font-semibold tabular-nums text-[#93C5FD] sm:text-sm">
                            {lowestDown.toLocaleString('en-US')}.-
                          </p>
                        </div>
                      )}
                    </div>

                    {(acc.tags ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {acc.tags.slice(0, 3).map((tag, idx) => (
                          <span
                            key={`${acc.id}-tag-${idx}`}
                            className="rounded-md border border-white/[0.08] bg-[#0D0F14]/90 px-1.5 py-0.5 text-[10px] text-zinc-300 sm:px-2 sm:text-[11px]"
                          >
                            {tag}
                          </span>
                        ))}
                        {acc.tags.length > 3 && (
                          <span className="rounded-md border border-white/[0.08] bg-[#0D0F14]/90 px-1.5 py-0.5 text-[10px] text-zinc-400 sm:px-2 sm:text-[11px]">
                            +{acc.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ปุ่ม "เพิ่มเติม" */}
                <div className="px-2.5 pb-2.5 sm:px-3.5 sm:pb-3.5">
                  <div className="flex w-full items-center justify-center gap-1 rounded-xl border border-white/[0.1] bg-[#0D0F14] py-2 text-xs font-semibold text-[#F1F5F9] transition-colors group-hover:border-[#93C5FD]/45 group-hover:bg-[#93C5FD]/15 group-hover:text-[#93C5FD]">
                    <span>เพิ่มเติม</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}