'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Plus,
  GripVertical,
  ArrowUp,
  ArrowDown,
  FolderOpen,
  Pin,
  Trash2,
  X,
  Upload,
  Edit2,
  Check,
  Loader2,
  Tags,
  CheckSquare,
  Square,
  Search,
  EyeOff,
} from 'lucide-react';
import { BannerCategory, BannerItem } from '@/types/database';
import { processImageToWebP } from '@/lib/image-processor';
import ModalPortal from '@/components/ModalPortal';

interface CategoryAdminRow extends BannerCategory {
  total_count: number;
  pinned_count: number;
}

interface BannerCategoryManagerProps {
  onCategoriesUpdated: (categories: BannerCategory[]) => void;
}

async function uploadLogoWebP(file: File): Promise<string> {
  const blob = await processImageToWebP(file, { quality: 0.9, maxWidth: 400 });
  const presignRes = await fetch('/api/admin/upload/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder: 'portfolio',
      filename: `logo-${Date.now()}.webp`,
      contentType: 'image/webp',
      size: blob.size,
    }),
  });
  const presign = await presignRes.json();
  if (!presignRes.ok) throw new Error(presign.error ?? 'ขอสิทธิ์อัปโหลดโลโก้ไม่สำเร็จ');

  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/webp' },
    body: blob,
  });
  if (!putRes.ok) throw new Error('อัปโหลดโลโก้ไม่สำเร็จ');
  return presign.publicUrl;
}

export default function BannerCategoryManager({
  onCategoriesUpdated,
}: BannerCategoryManagerProps) {
  const [rows, setRows] = useState<CategoryAdminRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLogoFile, setNewLogoFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<CategoryAdminRow | null>(
    null
  );
  const [categoryBanners, setCategoryBanners] = useState<BannerItem[]>([]);
  const [loadingBanners, setLoadingBanners] = useState(false);
  const [pinBusyId, setPinBusyId] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // ค้นหาและตัวกรองภายใน Modal
  const [modalSearch, setModalSearch] = useState('');
  const [modalFilter, setModalFilter] = useState<'ALL' | 'PINNED' | 'UNPINNED'>('ALL');

  // โหมดเลือกหลายรูปเพื่อแก้หมวดหมู่ทีเดียว (Bulk Select)
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedBannerIds, setSelectedBannerIds] = useState<string[]>([]);
  const [bulkTargetCategoryIds, setBulkTargetCategoryIds] = useState<string[]>([]);
  const [savingBulkCats, setSavingBulkCats] = useState(false);

  // แก้ไขหมวดหมู่ของรูปเดี่ยว
  const [editingBannerTagsId, setEditingBannerTagsId] = useState<string | null>(null);
  const [savingBannerCats, setSavingBannerCats] = useState(false);

  // แก้ไขข้อมูลหมวดหมู่
  const [editingMeta, setEditingMeta] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editHidePreview, setEditHidePreview] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/banner-categories');
      const data = await res.json();
      if (res.ok && data.categories) {
        setRows(data.categories);
        onCategoriesUpdated(data.categories);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      let logoUrl: string | null = null;
      if (newLogoFile) {
        logoUrl = await uploadLogoWebP(newLogoFile);
      }

      const res = await fetch('/api/admin/banner-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || null,
          logo_url: logoUrl,
        }),
      });

      if (res.ok) {
        setNewName('');
        setNewDesc('');
        setNewLogoFile(null);
        await loadCategories();
      }
    } finally {
      setCreating(false);
    }
  };

  const persistRowOrder = async (nextRows: CategoryAdminRow[]) => {
    setRows(nextRows);
    onCategoriesUpdated(nextRows);
    await fetch('/api/admin/banner-categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reorder',
        orderedIds: nextRows.map((r) => r.id),
      }),
    });
  };

  const moveRow = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const copy = [...rows];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    await persistRowOrder(copy);
  };

  const handleDropRow = async (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      return;
    }
    const copy = [...rows];
    const [moved] = copy.splice(dragIndex, 1);
    copy.splice(dropIndex, 0, moved);
    setDragIndex(null);
    await persistRowOrder(copy);
  };

  const refreshSelectedCategoryBanners = async (catId: string) => {
    const res = await fetch(
      `/api/admin/banners?categoryId=${encodeURIComponent(catId)}`
    );
    const data = await res.json();
    if (res.ok) {
      const updatedList = (data.banners ?? []) as BannerItem[];
      setCategoryBanners(updatedList);
      const pinnedCount = updatedList.filter((b) => b.is_pinned).length;
      setSelectedCategory((prev) =>
        prev
          ? { ...prev, total_count: updatedList.length, pinned_count: pinnedCount }
          : null
      );
    }
  };

  const openCategoryModal = async (cat: CategoryAdminRow) => {
    setSelectedCategory(cat);
    setEditingBannerTagsId(null);
    setMultiSelectMode(false);
    setSelectedBannerIds([]);
    setBulkTargetCategoryIds([]);
    setModalSearch('');
    setModalFilter('ALL');
    setEditingMeta(false);
    setEditName(cat.name);
    setEditDesc(cat.description ?? '');
    setEditLogoUrl(cat.logo_url ?? '');
    setEditHidePreview(Boolean(cat.hide_preview));
    setModalError(null);
    setLoadingBanners(true);

    try {
      await refreshSelectedCategoryBanners(cat.id);
    } finally {
      setLoadingBanners(false);
    }
  };

  const toggleBannerSelection = (bannerId: string) => {
    setSelectedBannerIds((prev) =>
      prev.includes(bannerId)
        ? prev.filter((id) => id !== bannerId)
        : [...prev, bannerId]
    );
  };

  const toggleBulkTargetCategory = (catId: string) => {
    setBulkTargetCategoryIds((prev) =>
      prev.includes(catId)
        ? prev.filter((id) => id !== catId)
        : [...prev, catId]
    );
  };

  const handleBulkCategoryApply = async (mode: 'add' | 'replace' | 'remove') => {
    if (!selectedCategory || selectedBannerIds.length === 0 || savingBulkCats) return;

    const targetIds =
      mode === 'remove' ? [selectedCategory.id] : bulkTargetCategoryIds;

    if ((mode === 'add' || mode === 'replace') && targetIds.length === 0) {
      setModalError('กรุณาเลือกหมวดหมู่ปลายทางอย่างน้อย 1 หมวดก่อนกดบันทึก');
      return;
    }

    setSavingBulkCats(true);
    setModalError(null);

    try {
      const res = await fetch('/api/admin/banners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_update_categories',
          bannerIds: selectedBannerIds,
          categoryIds: targetIds,
          mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error ?? 'อัปเดตหมวดหมู่หลายรูปไม่สำเร็จ');
        return;
      }

      setSelectedBannerIds([]);
      await Promise.all([
        refreshSelectedCategoryBanners(selectedCategory.id),
        loadCategories(),
      ]);
    } finally {
      setSavingBulkCats(false);
    }
  };

  const handleToggleBannerCategory = async (banner: BannerItem, targetCatId: string) => {
    if (!selectedCategory || savingBannerCats) return;
    const currentIds =
      Array.isArray(banner.category_ids) && banner.category_ids.length > 0
        ? banner.category_ids
        : banner.category_id
          ? [banner.category_id]
          : [];

    const nextIds = currentIds.includes(targetCatId)
      ? currentIds.filter((id) => id !== targetCatId)
      : [...currentIds, targetCatId];

    setSavingBannerCats(true);
    try {
      const res = await fetch('/api/admin/banners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_categories',
          bannerId: banner.id,
          categoryIds: nextIds,
        }),
      });
      if (res.ok) {
        setCategoryBanners((prev) =>
          prev
            .map((item) =>
              item.id === banner.id
                ? { ...item, category_ids: nextIds, category_id: nextIds[0] ?? null }
                : item
            )
            .filter((item) => item.category_ids.includes(selectedCategory.id))
        );
        await loadCategories();
      }
    } finally {
      setSavingBannerCats(false);
    }
  };

  const handleSaveMeta = async () => {
    if (!selectedCategory || !editName.trim()) return;
    setSavingMeta(true);
    try {
      const res = await fetch('/api/admin/banner-categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedCategory.id,
          name: editName.trim(),
          description: editDesc.trim() || null,
          logo_url: editLogoUrl || null,
          hide_preview: editHidePreview,
        }),
      });
      if (res.ok) {
        setSelectedCategory({
          ...selectedCategory,
          name: editName.trim(),
          description: editDesc.trim() || null,
          logo_url: editLogoUrl || null,
          hide_preview: editHidePreview,
        });
        setEditingMeta(false);
        await loadCategories();
      }
    } finally {
      setSavingMeta(false);
    }
  };

  const handleTogglePin = async (banner: BannerItem) => {
    if (!selectedCategory) return;
    setPinBusyId(banner.id);
    setModalError(null);

    try {
      const res = await fetch('/api/admin/banners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bannerId: banner.id,
          categoryId: selectedCategory.id,
          isPinned: !banner.is_pinned,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error ?? 'อัปเดตสถานะปักหมุดไม่สำเร็จ');
        return;
      }

      await Promise.all([
        refreshSelectedCategoryBanners(selectedCategory.id),
        loadCategories(),
      ]);
    } finally {
      setPinBusyId(null);
    }
  };

  const handleMovePinned = async (pinnedIndex: number, direction: -1 | 1) => {
    const pinnedList = categoryBanners.filter((b) => b.is_pinned);
    const unpinnedList = categoryBanners.filter((b) => !b.is_pinned);
    const target = pinnedIndex + direction;
    if (target < 0 || target >= pinnedList.length) return;

    const copy = [...pinnedList];
    const [moved] = copy.splice(pinnedIndex, 1);
    copy.splice(target, 0, moved);

    setCategoryBanners([...copy, ...unpinnedList]);

    await fetch('/api/admin/banners', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reorder_pinned',
        orderedBannerIds: copy.map((b) => b.id),
      }),
    });
  };

  const handleDeleteBanner = async (bannerId: string) => {
    if (!selectedCategory || !window.confirm('ยืนยันการลบรูปผลงานนี้?')) return;
    const res = await fetch(
      `/api/admin/banners?id=${encodeURIComponent(bannerId)}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      setCategoryBanners((prev) => prev.filter((b) => b.id !== bannerId));
      setSelectedBannerIds((prev) => prev.filter((id) => id !== bannerId));
      await loadCategories();
    }
  };

  const filteredModalBanners = useMemo(() => {
    const q = modalSearch.trim().toLowerCase();
    return categoryBanners.filter((b) => {
      if (modalFilter === 'PINNED' && !b.is_pinned) return false;
      if (modalFilter === 'UNPINNED' && b.is_pinned) return false;
      if (!q) return true;
      return (b.code ?? '').toLowerCase().includes(q);
    });
  }, [categoryBanners, modalSearch, modalFilter]);

  const pinnedList = filteredModalBanners.filter((b) => b.is_pinned);
  const unpinnedList = filteredModalBanners.filter((b) => !b.is_pinned);
  const totalPinnedInCat = categoryBanners.filter((b) => b.is_pinned).length;
  const editingBannerObj =
    categoryBanners.find((b) => b.id === editingBannerTagsId) ?? null;

  const allVisibleSelected =
    filteredModalBanners.length > 0 &&
    filteredModalBanners.every((b) => selectedBannerIds.includes(b.id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      const visibleSet = new Set(filteredModalBanners.map((b) => b.id));
      setSelectedBannerIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      const merged = new Set([
        ...selectedBannerIds,
        ...filteredModalBanners.map((b) => b.id),
      ]);
      setSelectedBannerIds(Array.from(merged));
    }
  };

  return (
    <div className="frost-card space-y-4 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-[#93C5FD]" />
        <h2 className="text-sm font-bold text-[#F1F5F9]">
          จัดการหมวดหมู่ & จัดเรียงลำดับ
        </h2>
      </div>

      <form
        onSubmit={handleCreateCategory}
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-12"
      >
        <input
          type="text"
          required
          placeholder="ชื่อหมวดหมู่ เช่น V1, V2, @TON TP7"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3.5 py-2 text-xs text-[#F1F5F9] placeholder:text-zinc-600 sm:col-span-4"
        />

        <input
          type="text"
          placeholder="คำอธิบายร้านค้า (ถ้ามี)"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          className="rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3.5 py-2 text-xs text-[#F1F5F9] placeholder:text-zinc-600 sm:col-span-4"
        />

        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#0D0F14] px-3 py-2 text-xs text-zinc-300 hover:border-white/25 sm:col-span-2">
          <Upload className="h-3.5 w-3.5 text-[#93C5FD]" />
          <span className="truncate">
            {newLogoFile ? newLogoFile.name : 'โลโก้ร้าน'}
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setNewLogoFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </label>

        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#F1F5F9] px-3 py-2 text-xs font-semibold text-[#090B10] hover:bg-white disabled:opacity-50 sm:col-span-2"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{creating ? 'กำลังเพิ่ม...' : 'เพิ่มหมวดหมู่'}</span>
        </button>
      </form>

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-[#0D0F14]" />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {rows.map((cat, idx) => (
            <div
              key={cat.id}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropRow(idx)}
              className={`flex items-center justify-between gap-2.5 rounded-xl border bg-[#0D0F14] p-3 transition-colors ${
                dragIndex === idx
                  ? 'border-[#93C5FD]'
                  : 'border-white/[0.08] hover:border-white/[0.18]'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-zinc-600" />

                <span className="shrink-0 rounded-lg border border-[#93C5FD]/30 bg-[#93C5FD]/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#93C5FD]">
                  แถว {idx + 1}
                </span>

                {cat.logo_url && (
                  <img
                    src={cat.logo_url}
                    alt={cat.name}
                    className="h-8 w-8 shrink-0 rounded-lg border border-white/[0.1] object-cover"
                  />
                )}

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-bold text-[#F1F5F9] sm:text-sm">
                      {cat.name}
                    </p>
                    {cat.hide_preview && (
                      <span className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                        <EyeOff className="h-2.5 w-2.5" />
                        <span>ซ่อนตัวอย่าง</span>
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-zinc-500">
                    {cat.description || 'ไม่มีคำอธิบาย'} • ปักหมุด{' '}
                    <span className="tabular-nums text-zinc-300">
                      {cat.pinned_count}/10
                    </span>{' '}
                    ({cat.total_count} รูป)
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveRow(idx, -1)}
                  title="เลื่อนขึ้น"
                  className="rounded-lg border border-white/[0.08] bg-[#141720] p-1.5 text-zinc-400 hover:text-white disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  disabled={idx === rows.length - 1}
                  onClick={() => moveRow(idx, 1)}
                  title="เลื่อนลง"
                  className="rounded-lg border border-white/[0.08] bg-[#141720] p-1.5 text-zinc-400 hover:text-white disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => openCategoryModal(cat)}
                  title="จัดการรูปและปักหมุด"
                  className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] bg-[#141720] px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:border-[#93C5FD]/50 hover:text-[#93C5FD]"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">จัดการรูป</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ModalPortal>
        {selectedCategory && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 px-3 pt-6 pb-12 sm:px-6 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.12] bg-[#12141C] p-4 sm:p-6 animate-modal-in">
              {/* หัว Modal */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-sm font-bold text-[#F1F5F9] sm:text-base">
                    หมวดหมู่: {selectedCategory.name}
                  </h3>
                  <span className="rounded-full bg-[#93C5FD]/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[#93C5FD]">
                    ปักหมุด {totalPinnedInCat}/10
                  </span>
                  <span className="rounded-full border border-white/[0.08] bg-[#0D0F14] px-2.5 py-0.5 text-xs tabular-nums text-zinc-400">
                    ทั้งหมด {categoryBanners.length} รูป
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !multiSelectMode;
                      setMultiSelectMode(next);
                      if (!next) {
                        setSelectedBannerIds([]);
                        setBulkTargetCategoryIds([]);
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      multiSelectMode
                        ? 'border-[#93C5FD] bg-[#93C5FD]/20 text-[#93C5FD]'
                        : 'border-white/[0.1] bg-[#0D0F14] text-zinc-200 hover:border-[#93C5FD]/40 hover:text-[#93C5FD]'
                    }`}
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    <span>
                      {multiSelectMode
                        ? `กำลังเลือก (${selectedBannerIds.length})`
                        : 'เลือกหลายรูป'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingMeta((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-xl border border-white/[0.1] bg-[#0D0F14] px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white"
                  >
                    <Edit2 className="h-3 w-3" />
                    <span>แก้ชื่อ/โลโก้</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className="rounded-xl p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* แถบค้นหาและตัวกรองภายใน Modal */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    placeholder="ค้นหารหัสงาน / ชื่อไฟล์..."
                    className="w-full rounded-xl border border-white/[0.09] bg-[#0D0F14] py-2 pl-8 pr-3 text-xs text-[#F1F5F9] placeholder:text-zinc-500 focus:border-[#93C5FD]/50 focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'ALL', label: 'ทั้งหมด' },
                      { id: 'PINNED', label: 'ปักหมุดแล้ว' },
                      { id: 'UNPINNED', label: 'ยังไม่ปักหมุด' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setModalFilter(f.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        modalFilter === f.id
                          ? 'border-[#93C5FD]/45 bg-[#93C5FD]/15 text-[#93C5FD]'
                          : 'border-white/[0.08] bg-[#0D0F14] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}

                  {multiSelectMode && filteredModalBanners.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleSelectAllVisible}
                      className="rounded-full border border-white/[0.12] bg-[#141720] px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-[#93C5FD]/50 hover:text-[#93C5FD]"
                    >
                      {allVisibleSelected
                        ? 'ยกเลิกเลือกทั้งหมด'
                        : `เลือกทั้งหมดที่แสดง (${filteredModalBanners.length})`}
                    </button>
                  )}
                </div>
              </div>

              {/* แผงแก้ไขหมวดหมู่ทีเดียวหลายรูป (Bulk Category Editor) */}
              {multiSelectMode && (
                <div className="mb-4 space-y-3 rounded-2xl border border-[#93C5FD]/40 bg-[#0D0F14] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#93C5FD]">
                      เลือกอยู่ {selectedBannerIds.length} รูป — แตะเลือกหมวดหมู่ที่ต้องการจัดการด้านล่าง
                    </span>
                    {selectedBannerIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedBannerIds([])}
                        className="text-xs text-zinc-400 hover:text-white"
                      >
                        ล้างที่เลือก
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {rows.map((cat) => {
                      const active = bulkTargetCategoryIds.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => toggleBulkTargetCategory(cat.id)}
                          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                            active
                              ? 'border-[#93C5FD] bg-[#93C5FD]/20 text-[#93C5FD]'
                              : 'border-white/[0.1] bg-[#141720] text-zinc-400 hover:text-white'
                          }`}
                        >
                          {active && <Check className="h-3 w-3" />}
                          <span>{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={
                        savingBulkCats ||
                        selectedBannerIds.length === 0 ||
                        bulkTargetCategoryIds.length === 0
                      }
                      onClick={() => handleBulkCategoryApply('add')}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#F1F5F9] px-4 py-1.5 text-xs font-semibold text-[#090B10] hover:bg-white disabled:opacity-40"
                    >
                      {savingBulkCats ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      <span>เพิ่มเข้าหมวดที่เลือก (คงหมวดเดิมไว้)</span>
                    </button>

                    <button
                      type="button"
                      disabled={
                        savingBulkCats ||
                        selectedBannerIds.length === 0 ||
                        bulkTargetCategoryIds.length === 0
                      }
                      onClick={() => handleBulkCategoryApply('replace')}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#93C5FD]/40 bg-[#93C5FD]/15 px-4 py-1.5 text-xs font-semibold text-[#93C5FD] hover:bg-[#93C5FD]/25 disabled:opacity-40"
                    >
                      <span>ย้ายไปหมวดที่เลือกเท่านั้น (เขียนทับหมวดเดิม)</span>
                    </button>

                    <button
                      type="button"
                      disabled={savingBulkCats || selectedBannerIds.length === 0}
                      onClick={() => handleBulkCategoryApply('remove')}
                      className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-40"
                    >
                      <span>เอาออกจากหมวด {selectedCategory.name}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* แผงเลือกหมวดหมู่ให้รูปเดี่ยว */}
              {!multiSelectMode && editingBannerObj && (
                <div className="mb-4 space-y-2.5 rounded-xl border border-[#93C5FD]/35 bg-[#0D0F14] p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#93C5FD]">
                      เลือกหมวดหมู่ให้รูปนี้ (ติ๊กได้หลายหมวดพร้อมกัน)
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingBannerTagsId(null)}
                      className="text-xs text-zinc-400 hover:text-white"
                    >
                      ปิด
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {rows.map((cat) => {
                      const active = (editingBannerObj.category_ids ?? []).includes(
                        cat.id
                      );
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          disabled={savingBannerCats}
                          onClick={() =>
                            handleToggleBannerCategory(editingBannerObj, cat.id)
                          }
                          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                            active
                              ? 'border-[#93C5FD] bg-[#93C5FD]/20 text-[#93C5FD]'
                              : 'border-white/[0.1] bg-[#141720] text-zinc-400 hover:text-white'
                          }`}
                        >
                          {active && <Check className="h-3 w-3" />}
                          <span>{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* แก้ชื่อ / โลโก้ / ซ่อนรูปตัวอย่างของหมวดหมู่ */}
              {editingMeta && (
                <div className="mb-4 space-y-2.5 rounded-xl border border-white/[0.08] bg-[#0D0F14] p-3.5">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="ชื่อหมวดหมู่"
                      className="rounded-lg border border-white/[0.1] bg-[#141720] px-3 py-1.5 text-xs text-[#F1F5F9] sm:col-span-4"
                    />
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="คำอธิบายร้านค้า"
                      className="rounded-lg border border-white/[0.1] bg-[#141720] px-3 py-1.5 text-xs text-[#F1F5F9] sm:col-span-4"
                    />
                    <label className="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-white/[0.1] bg-[#141720] px-2.5 py-1.5 text-xs text-zinc-300 sm:col-span-2">
                      <Upload className="h-3 w-3 text-[#93C5FD]" />
                      <span>เปลี่ยนโลโก้</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const url = await uploadLogoWebP(f);
                          setEditLogoUrl(url);
                        }}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={savingMeta}
                      onClick={handleSaveMeta}
                      className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#F1F5F9] px-3 py-1.5 text-xs font-semibold text-[#090B10] sm:col-span-2"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>บันทึก</span>
                    </button>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={editHidePreview}
                      onChange={(e) => setEditHidePreview(e.target.checked)}
                      className="h-4 w-4 rounded accent-[#93C5FD]"
                    />
                    <span>
                      ซ่อนรูปตัวอย่างบนหน้าหลัก `/banners` (แสดงเฉพาะแถบจำนวนและปุ่มดูทั้งหมด)
                    </span>
                  </label>
                </div>
              )}

              {modalError && (
                <p className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  {modalError}
                </p>
              )}

              {loadingBanners ? (
                <div className="flex items-center justify-center gap-2 py-12 text-xs text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin text-[#93C5FD]" />
                  <span>กำลังโหลดรายการรูป...</span>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* ส่วนที่ 1: รูปที่ปักหมุดหน้าแรก */}
                  {pinnedList.length > 0 && (
                    <div>
                      <h4 className="mb-2.5 text-xs font-semibold text-[#93C5FD]">
                        รูปปักหมุดหน้าแรก ({totalPinnedInCat}/10) — เรียงซ้ายไปขวา
                      </h4>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {pinnedList.map((b, pIdx) => {
                          const isSelected = selectedBannerIds.includes(b.id);
                          return (
                            <div
                              key={b.id}
                              onClick={() => {
                                if (multiSelectMode) toggleBannerSelection(b.id);
                              }}
                              className={`overflow-hidden rounded-xl border bg-[#0D0F14] transition-all ${
                                multiSelectMode ? 'cursor-pointer' : ''
                              } ${
                                isSelected
                                  ? 'border-[#93C5FD] ring-2 ring-[#93C5FD]/40'
                                  : 'border-[#93C5FD]/40'
                              }`}
                            >
                              <div className="relative aspect-[3/4]">
                                <img
                                  src={b.watermarked_url}
                                  alt={b.code ?? ''}
                                  className="h-full w-full object-cover"
                                />
                                <span className="absolute left-1.5 top-1.5 rounded bg-[#090B10]/85 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[#93C5FD]">
                                  #{pIdx + 1}
                                </span>

                                {multiSelectMode && (
                                  <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-[#090B10]/85 text-[#93C5FD]">
                                    {isSelected ? (
                                      <CheckSquare className="h-4 w-4" />
                                    ) : (
                                      <Square className="h-4 w-4 text-zinc-400" />
                                    )}
                                  </span>
                                )}
                              </div>

                              {!multiSelectMode && (
                                <div className="flex items-center justify-between gap-1 p-1.5">
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      disabled={pIdx === 0}
                                      onClick={() => handleMovePinned(pIdx, -1)}
                                      className="rounded bg-[#141720] p-1 text-zinc-400 hover:text-white disabled:opacity-30"
                                    >
                                      <ArrowUp className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={pIdx === pinnedList.length - 1}
                                      onClick={() => handleMovePinned(pIdx, 1)}
                                      className="rounded bg-[#141720] p-1 text-zinc-400 hover:text-white disabled:opacity-30"
                                    >
                                      <ArrowDown className="h-3 w-3" />
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => setEditingBannerTagsId(b.id)}
                                    title="จัดหมวดหมู่"
                                    className="rounded bg-[#141720] p-1 text-zinc-300 hover:text-[#93C5FD]"
                                  >
                                    <Tags className="h-3 w-3" />
                                  </button>

                                  <button
                                    type="button"
                                    disabled={pinBusyId === b.id}
                                    onClick={() => handleTogglePin(b)}
                                    className="inline-flex items-center gap-1 rounded bg-[#93C5FD]/20 px-2 py-1 text-[11px] font-medium text-[#93C5FD]"
                                  >
                                    <Pin className="h-3 w-3" />
                                    <span>ถอน</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ส่วนที่ 2: รูปอื่นๆ ในหมวดหมู่นี้ */}
                  <div>
                    <h4 className="mb-2.5 text-xs font-semibold text-zinc-300">
                      รูปอื่นๆ ในหมวดหมู่นี้ ({unpinnedList.length} รูป)
                    </h4>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      {unpinnedList.map((b) => {
                        const isSelected = selectedBannerIds.includes(b.id);
                        return (
                          <div
                            key={b.id}
                            onClick={() => {
                              if (multiSelectMode) toggleBannerSelection(b.id);
                            }}
                            className={`overflow-hidden rounded-xl border bg-[#0D0F14] transition-all ${
                              multiSelectMode ? 'cursor-pointer' : ''
                            } ${
                              isSelected
                                ? 'border-[#93C5FD] ring-2 ring-[#93C5FD]/40'
                                : 'border-white/[0.08]'
                            }`}
                          >
                            <div className="relative aspect-[3/4]">
                              <img
                                src={b.watermarked_url}
                                alt={b.code ?? ''}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                              {(b.category_ids?.length ?? 0) > 1 && !multiSelectMode && (
                                <span className="absolute right-1.5 top-1.5 rounded bg-[#090B10]/85 px-1.5 py-0.5 text-[10px] font-semibold text-[#93C5FD]">
                                  {b.category_ids.length} หมวด
                                </span>
                              )}

                              {multiSelectMode && (
                                <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-[#090B10]/85 text-[#93C5FD]">
                                  {isSelected ? (
                                    <CheckSquare className="h-4 w-4" />
                                  ) : (
                                    <Square className="h-4 w-4 text-zinc-400" />
                                  )}
                                </span>
                              )}
                            </div>

                            {!multiSelectMode && (
                              <div className="flex items-center justify-between gap-1 p-1.5">
                                <button
                                  type="button"
                                  disabled={
                                    pinBusyId === b.id || totalPinnedInCat >= 10
                                  }
                                  onClick={() => handleTogglePin(b)}
                                  className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-[#141720] py-1 text-[11px] font-medium text-zinc-300 hover:text-[#93C5FD] disabled:opacity-40"
                                >
                                  <Pin className="h-3 w-3" />
                                  <span>ปักหมุด</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setEditingBannerTagsId(b.id)}
                                  title="จัดหมวดหมู่"
                                  className="rounded bg-[#141720] p-1 text-zinc-300 hover:text-[#93C5FD]"
                                >
                                  <Tags className="h-3 w-3" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteBanner(b.id)}
                                  title="ลบรูป"
                                  className="rounded bg-[#141720] p-1 text-zinc-500 hover:text-red-400"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </ModalPortal>
    </div>
  );
}