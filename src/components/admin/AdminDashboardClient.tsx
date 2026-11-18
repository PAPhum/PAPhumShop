'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Lock,
  Unlock,
  LogOut,
  RefreshCw,
  LayoutGrid,
  Table2,
  Image as ImageIcon,
  Sliders,
  Edit3,
  Trash2,
  CalendarClock,
  Check,
  Loader2,
} from 'lucide-react';
import {
  AccountPublic,
  AccountSecretDecrypted,
  AccountStatus,
  AdminRole,
  BannerCategory,
  InstallmentSettings,
} from '@/types/database';
import { resolveInstallmentRates } from '@/lib/installment-config';
import AccountFormModal from './AccountFormModal';
import AccountsSecretTable, {
  AccountWithSecretRow,
} from './AccountsSecretTable';
import BannerCategoryManager from './BannerCategoryManager';
import BannerBulkUploader from './BannerBulkUploader';
import PinGuardModal from './PinGuardModal';
import ScheduleGeneratorModal from './ScheduleGeneratorModal';

interface AdminDashboardClientProps {
  username: string;
  role: AdminRole;
  initialAccounts: AccountPublic[];
  initialCategories: BannerCategory[];
  initialSettings: InstallmentSettings;
  initialPinUnlocked: boolean;
  initialHasPin: boolean;
}

type AdminTab = 'accounts' | 'banners' | 'settings';
type AccountViewMode = 'cards' | 'secret_table';

const STATUS_BADGE_STYLES: Record<AccountStatus, string> = {
  Unavailable: 'border-zinc-700/80 bg-zinc-800/80 text-zinc-300',
  Available: 'border-[#93C5FD]/35 bg-[#93C5FD]/15 text-[#93C5FD]',
  Installment: 'border-amber-500/35 bg-amber-500/15 text-amber-300',
  SoldOut: 'border-red-500/35 bg-red-500/15 text-red-300',
};

const EMPTY_SECRET: AccountSecretDecrypted = {
  cost: 0,
  game_uid: '',
  login_provider: 'Garena',
  username: '',
  password: '',
  authenticator: '',
  gmail: '',
  gmail_password: '',
  gmail_authenticator: '',
  gmail_recovery: '',
  private_notes: '',
};

export default function AdminDashboardClient({
  username,
  role,
  initialAccounts,
  initialCategories,
  initialSettings,
  initialPinUnlocked,
  initialHasPin,
}: AdminDashboardClientProps) {
  const router = useRouter();
  const isOwner = role === 'owner';

  const [activeTab, setActiveTab] = useState<AdminTab>(
    isOwner ? 'accounts' : 'banners'
  );
  const [accounts, setAccounts] = useState<AccountPublic[]>(initialAccounts);
  const [categories, setCategories] =
    useState<BannerCategory[]>(initialCategories);
  const [settings, setSettings] =
    useState<InstallmentSettings>(initialSettings);

  useEffect(() => {
    setAccounts(initialAccounts);
  }, [initialAccounts]);

  const resolvedRates = useMemo(
    () => resolveInstallmentRates(settings),
    [settings]
  );

  const [pinUnlocked, setPinUnlocked] = useState<boolean>(initialPinUnlocked);
  const [pinConfigured, setPinConfigured] = useState<boolean>(initialHasPin);
  const [pinModalOpen, setPinModalOpen] = useState<boolean>(false);

  const [statusFilter, setStatusFilter] = useState<'ALL' | AccountStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<AccountViewMode>('cards');

  const [secretMap, setSecretMap] = useState<
    Record<string, AccountSecretDecrypted>
  >({});
  const [loadingSecretsTable, setLoadingSecretsTable] =
    useState<boolean>(false);

  const [formModalOpen, setFormModalOpen] = useState<boolean>(false);
  const [editingAccount, setEditingAccount] = useState<AccountPublic | null>(
    null
  );
  const [scheduleAccount, setScheduleAccount] = useState<AccountPublic | null>(
    null
  );

  const [syncingSheet, setSyncingSheet] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [settingsSaved, setSettingsSaved] = useState<boolean>(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return accounts.filter((acc) => {
      if (statusFilter !== 'ALL' && acc.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const inCode = acc.code.toLowerCase().includes(q);
      const inTags = acc.tags.some((t) => t.toLowerCase().includes(q));
      const inDesc = (acc.description ?? '').toLowerCase().includes(q);
      return inCode || inTags || inDesc;
    });
  }, [accounts, statusFilter, searchQuery]);

  useEffect(() => {
    if (viewMode !== 'secret_table' || !pinUnlocked || !isOwner) return;

    let cancelled = false;
    const missing = accounts.filter((acc) => !secretMap[acc.id]);
    if (missing.length === 0) return;

    setLoadingSecretsTable(true);
    Promise.all(
      missing.map(async (acc) => {
        const res = await fetch(`/api/admin/accounts/${acc.id}`);
        if (!res.ok) return null;
        const data = await res.json();
        return { id: acc.id, secret: data.secret as AccountSecretDecrypted };
      })
    )
      .then((results) => {
        if (cancelled) return;
        setSecretMap((prev) => {
          const next = { ...prev };
          for (const item of results) {
            if (item?.secret) {
              next[item.id] = item.secret;
            }
          }
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingSecretsTable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode, pinUnlocked, isOwner, accounts, secretMap]);

  const secretTableRows: AccountWithSecretRow[] = useMemo(() => {
    return filteredAccounts.map((acc) => ({
      ...acc,
      secret: secretMap[acc.id] ?? EMPTY_SECRET,
    }));
  }, [filteredAccounts, secretMap]);

  const statusCounts = useMemo(() => {
    const counts: Record<'ALL' | AccountStatus, number> = {
      ALL: accounts.length,
      Unavailable: 0,
      Available: 0,
      Installment: 0,
      SoldOut: 0,
    };
    for (const acc of accounts) {
      counts[acc.status] = (counts[acc.status] ?? 0) + 1;
    }
    return counts;
  }, [accounts]);

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => null);
    setPinUnlocked(false);
    setSecretMap({});
    router.replace('/admin');
    router.refresh();
  };

  const handleLockPin = async () => {
    await fetch('/api/admin/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'lock' }),
    }).catch(() => null);
    setPinUnlocked(false);
    setSecretMap({});
    setViewMode('cards');
  };

  const requirePinAction = (callback: () => void) => {
    if (!pinUnlocked) {
      setPinModalOpen(true);
      return;
    }
    callback();
  };

  const handleQuickStatusChange = async (
    accountId: string,
    nextStatus: AccountStatus
  ) => {
    if (
      (nextStatus === 'Installment' || nextStatus === 'SoldOut') &&
      !pinUnlocked
    ) {
      setPinModalOpen(true);
      return;
    }

    const previous = accounts;
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, status: nextStatus } : a))
    );

    const res = await fetch(`/api/admin/accounts/${accountId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quickStatusOnly: true, status: nextStatus }),
    });

    if (!res.ok) {
      setAccounts(previous);
      if (res.status === 403) {
        setPinUnlocked(false);
        setPinModalOpen(true);
      }
    }
  };

  const handleDeleteAccount = async (acc: AccountPublic) => {
    if (!pinUnlocked) {
      setPinModalOpen(true);
      return;
    }
    if (!window.confirm(`ลบไอดี ${acc.code} ออกจากรายการ?`)) {
      return;
    }

    const res = await fetch(`/api/admin/accounts/${acc.id}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      setAccounts((prev) => prev.filter((item) => item.id !== acc.id));
    }
  };

  const handleSyncAllSheets = async () => {
    if (!pinUnlocked) {
      setPinModalOpen(true);
      return;
    }
    setSyncingSheet(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_all' }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSyncMessage(
          `อัปเดต ${data.count ?? accounts.length} ไอดีลง Sheet เรียบร้อย`
        );
      } else {
        setSyncMessage(data.error ?? 'อัปเดตลง Sheet ไม่สำเร็จ');
      }
    } finally {
      setSyncingSheet(false);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSaved(false);
    setSettingsError(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekly_interest_rate: settings.weekly_interest_rate,
          monthly_interest_rate: settings.monthly_interest_rate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSettingsError(data.error ?? 'บันทึกค่าเริ่มต้นไม่สำเร็จ');
        return;
      }
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-5 animate-panel-in">
      {/* แถบหัวข้อหลังบ้าน */}
      <div className="frost-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <img
            src="/me.jpg"
            alt="PAPhum"
            className="h-10 w-10 rounded-xl border border-[#93C5FD]/35 object-cover object-top"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-[#F1F5F9]">
                หลังบ้าน PAPhum
              </h1>
              <span className="rounded-full border border-white/[0.1] bg-[#0D0F14] px-2.5 py-0.5 text-xs font-medium text-zinc-300">
                {username}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              {isOwner ? 'จัดการไอดีและงานตัดรูป' : 'อัปโหลดงานตัดรูปและจัดหมวดหมู่'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isOwner && (
            <>
              {pinUnlocked ? (
                <button
                  type="button"
                  onClick={handleLockPin}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#93C5FD]/30 bg-[#93C5FD]/12 px-3.5 py-2 text-xs font-semibold text-[#93C5FD] transition-colors active:scale-95 hover:bg-[#93C5FD]/20"
                >
                  <Unlock className="h-3.5 w-3.5" />
                  <span>ปลดล็อก PIN อยู่</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPinModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/12 px-3.5 py-2 text-xs font-semibold text-amber-300 transition-colors active:scale-95 hover:bg-amber-500/20"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>{pinConfigured ? 'ใส่ PIN' : 'ตั้ง PIN'}</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3.5 py-2 text-xs font-semibold text-zinc-300 transition-colors active:scale-95 hover:border-red-500/40 hover:text-red-400"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>ออก</span>
          </button>
        </div>
      </div>

      {/* แถบเลือกเมนูหลัก */}
      <div className="flex flex-wrap items-center gap-2">
        {isOwner && (
          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all active:scale-95 ${
              activeTab === 'accounts'
                ? 'bg-[#F1F5F9] text-[#090B10] shadow-sm'
                : 'border border-white/[0.09] bg-[#12141C] text-zinc-300 hover:text-white'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>ไอดี ({accounts.length})</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('banners')}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all active:scale-95 ${
            activeTab === 'banners'
              ? 'bg-[#F1F5F9] text-[#090B10] shadow-sm'
              : 'border border-white/[0.09] bg-[#12141C] text-zinc-300 hover:text-white'
          }`}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          <span>ตัดรูป / ส่งงาน</span>
        </button>

        {isOwner && (
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all active:scale-95 ${
              activeTab === 'settings'
                ? 'bg-[#F1F5F9] text-[#090B10] shadow-sm'
                : 'border border-white/[0.09] bg-[#12141C] text-zinc-300 hover:text-white'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>ตั้งค่าผ่อน</span>
          </button>
        )}
      </div>

      {/* แท็บที่ 1: จัดการไอดีเกม */}
      {isOwner && activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="frost-card space-y-3 rounded-2xl p-3.5 sm:p-4">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหารหัสไอดี เช่น PM0204..."
                  className="w-full rounded-xl border border-white/[0.09] bg-[#0D0F14] py-2.5 pl-10 pr-4 text-xs text-[#F1F5F9] placeholder:text-zinc-500 focus:border-[#93C5FD]/50 focus:outline-none sm:text-sm"
                />
              </div>

              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <div className="inline-flex rounded-xl border border-white/[0.09] bg-[#0D0F14] p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      viewMode === 'cards'
                        ? 'bg-[#F1F5F9] text-[#090B10]'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>การ์ด</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      requirePinAction(() => setViewMode('secret_table'))
                    }
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      viewMode === 'secret_table'
                        ? 'bg-[#F1F5F9] text-[#090B10]'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Table2 className="h-3.5 w-3.5" />
                    <span>รหัส & 2FA</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={syncingSheet}
                  onClick={handleSyncAllSheets}
                  title="ซิงค์ข้อมูลทั้งหมดลง Google Sheet"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3 py-2 text-xs font-semibold text-zinc-200 active:scale-95 hover:border-[#93C5FD]/40 hover:text-[#93C5FD] disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${syncingSheet ? 'animate-spin' : ''}`}
                  />
                  <span className="hidden md:inline">Sync Sheet</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    requirePinAction(() => {
                      setEditingAccount(null);
                      setFormModalOpen(true);
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#F1F5F9] px-3.5 py-2 text-xs font-semibold text-[#090B10] active:scale-95 hover:bg-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>เพิ่มไอดี</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              {(
                ['ALL', 'Unavailable', 'Available', 'Installment', 'SoldOut'] as const
              ).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors active:scale-95 ${
                    statusFilter === st
                      ? 'border-[#93C5FD]/45 bg-[#93C5FD]/15 text-[#93C5FD]'
                      : 'border-white/[0.07] bg-[#0D0F14] text-zinc-400 hover:text-white'
                  }`}
                >
                  {st === 'ALL' ? 'ทั้งหมด' : st} ({statusCounts[st]})
                </button>
              ))}
            </div>
          </div>

          {syncMessage && (
            <div className="rounded-xl border border-[#93C5FD]/30 bg-[#93C5FD]/10 px-3.5 py-2.5 text-xs font-medium text-[#93C5FD]">
              {syncMessage}
            </div>
          )}

          {viewMode === 'secret_table' && pinUnlocked ? (
            loadingSecretsTable ? (
              <div className="frost-card flex items-center justify-center gap-2 rounded-2xl py-12 text-xs text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin text-[#93C5FD]" />
                <span>กำลังโหลดข้อมูล...</span>
              </div>
            ) : (
              <AccountsSecretTable rows={secretTableRows} />
            )
          ) : filteredAccounts.length === 0 ? (
            <div className="frost-card flex flex-col items-center justify-center rounded-2xl py-14 text-center">
              <p className="text-sm font-medium text-zinc-300">
                ยังไม่มีรายการไอดีในหมวดนี้
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                กดปุ่ม &ldquo;เพิ่มไอดี&rdquo; ด้านบนเพื่อเริ่มลงขายไอดีแรก
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="frost-card flex flex-col justify-between rounded-2xl p-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold tabular-nums text-[#F1F5F9]">
                        {acc.code}
                      </span>

                      <select
                        value={acc.status}
                        onChange={(e) =>
                          handleQuickStatusChange(
                            acc.id,
                            e.target.value as AccountStatus
                          )
                        }
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold focus:outline-none ${
                          STATUS_BADGE_STYLES[acc.status]
                        }`}
                      >
                        <option
                          value="Unavailable"
                          className="bg-[#12141C] text-zinc-300"
                        >
                          Unavailable
                        </option>
                        <option
                          value="Available"
                          className="bg-[#12141C] text-[#93C5FD]"
                        >
                          Available
                        </option>
                        <option
                          value="Installment"
                          className="bg-[#12141C] text-amber-300"
                        >
                          Installment
                        </option>
                        <option
                          value="SoldOut"
                          className="bg-[#12141C] text-red-300"
                        >
                          SoldOut
                        </option>
                      </select>
                    </div>

                    {acc.main_image_url ? (
                      <div className="aspect-video overflow-hidden rounded-xl border border-white/[0.07] bg-[#0D0F14]">
                        <img
                          src={acc.main_image_url}
                          alt={acc.code}
                          className="h-full w-full object-cover object-top"
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-white/[0.09] bg-[#0D0F14] text-xs text-zinc-500">
                        ยังไม่มีรูปป้าย
                      </div>
                    )}

                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-zinc-400">ราคา</span>
                      <span className="text-lg font-bold tabular-nums text-[#F1F5F9]">
                        {acc.price > 0
                          ? `${acc.price.toLocaleString('en-US')}.-`
                          : 'ยังไม่ตั้งราคา'}
                      </span>
                    </div>

                    {acc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {acc.tags.map((tag, i) => (
                          <span
                            key={`${acc.id}-tag-${i}`}
                            className="rounded-lg border border-white/[0.08] bg-[#0D0F14] px-2.5 py-0.5 text-[11px] text-zinc-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-2 border-t border-white/[0.07] pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        requirePinAction(() => {
                          setEditingAccount(acc);
                          setFormModalOpen(true);
                        })
                      }
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#0D0F14] py-2 text-xs font-semibold text-zinc-200 active:scale-95 hover:border-[#93C5FD]/40 hover:text-[#93C5FD]"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>แก้ไข / ดูรหัส</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setScheduleAccount(acc)}
                      title="สร้างตารางผ่อน"
                      className="rounded-xl border border-white/[0.1] bg-[#0D0F14] p-2 text-zinc-300 active:scale-95 hover:border-[#93C5FD]/40 hover:text-[#93C5FD]"
                    >
                      <CalendarClock className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteAccount(acc)}
                      title="ลบไอดี"
                      className="rounded-xl border border-white/[0.1] bg-[#0D0F14] p-2 text-zinc-500 active:scale-95 hover:border-red-500/40 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* แท็บที่ 2: ตัดรูป / ส่งงาน */}
      {activeTab === 'banners' && (
        <div className="space-y-6">
          <BannerCategoryManager
            onCategoriesUpdated={(updated) => setCategories(updated)}
          />

          <BannerBulkUploader
            categories={categories}
            onCategoryCreated={(newCat) =>
              setCategories((prev) => [...prev, newCat])
            }
          />
        </div>
      )}

      {/* แท็บที่ 3: ตั้งค่าเริ่มต้นการผ่อน */}
      {isOwner && activeTab === 'settings' && (
        <form
          onSubmit={handleSaveSettings}
          className="frost-card max-w-2xl space-y-4 rounded-2xl p-5"
        >
          <h2 className="text-sm font-bold text-[#F1F5F9]">
            ค่าเริ่มต้นการผ่อน
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                ดอกเบี้ยรายสัปดาห์ (บาท/สัปดาห์)
              </label>
              <input
                type="number"
                value={settings.weekly_interest_rate}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    weekly_interest_rate: Number(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3.5 py-2.5 text-sm tabular-nums text-[#F1F5F9]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                ดอกเบี้ยรายเดือน (บาท/เดือน)
              </label>
              <input
                type="number"
                value={settings.monthly_interest_rate}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    monthly_interest_rate: Number(e.target.value),
                  })
                }
                className="w-full rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3.5 py-2.5 text-sm tabular-nums text-[#F1F5F9]"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={savingSettings}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#F1F5F9] px-5 py-2.5 text-xs font-semibold text-[#090B10] active:scale-95 hover:bg-white disabled:opacity-50"
            >
              {savingSettings ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              <span>บันทึก</span>
            </button>

            {settingsSaved && (
              <span className="text-xs font-medium text-[#93C5FD]">
                บันทึกแล้ว
              </span>
            )}

            {settingsError && (
              <span className="text-xs font-medium text-red-300">
                {settingsError}
              </span>
            )}
          </div>
        </form>
      )}

      {/* Modal ใส่ PIN */}
      <PinGuardModal
        isOpen={pinModalOpen}
        hasPin={pinConfigured}
        onClose={() => setPinModalOpen(false)}
        onSuccess={() => {
          setPinUnlocked(true);
          setPinConfigured(true);
          setPinModalOpen(false);
        }}
      />

      {/* Modal เพิ่ม / แก้ไขข้อมูลไอดี */}
      {formModalOpen && (
        <AccountFormModal
          isOpen={formModalOpen}
          editingAccount={editingAccount}
          defaultSettings={settings}
          onClose={() => {
            setFormModalOpen(false);
            setEditingAccount(null);
          }}
          onSaved={() => {
            setFormModalOpen(false);
            setEditingAccount(null);
            setSecretMap({});
            router.refresh();
          }}
        />
      )}

      {/* Modal สร้างตารางผ่อน */}
      {scheduleAccount && (
        <ScheduleGeneratorModal
          isOpen={true}
          initialCode={scheduleAccount.code}
          initialPrice={scheduleAccount.price}
          initialDownWeekly={scheduleAccount.min_down_weekly}
          initialDownMonthly={scheduleAccount.min_down_monthly}
          initialFreeWeeks={scheduleAccount.interest_free_weeks}
          initialFreeMonths={scheduleAccount.interest_free_months}
          weeklyRate={resolvedRates.weeklyRate}
          monthlyRate={resolvedRates.monthlyRate}
          onClose={() => setScheduleAccount(null)}
        />
      )}
    </div>
  );
}