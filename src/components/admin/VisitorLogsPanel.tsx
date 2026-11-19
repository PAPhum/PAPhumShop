'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Trash2,
  Smartphone,
  Tablet,
  Monitor,
  ChevronLeft,
  ChevronRight,
  Globe,
} from 'lucide-react';

interface VisitorLogItem {
  id: string;
  visited_at: string;
  ip_address: string;
  location: string | null;
  device_type: 'Mobile' | 'Tablet' | 'Desktop' | 'Bot';
  device_model: string;
  os_name: string;
  browser_name: string;
  path: string;
  referrer: string | null;
}

interface VisitorStats {
  today: number;
  last7Days: number;
  total30Days: number;
}

function formatThaiDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function DeviceIcon({ type }: { type: VisitorLogItem['device_type'] }) {
  if (type === 'Mobile') return <Smartphone className="h-3.5 w-3.5 text-[#93C5FD]" />;
  if (type === 'Tablet') return <Tablet className="h-3.5 w-3.5 text-sky-300" />;
  return <Monitor className="h-3.5 w-3.5 text-zinc-300" />;
}

export default function VisitorLogsPanel() {
  const [stats, setStats] = useState<VisitorStats>({
    today: 0,
    last7Days: 0,
    total30Days: 0,
  });
  const [logs, setLogs] = useState<VisitorLogItem[]>([]);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const fetchLogs = useCallback(async (targetPage: number, q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
      });
      if (q) params.set('q', q);

      const res = await fetch(`/api/admin/visitor-logs?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      setStats(data.stats ?? { today: 0, last7Days: 0, total30Days: 0 });
      setLogs(data.logs ?? []);
      setTotalFiltered(data.totalFiltered ?? 0);
      setPageSize(data.pageSize ?? 25);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(page, activeQuery);
  }, [page, activeQuery, fetchLogs]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setActiveQuery(searchInput.trim());
  };

  const handleClearAll = async () => {
    if (!window.confirm('ล้างประวัติผู้เข้าชมทั้งหมดออกจากระบบ?')) return;
    setClearing(true);
    try {
      const res = await fetch('/api/admin/visitor-logs', { method: 'DELETE' });
      if (res.ok) {
        setPage(1);
        setActiveQuery('');
        setSearchInput('');
        await fetchLogs(1, '');
      }
    } finally {
      setClearing(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  return (
    <div className="space-y-4">
      {/* การ์ดสรุปยอดผู้เข้าชม */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="frost-card rounded-2xl p-3.5">
          <p className="text-[11px] text-zinc-400">เข้าชมวันนี้ (เวลาไทย)</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-[#93C5FD]">
            {stats.today.toLocaleString('en-US')} คน
          </p>
        </div>
        <div className="frost-card rounded-2xl p-3.5">
          <p className="text-[11px] text-zinc-400">7 วันล่าสุด</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-[#F1F5F9]">
            {stats.last7Days.toLocaleString('en-US')} คน
          </p>
        </div>
        <div className="frost-card rounded-2xl p-3.5">
          <p className="text-[11px] text-zinc-400">สะสม (30 วัน)</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-zinc-300">
            {stats.total30Days.toLocaleString('en-US')} คน
          </p>
        </div>
      </div>

      {/* แถบค้นหาและปุ่มจัดการ */}
      <div className="frost-card flex flex-wrap items-center justify-between gap-2.5 rounded-2xl p-3.5">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2 min-w-[220px]">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ค้นหา IP, iPhone, Android, หน้าที่เข้า..."
              className="w-full rounded-xl border border-white/[0.09] bg-[#0D0F14] py-2 pl-9 pr-3 text-xs text-[#F1F5F9] placeholder:text-zinc-500 focus:border-[#93C5FD]/50 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-[#93C5FD]/40 hover:text-[#93C5FD]"
          >
            ค้นหา
          </button>
        </form>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchLogs(page, activeQuery)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3 py-2 text-xs font-semibold text-zinc-300 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>รีเฟรช</span>
          </button>

          <button
            type="button"
            onClick={handleClearAll}
            disabled={clearing || stats.total30Days === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3 py-2 text-xs font-semibold text-zinc-400 hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>ล้าง Log</span>
          </button>
        </div>
      </div>

      {/* ตารางรายการ Log */}
      <div className="frost-card overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.08] bg-[#0D0F14]/80 text-[11px] font-semibold text-zinc-400">
              <tr>
                <th className="whitespace-nowrap px-3.5 py-3">เวลาไทย</th>
                <th className="whitespace-nowrap px-3.5 py-3">IP / พื้นที่</th>
                <th className="whitespace-nowrap px-3.5 py-3">เครื่อง / รุ่น / แอป</th>
                <th className="whitespace-nowrap px-3.5 py-3">หน้าที่เข้า</th>
                <th className="whitespace-nowrap px-3.5 py-3">มาจาก</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                    กำลังโหลดข้อมูลผู้เข้าชม...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                    ยังไม่มีรายการผู้เข้าชม
                  </td>
                </tr>
              ) : (
                logs.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="whitespace-nowrap px-3.5 py-2.5 tabular-nums text-zinc-300">
                      {formatThaiDateTime(row.visited_at)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">
                      <div className="font-mono text-xs font-medium text-[#F1F5F9]">
                        {row.ip_address}
                      </div>
                      {row.location && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-400">
                          <Globe className="h-3 w-3 text-zinc-500" />
                          <span>{row.location}</span>
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5 font-medium text-[#F1F5F9]">
                        <DeviceIcon type={row.device_type} />
                        <span>{row.device_model}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-400">
                        {row.os_name} · {row.browser_name}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-xs text-[#93C5FD]">
                      {row.path}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-zinc-400">
                      {row.referrer ?? 'เข้าตรง'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* แถบเปลี่ยนหน้า */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/[0.08] px-3.5 py-2.5 text-xs text-zinc-400">
            <span className="tabular-nums">
              หน้า {page} / {totalPages} (ทั้งหมด {totalFiltered} รายการ)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-white/[0.1] bg-[#0D0F14] p-1.5 text-zinc-300 hover:text-white disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-white/[0.1] bg-[#0D0F14] p-1.5 text-zinc-300 hover:text-white disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}