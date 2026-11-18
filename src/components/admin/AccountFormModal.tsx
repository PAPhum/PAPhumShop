'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Calendar,
  Phone,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import {
  AccountPublic,
  AccountSecretDecrypted,
  AccountStatus,
  InstallmentSettings,
} from '@/types/database';
import { processImageToWebP } from '@/lib/image-processor';
import {
  MONTHLY_DEFAULT_PRICE_THRESHOLD,
  getDefaultInstallmentMode,
} from '@/lib/installment';
import ModalPortal from '@/components/ModalPortal';

interface AccountFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingAccount: AccountPublic | null;
  defaultSettings: InstallmentSettings;
}

type PhoneBindState = 'พร้อมเปลี่ยน' | 'รอเปลี่ยน';
type MailBindState = 'พร้อมยก' | 'รอยก' | 'พร้อมเปลี่ยน' | 'รอเปลี่ยน';
type BoolBindState = 'ไม่ติด' | 'ติด';

function splitDayMonth(rawDate: string): { day: string; month: string } {
  const cleaned = rawDate.trim();
  if (!cleaned) return { day: '', month: '' };
  if (cleaned.includes('/')) {
    const [d = '', m = ''] = cleaned.split('/');
    return {
      day: d.replace(/\D/g, '').slice(0, 2),
      month: m.replace(/\D/g, '').slice(0, 2),
    };
  }
  const digits = cleaned.replace(/\D/g, '');
  return {
    day: digits.slice(0, 2),
    month: digits.slice(2, 4),
  };
}

function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseBindingTags(tags: string[]) {
  let phoneState: PhoneBindState = 'พร้อมเปลี่ยน';
  let phoneDay = '';
  let phoneMonth = '';
  let mailState: MailBindState = 'พร้อมยก';
  let mailDay = '';
  let mailMonth = '';
  let fbState: BoolBindState = 'ไม่ติด';
  let cardState: BoolBindState = 'ไม่ติด';
  const extraTags: string[] = [];

  for (const raw of tags) {
    const t = raw.trim();
    if (t.startsWith('เบอร์รอเปลี่ยน')) {
      phoneState = 'รอเปลี่ยน';
      const dm = splitDayMonth(t.replace('เบอร์รอเปลี่ยน', '').trim());
      phoneDay = dm.day;
      phoneMonth = dm.month;
    } else if (t === 'เบอร์พร้อมเปลี่ยน') {
      phoneState = 'พร้อมเปลี่ยน';
    } else if (t.startsWith('เมลรอยก')) {
      mailState = 'รอยก';
      const dm = splitDayMonth(t.replace('เมลรอยก', '').trim());
      mailDay = dm.day;
      mailMonth = dm.month;
    } else if (t.startsWith('เมลรอเปลี่ยน')) {
      mailState = 'รอเปลี่ยน';
      const dm = splitDayMonth(t.replace('เมลรอเปลี่ยน', '').trim());
      mailDay = dm.day;
      mailMonth = dm.month;
    } else if (t === 'เมลพร้อมยก' || t === 'เมลยก') {
      mailState = 'พร้อมยก';
    } else if (t === 'เมลพร้อมเปลี่ยน') {
      mailState = 'พร้อมเปลี่ยน';
    } else if (t === 'ติดเฟส') {
      fbState = 'ติด';
    } else if (t === 'ไม่ติดเฟส' || t === 'ไม่ติดเฟสบุ๊ค') {
      fbState = 'ไม่ติด';
    } else if (t === 'ติดบัตร') {
      cardState = 'ติด';
    } else if (t === 'ไม่ติดบัตร') {
      cardState = 'ไม่ติด';
    } else if (t) {
      extraTags.push(t);
    }
  }

  return {
    phoneState,
    phoneDay,
    phoneMonth,
    mailState,
    mailDay,
    mailMonth,
    fbState,
    cardState,
    extraTagsText: extraTags.join(', '),
  };
}

async function uploadWebPToR2(file: File): Promise<string> {
  const webpBlob = await processImageToWebP(file, { quality: 0.9, maxWidth: 1800 });

  const presignRes = await fetch('/api/admin/upload/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder: 'accounts',
      filename: `${file.name.replace(/\.[^.]+$/, '')}.webp`,
      contentType: 'image/webp',
      size: webpBlob.size,
    }),
  });

  const presignData = await presignRes.json().catch(() => ({}));
  if (!presignRes.ok || !presignData.uploadUrl) {
    throw new Error(presignData.error ?? `ขอสิทธิ์อัปโหลดไม่สำเร็จ (${presignRes.status})`);
  }

  const uploadRes = await fetch(presignData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/webp' },
    body: webpBlob,
  });

  if (!uploadRes.ok) {
    throw new Error(`อัปโหลดไฟล์ขึ้น Cloudflare R2 ไม่สำเร็จ (${uploadRes.status})`);
  }

  return presignData.publicUrl;
}

export default function AccountFormModal({
  isOpen,
  onClose,
  onSaved,
  editingAccount,
  defaultSettings,
}: AccountFormModalProps) {
  const [loadingSecret, setLoadingSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  const [uploadingMain, setUploadingMain] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const [showPasswords, setShowPasswords] = useState(false);
  const [copiedRecovery, setCopiedRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneMonthInputRef = useRef<HTMLInputElement | null>(null);
  const mailMonthInputRef = useRef<HTMLInputElement | null>(null);

  const [code, setCode] = useState('');
  const [status, setStatus] = useState<AccountStatus>('Unavailable');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(getTodayIsoDate());

  // เงื่อนไขผ่อนรายไอดี (กำหนดเองได้ทีละตัว)
  const [minDownWeekly, setMinDownWeekly] = useState(
    String(defaultSettings.default_min_down_weekly ?? 1000)
  );
  const [minDownMonthly, setMinDownMonthly] = useState(
    String(defaultSettings.default_min_down_monthly ?? 2000)
  );
  const [interestFreeWeeks, setInterestFreeWeeks] = useState(
    String(defaultSettings.default_free_weeks ?? 2)
  );
  const [interestFreeMonths, setInterestFreeMonths] = useState(
    String(defaultSettings.default_free_months ?? 1)
  );

  // ข้อมูลผูกบัญชี
  const [phoneState, setPhoneState] = useState<PhoneBindState>('พร้อมเปลี่ยน');
  const [phoneDay, setPhoneDay] = useState('');
  const [phoneMonth, setPhoneMonth] = useState('');
  const [phoneOwner, setPhoneOwner] = useState('');

  const [mailState, setMailState] = useState<MailBindState>('พร้อมยก');
  const [mailDay, setMailDay] = useState('');
  const [mailMonth, setMailMonth] = useState('');

  const [fbState, setFbState] = useState<BoolBindState>('ไม่ติด');
  const [cardState, setCardState] = useState<BoolBindState>('ไม่ติด');
  const [extraTagsText, setExtraTagsText] = useState('');

  const [description, setDescription] = useState('');
  const [mainImageUrl, setMainImageUrl] = useState('');
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);

  // ข้อมูลลับ Garena & Gmail
  const [gameUid, setGameUid] = useState('');
  const [loginProvider, setLoginProvider] = useState('Garena');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authenticator, setAuthenticator] = useState('');

  const [gmail, setGmail] = useState('');
  const [gmailPassword, setGmailPassword] = useState('');
  const [gmailAuthenticator, setGmailAuthenticator] = useState('');
  const [gmailRecovery, setGmailRecovery] = useState('');
  const [privateNotes, setPrivateNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setShowPasswords(false);
    setGalleryProgress(null);
    setUploadingMain(false);

    if (!editingAccount) {
      setCode('');
      setStatus('Unavailable');
      setPrice('');
      setCost('');
      setPurchaseDate(getTodayIsoDate());
      setMinDownWeekly(String(defaultSettings.default_min_down_weekly ?? 1000));
      setMinDownMonthly(String(defaultSettings.default_min_down_monthly ?? 2000));
      setInterestFreeWeeks(String(defaultSettings.default_free_weeks ?? 2));
      setInterestFreeMonths(String(defaultSettings.default_free_months ?? 1));
      setPhoneState('พร้อมเปลี่ยน');
      setPhoneDay('');
      setPhoneMonth('');
      setPhoneOwner('');
      setMailState('พร้อมยก');
      setMailDay('');
      setMailMonth('');
      setFbState('ไม่ติด');
      setCardState('ไม่ติด');
      setExtraTagsText('');
      setDescription('');
      setMainImageUrl('');
      setGalleryUrls([]);
      setGameUid('');
      setLoginProvider('Garena');
      setUsername('');
      setPassword('');
      setAuthenticator('');
      setGmail('');
      setGmailPassword('');
      setGmailAuthenticator('');
      setGmailRecovery('');
      setPrivateNotes('');
      return;
    }

    setCode(editingAccount.code);
    setStatus(editingAccount.status);
    setPrice(editingAccount.price ? String(editingAccount.price) : '');
    setMinDownWeekly(
      String(
        editingAccount.min_down_weekly ??
          defaultSettings.default_min_down_weekly ??
          1000
      )
    );
    setMinDownMonthly(
      String(
        editingAccount.min_down_monthly ??
          defaultSettings.default_min_down_monthly ??
          2000
      )
    );
    setInterestFreeWeeks(
      String(
        editingAccount.interest_free_weeks ??
          defaultSettings.default_free_weeks ??
          2
      )
    );
    setInterestFreeMonths(
      String(
        editingAccount.interest_free_months ??
          defaultSettings.default_free_months ??
          1
      )
    );

    const parsed = parseBindingTags(editingAccount.tags);
    setPhoneState(parsed.phoneState);
    setPhoneDay(parsed.phoneDay);
    setPhoneMonth(parsed.phoneMonth);
    setMailState(parsed.mailState);
    setMailDay(parsed.mailDay);
    setMailMonth(parsed.mailMonth);
    setFbState(parsed.fbState);
    setCardState(parsed.cardState);
    setExtraTagsText(parsed.extraTagsText);

    setDescription(editingAccount.description ?? '');
    setMainImageUrl(editingAccount.main_image_url ?? '');
    setGalleryUrls(editingAccount.gallery_urls ?? []);

    setLoadingSecret(true);
    fetch(`/api/admin/accounts/${editingAccount.id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'โหลดข้อมูลลับไม่สำเร็จ');
        const sec = data.secret as AccountSecretDecrypted;
        setCost(sec.cost ? String(sec.cost) : '');
        setPurchaseDate(sec.purchase_date || getTodayIsoDate());
        setPhoneOwner(sec.phone_owner ?? '');
        setGameUid(sec.game_uid ?? '');
        setLoginProvider(sec.login_provider || 'Garena');
        setUsername(sec.username ?? '');
        setPassword(sec.password ?? '');
        setAuthenticator(sec.authenticator ?? '');
        setGmail(sec.gmail ?? '');
        setGmailPassword(sec.gmail_password ?? '');
        setGmailAuthenticator(sec.gmail_authenticator ?? '');
        setGmailRecovery(sec.gmail_recovery ?? '');
        setPrivateNotes(sec.private_notes ?? '');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingSecret(false));
  }, [isOpen, editingAccount, defaultSettings]);

  if (!isOpen) return null;

  const isUploadingAny = uploadingMain || galleryProgress !== null;

  const handleMainImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMain(true);
    setError(null);
    try {
      const url = await uploadWebPToR2(file);
      setMainImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดรูปหลักไม่สำเร็จ');
    } finally {
      setUploadingMain(false);
      e.target.value = '';
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setGalleryProgress({ done: 0, total: files.length });
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const url = await uploadWebPToR2(files[i]);
        setGalleryUrls((prev) => [...prev, url]);
        setGalleryProgress({ done: i + 1, total: files.length });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดรูปเพิ่มเติมไม่สำเร็จ');
    } finally {
      setGalleryProgress(null);
      e.target.value = '';
    }
  };

  const formatBackupCodes = () => {
    const matches = gmailRecovery.match(/\b\d{8}\b/g);
    if (matches && matches.length > 0) {
      setGmailRecovery(matches.join('\n'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('กรุณาระบุรหัสไอดี');
      return;
    }

    if (status !== 'Unavailable' && !mainImageUrl) {
      setError('สถานะ Available / Installment / SoldOut ต้องอัปโหลดรูปป้ายหลักก่อน');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const phoneDateStr =
        phoneDay.trim() && phoneMonth.trim()
          ? `${phoneDay.trim().padStart(2, '0')}/${phoneMonth.trim().padStart(2, '0')}`
          : phoneDay.trim();

      const mailDateStr =
        mailDay.trim() && mailMonth.trim()
          ? `${mailDay.trim().padStart(2, '0')}/${mailMonth.trim().padStart(2, '0')}`
          : mailDay.trim();

      const phoneTag =
        phoneState === 'รอเปลี่ยน'
          ? `เบอร์รอเปลี่ยน${phoneDateStr ? ` ${phoneDateStr}` : ''}`
          : 'เบอร์พร้อมเปลี่ยน';

      const mailTag =
        mailState === 'รอเปลี่ยน' || mailState === 'รอยก'
          ? `เมล${mailState}${mailDateStr ? ` ${mailDateStr}` : ''}`
          : `เมล${mailState}`;

      const fbTag = fbState === 'ติด' ? 'ติดเฟส' : 'ไม่ติดเฟส';
      const cardTag = cardState === 'ติด' ? 'ติดบัตร' : 'ไม่ติดบัตร';

      const extraTags = extraTagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const tags = [phoneTag, mailTag, fbTag, cardTag, ...extraTags];

      const endpoint = editingAccount
        ? `/api/admin/accounts/${editingAccount.id}`
        : '/api/admin/accounts';

      const res = await fetch(endpoint, {
        method: editingAccount ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          status,
          price: Number(price) || 0,
          cost: Number(cost) || 0,
          min_down_weekly: Math.max(0, Number(minDownWeekly) || 0),
          min_down_monthly: Math.max(0, Number(minDownMonthly) || 0),
          interest_free_weeks: Math.max(0, Number(interestFreeWeeks) || 0),
          interest_free_months: Math.max(0, Number(interestFreeMonths) || 0),
          purchase_date: purchaseDate,
          phone_owner: phoneOwner.trim(),
          tags,
          description,
          main_image_url: mainImageUrl || null,
          gallery_urls: galleryUrls,
          game_uid: gameUid,
          login_provider: loginProvider || 'Garena',
          username,
          password,
          authenticator,
          gmail,
          gmail_password: gmailPassword,
          gmail_authenticator: gmailAuthenticator,
          gmail_recovery: gmailRecovery,
          private_notes: privateNotes,
        }),
      });

      const rawText = await res.text();
      let data: { error?: string } = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (${res.status})`);
      }

      if (!res.ok) {
        throw new Error(data.error ?? 'บันทึกข้อมูลไม่สำเร็จ');
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const priceNum = Number(price) || 0;
  const isMonthlyTier = getDefaultInstallmentMode(priceNum) === 'monthly';
  const thresholdLabel =
    MONTHLY_DEFAULT_PRICE_THRESHOLD.toLocaleString('en-US');
  const installmentRuleLabel =
    priceNum <= 0
      ? 'ยังไม่ระบุราคาขาย (กรอกทีหลังตอนตัดรูปเสร็จได้)'
      : isMonthlyTier
        ? `ราคา ${thresholdLabel} ขึ้นไป → ผ่อนรายเดือน`
        : `ต่ำกว่า ${thresholdLabel} → ผ่อนรายสัปดาห์`;

  const galleryPercent = galleryProgress
    ? Math.round((galleryProgress.done / galleryProgress.total) * 100)
    : 0;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 px-3 py-6 sm:px-6 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#111216] p-4 sm:p-6 shadow-2xl animate-modal-in">
          <div className="mb-4 flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h2 className="text-sm font-semibold text-[#F1F5F9] sm:text-base">
              {editingAccount ? `แก้ไขข้อมูลไอดี ${editingAccount.code}` : 'เพิ่มไอดีใหม่เข้าระบบ'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {loadingSecret ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-[#93C5FD]" />
              <span>กำลังถอดรหัสข้อมูลลับ...</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
              {/* แถวที่ 1: รหัสไอดี / สถานะ / ราคาขาย / ต้นทุน / วันที่ซื้อ */}
              <div className="space-y-3 rounded-xl border border-white/[0.07] bg-[#0A0A0D] p-3.5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">รหัสไอดี</label>
                    <input
                      type="text"
                      required
                      placeholder="PM0001"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.1] bg-[#111216] px-3 py-2 font-[family-name:var(--font-mono)] text-sm text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">สถานะ</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as AccountStatus)}
                      className="w-full rounded-lg border border-white/[0.1] bg-[#111216] px-2.5 py-2 font-[family-name:var(--font-mono)] text-xs text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none sm:text-sm"
                    >
                      <option value="Unavailable">Unavailable</option>
                      <option value="Available">Available</option>
                      <option value="Installment">Installment</option>
                      <option value="SoldOut">SoldOut</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">
                      ราคาขาย (เว้นว่างได้)
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.1] bg-[#111216] px-3 py-2 font-[family-name:var(--font-mono)] text-sm font-semibold text-[#93C5FD] placeholder:text-zinc-600 focus:border-[#93C5FD]/60 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">ต้นทุน</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.1] bg-[#111216] px-3 py-2 font-[family-name:var(--font-mono)] text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-[#93C5FD]/60 focus:outline-none"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="mb-1 flex items-center gap-1 text-xs text-zinc-400">
                      <Calendar className="h-3 w-3 text-[#93C5FD]" />
                      <span>วันที่ซื้อไอดี</span>
                    </label>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.1] bg-[#111216] px-2.5 py-2 text-xs text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none"
                    />
                  </div>
                </div>

                {/* ตั้งค่าเงื่อนไขผ่อนเฉพาะไอดีนี้ */}
                <div className="rounded-lg border border-white/[0.06] bg-[#111216]/70 p-2.5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
                    <span className="text-[11px] font-medium text-[#93C5FD]">
                      {installmentRuleLabel}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      กำหนดเงื่อนไขผ่อนเฉพาะไอดีนี้ได้เอง
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-[11px] text-zinc-400">
                        ดาวน์ขั้นต่ำ (รายสัปดาห์)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={minDownWeekly}
                        onChange={(e) => setMinDownWeekly(e.target.value)}
                        className="w-full rounded-md border border-white/[0.1] bg-[#0A0A0D] px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-xs text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] text-zinc-400">
                        ปลอดดอก (กี่สัปดาห์)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={52}
                        value={interestFreeWeeks}
                        onChange={(e) => setInterestFreeWeeks(e.target.value)}
                        className="w-full rounded-md border border-white/[0.1] bg-[#0A0A0D] px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-xs font-semibold text-[#93C5FD] focus:border-[#93C5FD]/60 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] text-zinc-400">
                        ดาวน์ขั้นต่ำ (รายเดือน)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={minDownMonthly}
                        onChange={(e) => setMinDownMonthly(e.target.value)}
                        className="w-full rounded-md border border-white/[0.1] bg-[#0A0A0D] px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-xs text-[#F1F5F9] focus:border-[#93C5FD]/60 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] text-zinc-400">
                        ปลอดดอก (กี่เดือน)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={24}
                        value={interestFreeMonths}
                        onChange={(e) => setInterestFreeMonths(e.target.value)}
                        className="w-full rounded-md border border-white/[0.1] bg-[#0A0A0D] px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-xs font-semibold text-[#93C5FD] focus:border-[#93C5FD]/60 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* แถวที่ 2: ข้อมูลผูกบัญชี */}
              <div className="space-y-3 rounded-xl border border-white/[0.07] bg-[#0A0A0D] p-3.5">
                <span className="block text-xs font-semibold text-zinc-300">
                  ข้อมูลผูกบัญชี
                </span>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* เบอร์ + เจ้าของเบอร์ */}
                  <div className="space-y-2 rounded-lg border border-white/[0.06] bg-[#111216]/60 p-2.5">
                    <label className="block text-[11px] text-zinc-400">เบอร์</label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(['พร้อมเปลี่ยน', 'รอเปลี่ยน'] as PhoneBindState[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setPhoneState(opt)}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            phoneState === opt
                              ? 'bg-[#F1F5F9] text-[#0A0A0D]'
                              : 'border border-white/[0.1] bg-[#0A0A0D] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}

                      {phoneState === 'รอเปลี่ยน' && (
                        <div className="inline-flex items-center rounded-md border border-[#93C5FD]/45 bg-[#0A0A0D] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-xs text-[#F1F5F9]">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={2}
                            placeholder="วว"
                            value={phoneDay}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                              setPhoneDay(val);
                              if (val.length === 2) {
                                phoneMonthInputRef.current?.focus();
                              }
                            }}
                            className="w-6 bg-transparent text-center placeholder:text-zinc-600 focus:outline-none"
                          />
                          <span className="text-zinc-500">/</span>
                          <input
                            ref={phoneMonthInputRef}
                            type="text"
                            inputMode="numeric"
                            maxLength={2}
                            placeholder="ดด"
                            value={phoneMonth}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                              setPhoneMonth(val);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Backspace' && phoneMonth === '') {
                                const prev = e.currentTarget.previousElementSibling
                                  ?.previousElementSibling as HTMLInputElement | null;
                                prev?.focus();
                              }
                            }}
                            className="w-6 bg-transparent text-center placeholder:text-zinc-600 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>

                    <div className="relative pt-0.5">
                      <Phone className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        value={phoneOwner}
                        onChange={(e) => setPhoneOwner(e.target.value)}
                        placeholder="เบอร์ใคร / เบอร์เช่า / 08x..."
                        className="w-full rounded-md border border-white/[0.09] bg-[#0A0A0D] py-1.5 pl-7 pr-2.5 text-xs text-[#F1F5F9] placeholder:text-zinc-600 focus:border-[#93C5FD]/50 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* เมล */}
                  <div className="space-y-2 rounded-lg border border-white/[0.06] bg-[#111216]/60 p-2.5">
                    <label className="block text-[11px] text-zinc-400">เมล</label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        ['พร้อมยก', 'รอยก', 'พร้อมเปลี่ยน', 'รอเปลี่ยน'] as MailBindState[]
                      ).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setMailState(opt)}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            mailState === opt
                              ? 'bg-[#F1F5F9] text-[#0A0A0D]'
                              : 'border border-white/[0.1] bg-[#0A0A0D] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}

                      {(mailState === 'รอเปลี่ยน' || mailState === 'รอยก') && (
                        <div className="inline-flex items-center rounded-md border border-[#93C5FD]/45 bg-[#0A0A0D] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-xs text-[#F1F5F9]">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={2}
                            placeholder="วว"
                            value={mailDay}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                              setMailDay(val);
                              if (val.length === 2) {
                                mailMonthInputRef.current?.focus();
                              }
                            }}
                            className="w-6 bg-transparent text-center placeholder:text-zinc-600 focus:outline-none"
                          />
                          <span className="text-zinc-500">/</span>
                          <input
                            ref={mailMonthInputRef}
                            type="text"
                            inputMode="numeric"
                            maxLength={2}
                            placeholder="ดด"
                            value={mailMonth}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                              setMailMonth(val);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Backspace' && mailMonth === '') {
                                const prev = e.currentTarget.previousElementSibling
                                  ?.previousElementSibling as HTMLInputElement | null;
                                prev?.focus();
                              }
                            }}
                            className="w-6 bg-transparent text-center placeholder:text-zinc-600 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* เฟส */}
                  <div>
                    <label className="mb-1.5 block text-[11px] text-zinc-400">เฟส</label>
                    <div className="flex gap-1.5">
                      {(['ไม่ติด', 'ติด'] as BoolBindState[]).map((opt) => (
                        <button
                          key={`fb-${opt}`}
                          type="button"
                          onClick={() => setFbState(opt)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                            fbState === opt
                              ? 'bg-[#F1F5F9] text-[#0A0A0D]'
                              : 'border border-white/[0.1] bg-[#111216] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* บัตร */}
                  <div>
                    <label className="mb-1.5 block text-[11px] text-zinc-400">บัตร</label>
                    <div className="flex gap-1.5">
                      {(['ไม่ติด', 'ติด'] as BoolBindState[]).map((opt) => (
                        <button
                          key={`card-${opt}`}
                          type="button"
                          onClick={() => setCardState(opt)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                            cardState === opt
                              ? 'bg-[#F1F5F9] text-[#0A0A0D]'
                              : 'border border-white/[0.1] bg-[#111216] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-zinc-400">
                      แท็กเพิ่มเติม (ถ้ามี)
                    </label>
                    <input
                      type="text"
                      value={extraTagsText}
                      onChange={(e) => setExtraTagsText(e.target.value)}
                      placeholder="เช่น สกินแรร์เยอะ"
                      className="w-full rounded-md border border-white/[0.1] bg-[#111216] px-3 py-1.5 text-xs text-[#F1F5F9] placeholder:text-zinc-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-zinc-400">
                      รายละเอียดเพิ่มเติมหน้าเว็บ
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="คูปองเหลือ / รูน / สกินพิเศษ"
                      className="w-full rounded-md border border-white/[0.1] bg-[#111216] px-3 py-1.5 text-xs text-[#F1F5F9] placeholder:text-zinc-600"
                    />
                  </div>
                </div>
              </div>

              {/* แถวที่ 3: รูปภาพ */}
              <div className="grid grid-cols-1 gap-4 rounded-xl border border-white/[0.07] bg-[#0A0A0D] p-3.5 sm:grid-cols-2">
                <div>
                  <span className="mb-2 block text-xs font-medium text-zinc-300">
                    รูปป้ายหลัก {status === 'Unavailable' && '(ยังไม่บังคับ)'}
                  </span>
                  {mainImageUrl && (
                    <img
                      src={mainImageUrl}
                      alt="ป้ายหลัก"
                      className="mb-2 h-36 w-auto rounded-md border border-white/[0.1] object-contain"
                    />
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.1] bg-[#111216] px-3 py-2 text-xs font-medium text-zinc-200 hover:border-white/25">
                    {uploadingMain ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#93C5FD]" />
                        <span className="text-[#93C5FD]">กำลังอัปโหลด (0/1 รูป)...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5 text-[#93C5FD]" />
                        <span>{mainImageUrl ? 'เปลี่ยนรูปป้ายหลัก' : 'เลือกรูปป้ายหลัก'}</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingAny}
                      onChange={handleMainImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-300">
                      รูปเพิ่มเติม ({galleryUrls.length})
                    </span>
                    {galleryUrls.length > 0 && !galleryProgress && (
                      <button
                        type="button"
                        onClick={() => setGalleryUrls([])}
                        className="text-[11px] text-zinc-500 hover:text-red-400"
                      >
                        ล้างทั้งหมด
                      </button>
                    )}
                  </div>

                  {galleryUrls.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {galleryUrls.map((url, idx) => (
                        <div key={`gal-${idx}`} className="relative h-14 w-14">
                          <img
                            src={url}
                            alt="รูปเสริม"
                            className="h-full w-full rounded-md border border-white/[0.1] object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setGalleryUrls((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.1] bg-[#111216] px-3 py-2 text-xs font-medium text-zinc-200 hover:border-white/25">
                    {galleryProgress ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#93C5FD]" />
                        <span className="tabular-nums text-[#93C5FD]">
                          เสร็จแล้ว {galleryProgress.done}/{galleryProgress.total} รูป
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5 text-[#93C5FD]" />
                        <span>เพิ่มรูปเสริม</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={isUploadingAny}
                      onChange={handleGalleryUpload}
                      className="hidden"
                    />
                  </label>

                  {galleryProgress && (
                    <div className="mt-2 space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                        <div
                          className="h-full rounded-full bg-[#93C5FD] transition-all duration-200"
                          style={{ width: `${galleryPercent}%` }}
                        />
                      </div>
                      <p className="text-[11px] tabular-nums text-zinc-400">
                        กำลังอัปโหลดรูปที่{' '}
                        {Math.min(galleryProgress.done + 1, galleryProgress.total)} จาก{' '}
                        {galleryProgress.total} ({galleryPercent}%)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* แถวที่ 4: ข้อมูลลับ Garena & Gmail */}
              <div className="space-y-4 rounded-xl border border-[#93C5FD]/25 bg-[#0A0A0D] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#93C5FD]">
                    ข้อมูลลับบัญชี (เข้ารหัส AES-256 + Sync Sheet)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPasswords((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
                  >
                    {showPasswords ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    <span>{showPasswords ? 'ซ่อนรหัส' : 'แสดงรหัส'}</span>
                  </button>
                </div>

                {/* ส่วน Garena */}
                <div className="space-y-2.5 rounded-lg border border-white/[0.06] bg-[#111216]/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#F1F5F9]">Garena</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-500">ช่องทางล็อกอิน</span>
                      <input
                        type="text"
                        value={loginProvider}
                        onChange={(e) => setLoginProvider(e.target.value)}
                        className="w-24 rounded border border-white/[0.1] bg-[#0A0A0D] px-2 py-0.5 text-center font-[family-name:var(--font-mono)] text-xs text-[#93C5FD]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[11px] text-zinc-400">Username</label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full rounded-md border border-white/[0.1] bg-[#0A0A0D] px-3 py-1.5 font-[family-name:var(--font-mono)] text-xs text-[#F1F5F9]"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] text-zinc-400">Password</label>
                      <input
                        type="text"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={
                          !showPasswords
                            ? ({ WebkitTextSecurity: 'disc' } as React.CSSProperties)
                            : undefined
                        }
                        className="w-full rounded-md border border-white/[0.1] bg-[#0A0A0D] px-3 py-1.5 font-[family-name:var(--font-mono)] text-xs text-[#F1F5F9]"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] text-zinc-400">
                        Authenticator
                      </label>
                      <input
                        type="text"
                        value={authenticator}
                        onChange={(e) => setAuthenticator(e.target.value)}
                        placeholder="Secret Key 2FA"
                        style={
                          !showPasswords
                            ? ({ WebkitTextSecurity: 'disc' } as React.CSSProperties)
                            : undefined
                        }
                        className="w-full rounded-md border border-white/[0.1] bg-[#0A0A0D] px-3 py-1.5 font-[family-name:var(--font-mono)] text-xs text-[#F1F5F9] placeholder:text-zinc-600"
                      />
                    </div>
                  </div>
                </div>

                {/* ส่วน Gmail */}
                <div className="space-y-2.5 rounded-lg border border-white/[0.06] bg-[#111216]/60 p-3">
                  <span className="block text-xs font-semibold text-[#F1F5F9]">Gmail</span>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[11px] text-zinc-400">Gmail</label>
                      <input
                        type="text"
                        value={gmail}
                        onChange={(e) => setGmail(e.target.value)}
                        className="w-full rounded-md border border-white/[0.1] bg-[#0A0A0D] px-3 py-1.5 font-[family-name:var(--font-mono)] text-xs text-[#F1F5F9]"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] text-zinc-400">Password</label>
                      <input
                        type="text"
                        value={gmailPassword}
                        onChange={(e) => setGmailPassword(e.target.value)}
                        style={
                          !showPasswords
                            ? ({ WebkitTextSecurity: 'disc' } as React.CSSProperties)
                            : undefined
                        }
                        className="w-full rounded-md border border-white/[0.1] bg-[#0A0A0D] px-3 py-1.5 font-[family-name:var(--font-mono)] text-xs text-[#F1F5F9]"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] text-zinc-400">
                        Authenticator
                      </label>
                      <input
                        type="text"
                        value={gmailAuthenticator}
                        onChange={(e) => setGmailAuthenticator(e.target.value)}
                        placeholder="Secret Key 2FA"
                        style={
                          !showPasswords
                            ? ({ WebkitTextSecurity: 'disc' } as React.CSSProperties)
                            : undefined
                        }
                        className="w-full rounded-md border border-white/[0.1] bg-[#0A0A0D] px-3 py-1.5 font-[family-name:var(--font-mono)] text-xs text-[#F1F5F9] placeholder:text-zinc-600"
                      />
                    </div>
                  </div>

                  {/* รหัสกู้ 8 หลัก 10 ชุด (Textarea) */}
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label className="text-[11px] text-zinc-400">
                        รหัสกู้สำรอง 8 หลัก (วางทั้ง 10 ชุดได้เลย)
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={formatBackupCodes}
                          className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-[#93C5FD]"
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>จัดเรียง</span>
                        </button>
                        {gmailRecovery.trim() && (
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard.writeText(gmailRecovery);
                              setCopiedRecovery(true);
                              setTimeout(() => setCopiedRecovery(false), 1800);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] text-[#93C5FD] hover:underline"
                          >
                            {copiedRecovery ? (
                              <>
                                <Check className="h-3 w-3" />
                                <span>คัดลอกแล้ว</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>คัดลอก</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={gmailRecovery}
                      onChange={(e) => setGmailRecovery(e.target.value)}
                      placeholder={'วางรหัสสำรอง 8 หลัก (10 ชุด) ที่ก๊อปมาจาก Google ได้เลย'}
                      className="w-full rounded-md border border-white/[0.1] bg-[#0A0A0D] px-3 py-2 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-[#F1F5F9] placeholder:text-zinc-600 focus:border-[#93C5FD]/60 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Game UID & หมายเหตุ */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] text-zinc-400">Game UID</label>
                    <input
                      type="text"
                      value={gameUid}
                      onChange={(e) => setGameUid(e.target.value)}
                      className="w-full rounded-md border border-white/[0.1] bg-[#111216] px-3 py-1.5 font-[family-name:var(--font-mono)] text-xs text-[#F1F5F9]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] text-zinc-400">หมายเหตุส่วนตัว</label>
                    <input
                      type="text"
                      value={privateNotes}
                      onChange={(e) => setPrivateNotes(e.target.value)}
                      className="w-full rounded-md border border-white/[0.1] bg-[#111216] px-3 py-1.5 text-xs text-[#F1F5F9]"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3.5 py-2 text-xs text-red-400">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-white/[0.1] px-4 py-2 text-xs font-medium text-zinc-300 hover:text-white"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving || isUploadingAny}
                  className="rounded-lg bg-[#F1F5F9] px-5 py-2 text-xs font-semibold text-[#0A0A0D] hover:bg-white disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลไอดี'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}