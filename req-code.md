# C:\Users\phuri\OneDrive\Desktop\paphumshop\src\lib\installment.ts
export type InstallmentMode = 'weekly' | 'monthly';

export const WEEKLY_INTEREST_RATE = 140; // Fix: 140 บาท/สัปดาห์
export const MONTHLY_INTEREST_RATE = 600; // Fix: 600 บาท/เดือน
export const MONTHLY_DEFAULT_PRICE_THRESHOLD = 6000;

export interface InstallmentInput {
  price: number;
  downPayment: number;
  minDownPayment: number;
  mode: InstallmentMode;
  periods: number;
  interestFreePeriods: number;
  weeklyRate?: number;
  monthlyRate?: number;
}

export interface InstallmentResult {
  mode: InstallmentMode;
  price: number;
  downPayment: number;
  principal: number;
  periods: number;
  interestFreePeriods: number;
  chargeablePeriods: number;
  interestRatePerPeriod: number;
  totalInterest: number;
  totalAmountWithDown: number;
  remainingTotal: number;
  amountPerPeriod: number;
}

export interface ScheduleEntry {
  periodNumber: number;
  dateISO: string; // YYYY-MM-DD
  dateLabel: string; // DD/MM
  amount: number;
}

export interface ScheduleInput extends InstallmentInput {
  code: string;
  startDateISO: string; // YYYY-MM-DD
}

export interface ScheduleResult extends InstallmentResult {
  code: string;
  startDateISO: string;
  downPaymentDateLabel: string; // DD/MM
  schedule: ScheduleEntry[];
}

export interface QuoteFormatInput {
  price: number;
  downPayment: number;
  minDownPayment: number;
  mode: InstallmentMode;
  interestFreePeriods: number;
  minPeriods?: number;
  maxPeriods?: number;
}

/**
 * กำหนดโหมดเริ่มต้นของตัวคำนวณผ่อนหน้าเว็บ
 * ราคา 6,000 บาทขึ้นไป -> รายเดือน
 * ราคาต่ำกว่า 6,000 บาท -> รายสัปดาห์
 */
export function getDefaultInstallmentMode(price: number): InstallmentMode {
  return price >= MONTHLY_DEFAULT_PRICE_THRESHOLD ? 'monthly' : 'weekly';
}

/**
 * คำนวณยอดผ่อนสำหรับจำนวนงวดที่ระบุ
 */
export function calculateInstallmentPlan(input: InstallmentInput): InstallmentResult {
  const {
    price,
    downPayment,
    minDownPayment,
    mode,
    periods,
    interestFreePeriods,
  } = input;

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('ราคาไอดีต้องมากกว่า 0 บาท');
  }
  if (!Number.isInteger(periods) || periods < 1) {
    throw new Error('จำนวนงวดต้องเป็นจำนวนเต็มตั้งแต่ 1 งวดขึ้นไป');
  }
  if (downPayment < minDownPayment) {
    throw new Error(`เงินดาวน์ต้องไม่ต่ำกว่าขั้นต่ำ (${formatNumber(minDownPayment)} บาท)`);
  }
  if (downPayment > price) {
    throw new Error('เงินดาวน์ต้องไม่เกินราคาไอดี');
  }

  const safeFreePeriods = Math.max(0, Math.floor(interestFreePeriods));
  const interestRatePerPeriod =
    mode === 'weekly'
      ? (input.weeklyRate ?? WEEKLY_INTEREST_RATE)
      : (input.monthlyRate ?? MONTHLY_INTEREST_RATE);

  const principal = price - downPayment;
  const chargeablePeriods = Math.max(0, periods - safeFreePeriods);
  const totalInterest = chargeablePeriods * interestRatePerPeriod;
  const remainingTotal = principal + totalInterest;
  const totalAmountWithDown = downPayment + remainingTotal;
  const amountPerPeriod =
    remainingTotal === 0 ? 0 : Math.ceil(remainingTotal / periods);

  return {
    mode,
    price,
    downPayment,
    principal,
    periods,
    interestFreePeriods: safeFreePeriods,
    chargeablePeriods,
    interestRatePerPeriod,
    totalInterest,
    totalAmountWithDown,
    remainingTotal,
    amountPerPeriod,
  };
}

/**
 * แยกวันที่ YYYY-MM-DD แบบปลอดภัยไม่เพี้ยนตาม Timezone
 */
function parseISODateParts(dateISO: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO.trim());
  if (!match) {
    throw new Error('รูปแบบวันที่ไม่ถูกต้อง ต้องเป็น YYYY-MM-DD');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const checkDate = new Date(Date.UTC(year, month - 1, day));
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    throw new Error('วันที่ไม่อยู่ในปฏิทินจริง');
  }

  return { year, month, day };
}

function getDaysInMonthUTC(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

function formatPartsToISO(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatPartsToShortThaiDate(month: number, day: number): string {
  const d = String(day).padStart(2, '0');
  const m = String(month).padStart(2, '0');
  return `${d}/${m}`;
}

/**
 * คำนวณวันนัดชำระแต่ละงวด
 * - รายสัปดาห์: บวกทีละ 7 วัน
 * - รายเดือน: ยึดเลขวันที่เดียวกับวันเริ่มสัญญา หากเดือนนั้นมีวันไม่ถึงให้ปัดเป็นวันสิ้นเดือนสุด
 */
export function addInstallmentPeriodDate(
  startDateISO: string,
  mode: InstallmentMode,
  periodIndex: number
): { dateISO: string; dateLabel: string } {
  const { year, month, day } = parseISODateParts(startDateISO);

  if (mode === 'weekly') {
    const dt = new Date(Date.UTC(year, month - 1, day + periodIndex * 7));
    const resYear = dt.getUTCFullYear();
    const resMonth = dt.getUTCMonth() + 1;
    const resDay = dt.getUTCDate();
    return {
      dateISO: formatPartsToISO(resYear, resMonth, resDay),
      dateLabel: formatPartsToShortThaiDate(resMonth, resDay),
    };
  }

  // โหมดรายเดือน: คำนวณจากเดือนตั้งต้น + periodIndex และยึดเลขวันเริ่มสัญญา (day)
  const zeroBasedTotalMonths = month - 1 + periodIndex;
  const targetYear = year + Math.floor(zeroBasedTotalMonths / 12);
  const targetMonth = (zeroBasedTotalMonths % 12) + 1;
  const maxDayInTargetMonth = getDaysInMonthUTC(targetYear, targetMonth);
  const clampedDay = Math.min(day, maxDayInTargetMonth);

  return {
    dateISO: formatPartsToISO(targetYear, targetMonth, clampedDay),
    dateLabel: formatPartsToShortThaiDate(targetMonth, clampedDay),
  };
}

/**
 * สร้างตารางวันเปิดสัญญาและนัดชำระทั้งหมดสำหรับฝั่งแอดมิน
 */
export function generatePaymentSchedule(input: ScheduleInput): ScheduleResult {
  const plan = calculateInstallmentPlan(input);
  const startParts = parseISODateParts(input.startDateISO);
  const downPaymentDateLabel = formatPartsToShortThaiDate(
    startParts.month,
    startParts.day
  );

  const schedule: ScheduleEntry[] = [];
  for (let i = 1; i <= plan.periods; i++) {
    const { dateISO, dateLabel } = addInstallmentPeriodDate(
      input.startDateISO,
      plan.mode,
      i
    );
    schedule.push({
      periodNumber: i,
      dateISO,
      dateLabel,
      amount: plan.amountPerPeriod,
    });
  }

  return {
    ...plan,
    code: input.code.trim() || 'PM0000',
    startDateISO: input.startDateISO,
    downPaymentDateLabel,
    schedule,
  };
}

function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * สร้างข้อความสรุปยอดผ่อนแต่ละงวด (Customer Quote Template)
 */
export function formatCustomerQuoteText(input: QuoteFormatInput): string {
  const {
    price,
    downPayment,
    minDownPayment,
    mode,
    interestFreePeriods,
    minPeriods,
    maxPeriods = 8,
  } = input;

  const startPeriod =
    minPeriods ?? (mode === 'weekly' ? Math.max(1, interestFreePeriods) : 1);
  const endPeriod = Math.max(startPeriod, maxPeriods);
  const modeLabel = mode === 'weekly' ? 'รายสัปดาห์' : 'รายเดือน';
  const unitLabel = mode === 'weekly' ? 'สัปดาห์' : 'เดือน';

  const lines: string[] = [
    '--- ตัวเลือกการผ่อน PAPHUM ---',
    `ราคาไอดี: ${formatNumber(price)}฿ | ดาวน์: ${formatNumber(downPayment)}฿ (${modeLabel})`,
    '',
  ];

  for (let p = startPeriod; p <= endPeriod; p++) {
    const res = calculateInstallmentPlan({
      price,
      downPayment,
      minDownPayment,
      mode,
      periods: p,
      interestFreePeriods,
    });
    lines.push(
      `• ผ่อน ${p} ${unitLabel} → งวดละ ${formatNumber(res.amountPerPeriod)}฿`
    );
  }

  return lines.join('\n');
}

/**
 * สร้างข้อความตารางวันนัดชำระจริงสำหรับแอดมินคัดลอกส่งแชท
 */
export function formatAdminScheduleText(scheduleResult: ScheduleResult): string {
  const {
    code,
    price,
    downPayment,
    mode,
    periods,
    interestFreePeriods,
    totalInterest,
    totalAmountWithDown,
    downPaymentDateLabel,
    schedule,
  } = scheduleResult;

  const freeText =
    mode === 'weekly'
      ? `ฟรีดอก ${interestFreePeriods * 7} วัน`
      : `ฟรีดอก ${interestFreePeriods} เดือน`;

  const durationText =
    mode === 'weekly' ? `รวม ${periods * 7} วัน` : `รวม ${periods} เดือน`;

  const lines: string[] = [
    `--- ตารางผ่อนไอดี: ${code} ---`,
    `• ราคาไอดี: ${formatNumber(price)}฿ (${freeText})`,
    `• จำนวน: ${periods} งวด (${durationText})`,
    `• ดอก: ${formatNumber(totalInterest)}฿ | ยอดรวม: ${formatNumber(totalAmountWithDown)}฿`,
    '',
    `[ดาวน์] ${downPaymentDateLabel} → ${formatNumber(downPayment)}฿`,
  ];

  for (const item of schedule) {
    lines.push(
      `[งวดที่ ${item.periodNumber}] ${item.dateLabel} → ${formatNumber(item.amount)}฿`
    );
  }

  return lines.join('\n');
}

# C:\Users\phuri\OneDrive\Desktop\paphumshop\src\app\api\admin\settings\route.ts
import { NextRequest } from 'next/server';
import { jsonNoStore, requireAdmin } from '@/lib/auth/guard';

const NUMERIC_FIELDS = [
  'weekly_interest_rate',
  'monthly_interest_rate',
  'default_min_down_weekly',
  'default_min_down_monthly',
  'default_free_weeks',
  'default_free_months',
] as const;

type NumericField = (typeof NUMERIC_FIELDS)[number];

export async function GET() {
  const auth = await requireAdmin({ ownerOnly: true });
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('installment_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    return jsonNoStore({ error: error.message }, { status: 500 });
  }

  return jsonNoStore({ settings: data ?? null });
}

export async function PATCH(req: NextRequest) {
  return updateSettings(req);
}

export async function POST(req: NextRequest) {
  return updateSettings(req);
}

async function updateSettings(req: NextRequest) {
  const auth = await requireAdmin({ ownerOnly: true });
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return jsonNoStore({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
  }

  const patch: Partial<Record<NumericField, number>> = {};

  for (const field of NUMERIC_FIELDS) {
    const value = (body as Record<string, unknown>)[field];
    if (value === undefined) continue;

    const num = Number(value);
    if (!Number.isInteger(num) || num < 0 || num > 1_000_000) {
      return jsonNoStore({ error: 'ค่าที่กรอกไม่ถูกต้อง' }, { status: 400 });
    }

    patch[field] = num;
  }

  if (Object.keys(patch).length === 0) {
    return jsonNoStore({ error: 'ไม่มีข้อมูลให้บันทึก' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('installment_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('*')
    .maybeSingle();

  if (error) {
    return jsonNoStore({ error: error.message }, { status: 500 });
  }

  return jsonNoStore({ ok: true, settings: data ?? null });
}

# C:\Users\phuri\OneDrive\Desktop\paphumshop\src\app\api\admin\accounts\route.ts
import { NextRequest } from 'next/server';
import { encryptSecret } from '@/lib/crypto';
import {
  syncAccountToSheets,
  syncAllAccountsToSheets,
  SheetAccountPayload,
} from '@/lib/sheets-sync';
import { AccountStatus } from '@/types/database';
import { getDefaultInstallmentMode } from '@/lib/installment';
import { jsonNoStore, requireAdmin } from '@/lib/auth/guard';

const VALID_STATUSES: AccountStatus[] = [
  'Unavailable',
  'Available',
  'Installment',
  'SoldOut',
];

function packPrivateNotes(params: {
  purchaseDate?: string;
  phoneOwner?: string;
  notes?: string;
}): string {
  const parts: string[] = [];
  if (params.purchaseDate?.trim()) {
    parts.push(`[ซื้อ:${params.purchaseDate.trim()}]`);
  }
  if (params.phoneOwner?.trim()) {
    parts.push(`[เบอร์:${params.phoneOwner.trim()}]`);
  }
  if (params.notes?.trim()) {
    parts.push(params.notes.trim());
  }
  return parts.join(' ');
}

function buildSheetPayload(row: Record<string, unknown>): SheetAccountPayload {
  return {
    code: String(row.code ?? ''),
    status: String(row.status ?? 'Unavailable'),
    price: Number(row.price ?? 0),
    cost: Number(row.cost ?? 0),
    min_down_weekly: Number(row.min_down_weekly ?? 0),
    min_down_monthly: Number(row.min_down_monthly ?? 0),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function GET() {
  try {
    const auth = await requireAdmin({ ownerOnly: true });
    if (!auth.ok) return auth.response;

    const { supabase } = auth.ctx;

    const { data, error } = await supabase
      .from('accounts_public')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return jsonNoStore({ error: error.message }, { status: 500 });
    }

    return jsonNoStore({ accounts: data ?? [] });
  } catch (err) {
    return jsonNoStore(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin({ ownerOnly: true, pin: true });
    if (!auth.ok) return auth.response;

    const { supabase } = auth.ctx;

    const body = await req.json();

    // กรณีกดปุ่ม Sync Sheet ทั้งหมด
    if (body.action === 'sync_all') {
      const { data: rows, error } = await supabase
        .from('accounts')
        .select('*')
        .order('code', { ascending: true });

      if (error) {
        return jsonNoStore({ ok: false, error: error.message }, { status: 500 });
      }

      const payloads = (rows ?? []).map((row) => buildSheetPayload(row));
      const syncResult = await syncAllAccountsToSheets(payloads);

      if (!syncResult.ok) {
        return jsonNoStore(
          { ok: false, error: syncResult.error ?? 'Sync Sheet ไม่สำเร็จ' },
          { status: 502 }
        );
      }

      return jsonNoStore({ ok: true, count: payloads.length });
    }

    // กรณีสร้างไอดีใหม่
    const code = String(body.code ?? '').trim();
    if (!code) {
      return jsonNoStore({ error: 'กรุณาระบุรหัสไอดี' }, { status: 400 });
    }

    const status: AccountStatus = VALID_STATUSES.includes(body.status)
      ? body.status
      : 'Unavailable';

    const priceNum = Number(body.price) || 0;
    // กติกาผ่อน: ต่ำกว่า 6,000 เป็นรายสัปดาห์ (ปลอดดอก 2 สัปดาห์), 6,000 ขึ้นไปเป็นรายเดือน (ปลอดดอก 1 เดือน)
    const isMonthlyPlan =
      getDefaultInstallmentMode(priceNum) === 'monthly';
    const freeWeeks = isMonthlyPlan ? 0 : 2;
    const freeMonths = isMonthlyPlan ? 1 : 0;

    const combinedNotes = packPrivateNotes({
      purchaseDate: body.purchase_date,
      phoneOwner: body.phone_owner,
      notes: body.private_notes,
    });

    const now = new Date().toISOString();

    const insertData = {
      code,
      status,
      price: priceNum,
      cost: Number(body.cost) || 0,
      min_down_weekly: Math.max(0, Math.trunc(Number(body.min_down_weekly) || 0)),
      min_down_monthly: Math.max(
        0,
        Math.trunc(Number(body.min_down_monthly) || 0)
      ),
      interest_free_weeks: freeWeeks,
      interest_free_months: freeMonths,
      tags: Array.isArray(body.tags) ? body.tags : [],
      description: body.description ? String(body.description) : null,
      main_image_url: body.main_image_url ? String(body.main_image_url) : null,
      gallery_urls: Array.isArray(body.gallery_urls) ? body.gallery_urls : [],
      game_uid_enc: body.game_uid ? encryptSecret(String(body.game_uid)) : null,
      login_provider_enc: body.login_provider
        ? encryptSecret(String(body.login_provider))
        : encryptSecret('Garena'),
      username_enc: body.username ? encryptSecret(String(body.username)) : null,
      password_enc: body.password ? encryptSecret(String(body.password)) : null,
      authenticator_enc: body.authenticator
        ? encryptSecret(String(body.authenticator))
        : null,
      gmail_enc: body.gmail ? encryptSecret(String(body.gmail)) : null,
      gmail_password_enc: body.gmail_password
        ? encryptSecret(String(body.gmail_password))
        : null,
      gmail_authenticator_enc: body.gmail_authenticator
        ? encryptSecret(String(body.gmail_authenticator))
        : null,
      gmail_recovery_enc: body.gmail_recovery
        ? encryptSecret(String(body.gmail_recovery))
        : null,
      private_notes_enc: combinedNotes ? encryptSecret(combinedNotes) : null,
      updated_at: now,
    };

    const { data: created, error: insertError } = await supabase
      .from('accounts')
      .insert(insertData)
      .select('*')
      .single();

    if (insertError) {
      return jsonNoStore({ error: insertError.message }, { status: 400 });
    }

    let sheetWarning: string | undefined;
    try {
      const syncRes = await syncAccountToSheets('upsert', buildSheetPayload(created));
      if (!syncRes.ok) {
        sheetWarning = syncRes.error;
      }
    } catch (err) {
      sheetWarning = err instanceof Error ? err.message : 'Sheets sync error';
    }

    return jsonNoStore({
      ok: true,
      id: created.id,
      sheetWarning,
    });
  } catch (err) {
    return jsonNoStore(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดระหว่างบันทึกไอดี' },
      { status: 500 }
    );
  }
}

# C:\Users\phuri\OneDrive\Desktop\paphumshop\src\app\api\admin\accounts\[id]\route.ts
import { NextRequest } from 'next/server';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { syncAccountToSheets, SheetAccountPayload } from '@/lib/sheets-sync';
import { AccountSecretDecrypted, AccountStatus } from '@/types/database';
import { getDefaultInstallmentMode } from '@/lib/installment';
import { isPinUnlocked, jsonNoStore, requireAdmin } from '@/lib/auth/guard';

const VALID_STATUSES: AccountStatus[] = [
  'Unavailable',
  'Available',
  'Installment',
  'SoldOut',
];

function buildSheetPayload(row: Record<string, unknown>): SheetAccountPayload {
  return {
    code: String(row.code ?? ''),
    status: String(row.status ?? 'Unavailable'),
    price: Number(row.price ?? 0),
    cost: Number(row.cost ?? 0),
    min_down_weekly: Number(row.min_down_weekly ?? 0),
    min_down_monthly: Number(row.min_down_monthly ?? 0),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function packPrivateNotes(params: {
  purchaseDate?: string;
  phoneOwner?: string;
  notes?: string;
}): string {
  const parts: string[] = [];
  if (params.purchaseDate?.trim()) {
    parts.push(`[ซื้อ:${params.purchaseDate.trim()}]`);
  }
  if (params.phoneOwner?.trim()) {
    parts.push(`[เบอร์:${params.phoneOwner.trim()}]`);
  }
  if (params.notes?.trim()) {
    parts.push(params.notes.trim());
  }
  return parts.join(' ');
}

function unpackPrivateNotes(raw: string): {
  purchase_date: string;
  phone_owner: string;
  private_notes: string;
} {
  let text = raw;
  let purchaseDate = '';
  let phoneOwner = '';

  const purchaseMatch = text.match(/\[ซื้อ:([^\]]+)\]/);
  if (purchaseMatch) {
    purchaseDate = purchaseMatch[1].trim();
    text = text.replace(purchaseMatch[0], '').trim();
  }

  const phoneMatch = text.match(/\[เบอร์:([^\]]+)\]/);
  if (phoneMatch) {
    phoneOwner = phoneMatch[1].trim();
    text = text.replace(phoneMatch[0], '').trim();
  }

  return {
    purchase_date: purchaseDate,
    phone_owner: phoneOwner,
    private_notes: text,
  };
}

function decryptAccountRow(row: Record<string, unknown>): AccountSecretDecrypted {  const rawNotes = row.private_notes_enc
    ? decryptSecret(String(row.private_notes_enc))
    : '';
  const unpacked = unpackPrivateNotes(rawNotes);

  return {
    cost: Number(row.cost ?? 0),
    purchase_date: unpacked.purchase_date,
    phone_owner: unpacked.phone_owner,
    game_uid: row.game_uid_enc ? decryptSecret(String(row.game_uid_enc)) : '',
    login_provider: row.login_provider_enc
      ? decryptSecret(String(row.login_provider_enc))
      : 'Garena',
    username: row.username_enc ? decryptSecret(String(row.username_enc)) : '',
    password: row.password_enc ? decryptSecret(String(row.password_enc)) : '',
    authenticator: row.authenticator_enc
      ? decryptSecret(String(row.authenticator_enc))
      : '',
    gmail: row.gmail_enc ? decryptSecret(String(row.gmail_enc)) : '',
    gmail_password: row.gmail_password_enc
      ? decryptSecret(String(row.gmail_password_enc))
      : '',
    gmail_authenticator: row.gmail_authenticator_enc
      ? decryptSecret(String(row.gmail_authenticator_enc))
      : '',
    gmail_recovery: row.gmail_recovery_enc
      ? decryptSecret(String(row.gmail_recovery_enc))
      : '',
    private_notes: unpacked.private_notes,
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const auth = await requireAdmin({ ownerOnly: true, pin: true });
    if (!auth.ok) return auth.response;

    const { supabase } = auth.ctx;

    const { data: row, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !row) {
      return jsonNoStore({ error: 'ไม่พบข้อมูลไอดี' }, { status: 404 });
    }

    const secret = decryptAccountRow(row);
    return jsonNoStore({ secret });
  } catch (err) {
    return jsonNoStore(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const auth = await requireAdmin({ ownerOnly: true });
    if (!auth.ok) return auth.response;

    const { supabase, user } = auth.ctx;

    const body = await req.json();
    const now = new Date().toISOString();

    // กรณีเปลี่ยนสถานะด่วนบนการ์ด (ไม่ต้องปลดล็อก PIN)
    if (body.quickStatusOnly === true) {
      if (!VALID_STATUSES.includes(body.status)) {
        return jsonNoStore({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 });
      }

      const { data: updated, error } = await supabase
        .from('accounts')
        .update({ status: body.status, updated_at: now })
        .eq('id', id)
        .select('code, status')
        .single();

      if (error || !updated) {
        return jsonNoStore(
          { error: error?.message ?? 'อัปเดตสถานะไม่สำเร็จ' },
          { status: 400 }
        );
      }

      try {
        await syncAccountToSheets('upsert', {
          code: String(updated.code ?? ''),
          status: String(updated.status ?? 'Unavailable'),
        });
      } catch {
        // Non-blocking sync
      }

      return jsonNoStore({ ok: true });
    }

    // กรณีแก้ไขข้อมูลเต็มรูปแบบ (ต้องปลดล็อก PIN)
    const unlocked = await isPinUnlocked(supabase, user.id);
    if (!unlocked) {
      return jsonNoStore(
        { error: 'กรุณาปลดล็อก PIN 6 หลักก่อนแก้ไขข้อมูล' },
        { status: 403 }
      );
    }

    const code = String(body.code ?? '').trim();
    if (!code) {
      return jsonNoStore({ error: 'กรุณาระบุรหัสไอดี' }, { status: 400 });
    }

    const status: AccountStatus = VALID_STATUSES.includes(body.status)
      ? body.status
      : 'Unavailable';

    const priceNum = Number(body.price) || 0;
    const isMonthlyPlan =
      getDefaultInstallmentMode(priceNum) === 'monthly';
    const freeWeeks = isMonthlyPlan ? 0 : 2;
    const freeMonths = isMonthlyPlan ? 1 : 0;

    const combinedNotes = packPrivateNotes({
      purchaseDate: body.purchase_date,
      phoneOwner: body.phone_owner,
      notes: body.private_notes,
    });

    const updateData = {
      code,
      status,
      price: priceNum,
      cost: Number(body.cost) || 0,
      min_down_weekly: Number(body.min_down_weekly) || 0,
      min_down_monthly: Number(body.min_down_monthly) || 0,
      interest_free_weeks: freeWeeks,
      interest_free_months: freeMonths,
      tags: Array.isArray(body.tags) ? body.tags : [],
      description: body.description ? String(body.description) : null,
      main_image_url: body.main_image_url ? String(body.main_image_url) : null,
      gallery_urls: Array.isArray(body.gallery_urls) ? body.gallery_urls : [],
      game_uid_enc: body.game_uid ? encryptSecret(String(body.game_uid)) : null,
      login_provider_enc: body.login_provider
        ? encryptSecret(String(body.login_provider))
        : encryptSecret('Garena'),
      username_enc: body.username ? encryptSecret(String(body.username)) : null,
      password_enc: body.password ? encryptSecret(String(body.password)) : null,
      authenticator_enc: body.authenticator
        ? encryptSecret(String(body.authenticator))
        : null,
      gmail_enc: body.gmail ? encryptSecret(String(body.gmail)) : null,
      gmail_password_enc: body.gmail_password
        ? encryptSecret(String(body.gmail_password))
        : null,
      gmail_authenticator_enc: body.gmail_authenticator
        ? encryptSecret(String(body.gmail_authenticator))
        : null,
      gmail_recovery_enc: body.gmail_recovery
        ? encryptSecret(String(body.gmail_recovery))
        : null,
      private_notes_enc: combinedNotes ? encryptSecret(combinedNotes) : null,
      updated_at: now,
    };

    const { data: updated, error: updateError } = await supabase
      .from('accounts')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (updateError || !updated) {
      return jsonNoStore(
        { error: updateError?.message ?? 'บันทึกข้อมูลไม่สำเร็จ' },
        { status: 400 }
      );
    }

    let sheetWarning: string | undefined;
    try {
      const syncRes = await syncAccountToSheets('upsert', buildSheetPayload(updated));
      if (!syncRes.ok) {
        sheetWarning = syncRes.error;
      }
    } catch (err) {
      sheetWarning = err instanceof Error ? err.message : 'Sheets sync error';
    }

    return jsonNoStore({ ok: true, sheetWarning });
  } catch (err) {
    return jsonNoStore(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดระหว่างแก้ไขไอดี' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const auth = await requireAdmin({ ownerOnly: true, pin: true });
    if (!auth.ok) return auth.response;

    const { supabase } = auth.ctx;

    const { data: existing } = await supabase
      .from('accounts')
      .select('code')
      .eq('id', id)
      .maybeSingle();

    const { error: deleteError } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return jsonNoStore({ error: deleteError.message }, { status: 400 });
    }

    if (existing?.code) {
      try {
        await syncAccountToSheets('delete', { code: existing.code });
      } catch {
        // Non-blocking delete sync
      }
    }

    return jsonNoStore({ ok: true });
  } catch (err) {
    return jsonNoStore(
      { error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดระหว่างลบไอดี' },
      { status: 500 }
    );
  }
}

# C:\Users\phuri\OneDrive\Desktop\paphumshop\src\components\admin\ScheduleGeneratorModal.tsx
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

interface ScheduleGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
  initialPrice?: number;
  initialDownWeekly?: number;
  initialDownMonthly?: number;
  initialFreeWeeks?: number;
  initialFreeMonths?: number;
}

export default function ScheduleGeneratorModal({
  isOpen,
  onClose,
  initialCode = 'PM0001',
  initialPrice = 3290,
  initialDownWeekly = 1000,
  initialDownMonthly = 2000,
  initialFreeWeeks = 2,
  initialFreeMonths = 1,
}: ScheduleGeneratorModalProps) {
  const todayISO = new Date().toISOString().slice(0, 10);

  const [mode, setMode] = useState<InstallmentMode>(
    getDefaultInstallmentMode(initialPrice)
  );
  const initialIsMonthly =
    getDefaultInstallmentMode(initialPrice) === 'monthly';
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
        startDateISO,
      });
      return formatAdminScheduleText(schedule);
    } catch (err) {
      return err instanceof Error ? err.message : 'ข้อมูลไม่ถูกต้อง';
    }
  }, [code, price, downPayment, mode, periods, freePeriods, startDateISO]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(previewText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 px-4 pt-8 pb-12 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-white/[0.1] bg-[#111216] p-5 animate-modal-in">
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
              mode === 'weekly' ? 'text-[#0A0A0D]' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            รายสัปดาห์ ({WEEKLY_INTEREST_RATE}฿/งวด)
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('monthly')}
            className={`relative z-10 rounded-md py-2 text-xs font-semibold transition-colors ${
              mode === 'monthly' ? 'text-[#0A0A0D]' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            รายเดือน ({MONTHLY_INTEREST_RATE}฿/งวด)
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
  );
}

# C:\Users\phuri\OneDrive\Desktop\paphumshop\src\app\id\[code]\page.tsx
import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AccountPublic, InstallmentSettings } from '@/types/database';
import AccountDetailClient from '@/components/AccountDetailClient';

interface AccountPageProps {
  params: Promise<{ code: string }>;
}

async function AccountDetailLoader({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await connection();
  const { code } = await params;
  const decodedCode = decodeURIComponent(code).trim();
  const supabase = await createSupabaseServerClient();

  const [accountRes, settingsRes] = await Promise.all([
    supabase
      .from('accounts')
      .select(
        'id, code, status, price, min_down_weekly, min_down_monthly, interest_free_weeks, interest_free_months, tags, description, main_image_url, gallery_urls, created_at, updated_at'
      )
      .ilike('code', decodedCode)
      .neq('status', 'Unavailable')
      .maybeSingle(),
    supabase.from('installment_settings').select('*').eq('id', 1).maybeSingle(),
  ]);

  if (!accountRes.data) {
    notFound();
  }

  return (
    <AccountDetailClient
      account={accountRes.data as AccountPublic}
      settings={(settingsRes.data as InstallmentSettings) ?? undefined}
    />
  );
}

export default function AccountDetailPage({ params }: AccountPageProps) {
  return (
    <Suspense
      fallback={
        <div className="h-96 animate-pulse rounded-2xl border border-white/[0.06] bg-[#111216]" />
      }
    >
      <AccountDetailLoader params={params} />
    </Suspense>
  );
}

# C:\Users\phuri\OneDrive\Desktop\paphumshop\src\app\store\page.tsx
import { Suspense } from 'react';
import { connection } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AccountPublic } from '@/types/database';
import AccountCatalogClient from '@/components/AccountCatalogClient';

async function StoreAccountsList() {
  await connection();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('accounts_public')
    .select('*')
    .in('status', ['Available', 'Installment', 'SoldOut'])
    .order('created_at', { ascending: false });

  const accounts = (data ?? []) as AccountPublic[];

  return <AccountCatalogClient accounts={accounts} />;
}

export default function StorePage() {
  return (
    <Suspense
      fallback={
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`store-skel-${i}`}
              className="aspect-[3/4] animate-pulse rounded-xl border border-white/[0.06] bg-[#111216]"
            />
          ))}
        </div>
      }
    >
      <StoreAccountsList />
    </Suspense>
  );
}