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
    mode === 'weekly' ? WEEKLY_INTEREST_RATE : MONTHLY_INTEREST_RATE;

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