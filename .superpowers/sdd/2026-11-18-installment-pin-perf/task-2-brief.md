# Task Brief

> Extracted from docs/superpowers/plans/2026-11-18-installment-pin-perf.md. This brief is the single source of requirements for this task.

## Global Constraints (binding for every task)

- ทุกข้อความ UI เป็นภาษาไทยสั้น ๆ ห้าม Emoji, ไอคอนใช้ `lucide-react` เท่านั้น
- `AccountStatus` เป็น PascalCase: `'Unavailable' | 'Available' | 'Installment' | 'SoldOut'`
- ห้าม import `src/lib/crypto.ts` หรือใช้ `SUPABASE_SERVICE_ROLE_KEY` ใน client component
- ห้าม `drop`/`create` ตารางหรือ view ที่มีอยู่; migration ใหม่ใช้ `create ... if not exists` เท่านั้น
- ห้ามแตะ policy/RLS ของ production ในงานนี้
- ค่าคงที่จากสเปก: `MONTHLY_DEFAULT_PRICE_THRESHOLD = 6000`, ค่าเริ่มต้นดอกเบี้ย `140 / 600`, `PIN_SESSION_SECONDS = 2592000` — **ปลอดดอกและดาวน์ขั้นต่ำเป็นค่าของไอดี ไม่มีค่ากลางของร้าน**
- แคชแท็กที่ใช้: `accounts`, `settings`, `banners`, `categories`
- **ไม่เพิ่ม script ใหม่ใน `package.json`** (กฎ `AGENTS.md` §6) — ใช้ `npx tsc --noEmit`, `npm run build`, `npx vitest run`, `npm run lint`
- **โปรเจกต์ยังไม่เป็น git repo** → ทุก task ปิดด้วย "Checkpoint" (`npx tsc --noEmit` + gate ที่ระบุ) แทน `git commit`
- ห้าม log secret/plaintext/token; logger ต้อง redact ก่อนเขียน

---

## Task 2: ตัว resolve ดอกเบี้ยจาก `installment_settings`

> **ขอบเขตสำคัญ:** ระบบนี้มีค่ากลางเพียงอย่างเดียวคือ **ดอกเบี้ย/งวด** ส่วนจำนวนงวดปลอดดอกและดาวน์ขั้นต่ำเป็นค่าของไอดีแต่ละใบ (อ่านจากคอลัมน์ตรง ๆ) — ตัว resolve นี้ต้อง **ไม่** มี fallback ของสองค่านั้น

**Files:**
- Create: `src/lib/installment-config.ts`
- Test: `tests/lib/installment-config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** ชนิดข้อมูลขั้นต่ำที่ตัว resolve ต้องใช้ — ไม่ผูกกับ type เต็มของตาราง */
  export interface InstallmentRateSource {
    weekly_interest_rate?: number | null;
    monthly_interest_rate?: number | null;
  }
  export interface ResolvedInstallmentRates {
    weeklyRate: number; monthlyRate: number;
  }
  export const DEFAULT_INSTALLMENT_RATES: ResolvedInstallmentRates;
  export function resolveInstallmentRates(
    settings?: InstallmentRateSource | null
  ): ResolvedInstallmentRates;
  ```

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

```ts
import {
  DEFAULT_INSTALLMENT_RATES,
  resolveInstallmentRates,
} from '../../src/lib/installment-config';

it('คืนค่าเริ่มต้น 140/600 เมื่อไม่มี settings', () => {
  expect(resolveInstallmentRates(null)).toEqual(DEFAULT_INSTALLMENT_RATES);
  expect(DEFAULT_INSTALLMENT_RATES).toEqual({ weeklyRate: 140, monthlyRate: 600 });
});

it('ใช้ค่าจาก settings และยอมรับดอก 0', () => {
  const rates = resolveInstallmentRates({
    weekly_interest_rate: 200,
    monthly_interest_rate: 0,
  });
  expect(rates).toEqual({ weeklyRate: 200, monthlyRate: 0 });
});

it('ค่าเสีย (NaN/ติดลบ/undefined) กลับไปใช้ค่าเริ่มต้นทีละฟิลด์', () => {
  const rates = resolveInstallmentRates({
    weekly_interest_rate: Number.NaN,
    monthly_interest_rate: -5,
  });
  expect(rates.weeklyRate).toBe(140);
  expect(rates.monthlyRate).toBe(600);
});

it('ไม่มีฟิลด์ปลอดดอกหรือดาวน์ในผลลัพธ์', () => {
  const rates = resolveInstallmentRates({
    weekly_interest_rate: 140,
    monthly_interest_rate: 600,
    default_free_weeks: 9,
    default_min_down_weekly: 9999,
  } as never);
  expect(Object.keys(rates).sort()).toEqual(['monthlyRate', 'weeklyRate']);
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run tests/lib/installment-config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: สร้าง `src/lib/installment-config.ts`**

```ts
import { MONTHLY_INTEREST_RATE, WEEKLY_INTEREST_RATE } from './installment';

export interface InstallmentRateSource {
  weekly_interest_rate?: number | null;
  monthly_interest_rate?: number | null;
}

export interface ResolvedInstallmentRates {
  weeklyRate: number;
  monthlyRate: number;
}

export const DEFAULT_INSTALLMENT_RATES: ResolvedInstallmentRates = {
  weeklyRate: WEEKLY_INTEREST_RATE,
  monthlyRate: MONTHLY_INTEREST_RATE,
};

function pick(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

export function resolveInstallmentRates(
  settings?: InstallmentRateSource | null
): ResolvedInstallmentRates {
  return {
    weeklyRate: pick(settings?.weekly_interest_rate, DEFAULT_INSTALLMENT_RATES.weeklyRate),
    monthlyRate: pick(settings?.monthly_interest_rate, DEFAULT_INSTALLMENT_RATES.monthlyRate),
  };
}
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run tests/lib/installment-config.test.ts`
Expected: PASS

- [ ] **Step 5: Checkpoint**

Run: `npx tsc --noEmit`
Expected: ไม่มี error
