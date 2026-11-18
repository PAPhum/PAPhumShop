# ค่าผ่อนตรงกันทั้งระบบ + PIN 30 วัน + Rate limit ใน DB + เร่งความเร็ว Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ค่าดอกเบี้ย/งวดฟรีดอก/ดาวน์ขั้นต่ำที่แอดมินตั้งไว้มีผลจริงทุกหน้า, ให้ PIN อยู่ได้ 30 วันโดยนับความพยายามผิดใน DB, แทนที่ error ดิบด้วยข้อความกลาง และเร่งความเร็ว `/store` กับ `/banners` ด้วยแคช + รูปที่ optimize

**Architecture:** ดึงค่าผ่อนทั้งหมดจาก `installment_settings` ผ่านตัว resolve ค่าเดียว แล้วส่งเข้า `calculateInstallmentPlan` ที่รับ rate ได้; เก็บแคชข้อมูลสาธารณะด้วย `'use cache'` + `cacheTag` และล้างด้วย `revalidateTag` ใน route ที่ mutate; PIN ใช้ token HMAC เดิมแต่ขยายอายุ และตัวนับย้ายไปตาราง `pin_attempts`

**Tech Stack:** Next.js 16.4.6 (App Router, `cacheComponents: true`), React 19, TypeScript strict, Supabase (`@supabase/ssr`), Tailwind 4, Vitest 5, lucide-react

**Spec:** `docs/superpowers/specs/2026-11-18-installment-pin-perf-design.md`

## Global Constraints

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

## Review Focus

1. **ไม่มีแถวหรือค่าเป็น null ใน `installment_settings`** — หน้าเว็บยังใช้ดอกเบี้ยเริ่มต้น 140/600 และไม่ crash; ค่าปลอดดอก/ดาวน์ที่ไอดีเป็น 0 ต้องแสดงตามจริง
2. **ไอดีราคา 0 หรือติดลบ** — หน้า `/id/[code]` ต้องไม่ throw ระหว่าง render และแสดงข้อความแทนกล่องคำนวณ
3. **รูปที่ URL ว่างหรือ host ไม่ตรง `R2_PUBLIC_URL`** — ต้องไม่ทำให้หน้าเว็บพังหรือขึ้นรูปแตก 400 จาก image optimizer
4. **คุกกี้ PIN หมดอายุ/ถูกแก้** — ต้องได้ 403 พร้อมข้อความให้ปลดล็อก ไม่ใช่ 500 และ UI ต้องกลับไปสถานะล็อก
5. **แอดมินบันทึกแล้วแคชค้าง** — หน้า `/store` และ `/banners` ต้องแสดงค่าใหม่หลัง mutation โดยไม่ต้องรอ deploy

---

## Task 1: Tooling + ให้ `calculateInstallmentPlan` รับ rate ได้

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (เพิ่ม `vite` ใน devDependencies)
- Modify: `src/lib/installment.ts:7-14` (`InstallmentInput`), `:97`
- Test: `tests/lib/installment.test.ts`

**Interfaces:**
- Produces: `InstallmentInput.weeklyRate?: number`, `InstallmentInput.monthlyRate?: number` — ไม่ส่ง = ใช้ `WEEKLY_INTEREST_RATE` / `MONTHLY_INTEREST_RATE` เดิม
- Produces: `calculateInstallmentPlan(input: InstallmentInput): InstallmentResult` (signature เดิม)

- [ ] **Step 1: ติดตั้ง vite และ config**

```bash
npm i -D vite
```

สร้าง `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 2: เขียนเทสต์ที่ยังไม่ผ่าน**

เพิ่มใน `tests/lib/installment.test.ts`:

```ts
it('ใช้ weeklyRate ที่ส่งเข้ามาแทนค่าคงที่', () => {
  const result = calculateInstallmentPlan({
    price: 3290, downPayment: 1000, minDownPayment: 1000,
    mode: 'weekly', periods: 4, interestFreePeriods: 2, weeklyRate: 200,
  });
  expect(result.interestRatePerPeriod).toBe(200);
  expect(result.totalInterest).toBe(200 * 2);
});

it('ไม่ส่ง rate แล้วยังใช้ค่าเดิม 140/600', () => {
  const result = calculateInstallmentPlan({
    price: 3290, downPayment: 1000, minDownPayment: 1000,
    mode: 'weekly', periods: 4, interestFreePeriods: 2,
  });
  expect(result.interestRatePerPeriod).toBe(140);
});
```

- [ ] **Step 3: รันให้เห็นว่า fail**

Run: `npx vitest run tests/lib/installment.test.ts`
Expected: FAIL — `weeklyRate` ไม่ถูกใช้ / `interestRatePerPeriod` เป็น 140

- [ ] **Step 4: แก้ `src/lib/installment.ts`**

เพิ่ม 2 ฟิลด์ optional ใน `InstallmentInput` แล้วเปลี่ยนบรรทัดคำนวณ rate (เดิม `:97`) เป็น:

```ts
const interestRatePerPeriod =
  mode === 'weekly'
    ? (input.weeklyRate ?? WEEKLY_INTEREST_RATE)
    : (input.monthlyRate ?? MONTHLY_INTEREST_RATE);
```

- [ ] **Step 5: รันเทสต์ทั้งหมด**

Run: `npx vitest run`
Expected: PASS ทุกไฟล์ (3 ไฟล์เดิม + เทสต์ใหม่)

- [ ] **Step 6: Checkpoint**

Run: `npx tsc --noEmit`
Expected: ไม่มี error

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

---

## Task 3: หน้าไอดีใช้ดอกเบี้ยจาก settings + ค่าปลอดดอก/ดาวน์ของไอดีเอง

**Files:**
- Modify: `src/components/AccountDetailClient.tsx` (planType/minDown/freePeriods/calculation)
- Test: manual checklist (ไม่มี React Testing Library ในโปรเจกต์ และไม่เพิ่ม dependency)

**Interfaces:**
- Consumes: `resolveInstallmentRates` (Task 2), `InstallmentInput.weeklyRate/monthlyRate` (Task 1)
- Produces: `AccountDetailClient({ account, settings })` — props เดิมไม่เปลี่ยน

- [ ] **Step 1: ส่ง rate จาก settings และใช้ค่าของไอดีตรง ๆ**

```tsx
const rates = useMemo(() => resolveInstallmentRates(settings), [settings]);

// ปลอดดอกและดาวน์ขั้นต่ำเป็นค่าของไอดีแต่ละใบ — ไม่มี fallback ไป settings
const minDown = planType === 'weekly'
  ? account.min_down_weekly
  : account.min_down_monthly;
const freePeriods = planType === 'weekly'
  ? account.interest_free_weeks
  : account.interest_free_months;
```

- ส่ง `weeklyRate: rates.weeklyRate, monthlyRate: rates.monthlyRate` เข้า `calculateInstallmentPlan`
- `useMemo` ของ calculation ต้องใส่ `rates` ใน dependency array
- ค่า `0` ของโหมดที่ไม่ได้ใช้ต้องแสดงตามจริง ห้ามแทนด้วยค่าอื่น

- [ ] **Step 2: ตรวจ guard เดิมยังอยู่**

- `status === 'SoldOut'` → การ์ด "ไอดีนี้ขายแล้ว"
- `price <= 0` หรือ `calculation === null` → ข้อความ "ยังคำนวณยอดผ่อนไม่ได้ …"
- `periods` ถูกจำกัด 1–24, ดาวน์ถูก clamp ใน `[minDown, price]`
- `minDown === 0` → ไม่ throw และไม่ clamp ให้ติดลบ (ถ้า `minDown > price` ให้ใช้ `price`)

- [ ] **Step 3: ตรวจด้วยมือ**

Run: `npm run dev` แล้วเปิด `/id/<code>` ของไอดีราคา < 6,000
Expected: จำนวนงวดฟรีดอกตรงกับคอลัมน์ของไอดีนั้น และยอดงวดเปลี่ยนเมื่อแก้ `weekly_interest_rate` ในหน้า `/admin`

- [ ] **Step 4: Checkpoint**

Run: `npx tsc --noEmit`
Expected: ไม่มี error

---

## Task 4: `/store` ลดคอลัมน์ที่ดึง (พฤติกรรมการ์ดคงเดิม)

> ดาวน์ขั้นต่ำเป็นค่าของไอดี — การ์ดยังอ่าน `min_down_*` ตรง ๆ และซ่อนบรรทัด "ดาวน์เริ่ม" เมื่อค่าเป็น 0 ตามที่ผู้ใช้ยืนยัน

**Files:**
- Modify: `src/app/store/page.tsx:7-20`
- Modify: `src/components/AccountCatalogClient.tsx:14-19`
- Modify: `src/types/database.ts` (เพิ่ม type `StoreAccount`)

**Interfaces:**
- Produces: `src/types/database.ts`
  ```ts
  export type StoreAccount = Pick<
    AccountPublic,
    'id' | 'code' | 'status' | 'price' | 'min_down_weekly' | 'min_down_monthly'
    | 'tags' | 'description' | 'main_image_url' | 'created_at'
  >;
  ```
  `AccountCatalogClientProps` เปลี่ยนเป็น `accounts?: StoreAccount[]`

- [ ] **Step 1: แก้ query ใน `store/page.tsx`**

`.select('id, code, status, price, min_down_weekly, min_down_monthly, tags, description, main_image_url, created_at')` — คง `.eq`/`.order` เดิมไว้ทั้งหมด

- [ ] **Step 2: เปลี่ยน type ของ props**

`AccountCatalogClient` รับ `accounts?: StoreAccount[]` และ import type จาก `src/types/database.ts`

- [ ] **Step 3: ตรวจว่าการ์ดไม่พัง**

- คงเงื่อนไขเดิมที่ซ่อนบรรทัด "ดาวน์เริ่ม" เมื่อค่าที่ใช้เป็น 0
- คงการใช้ `description` ในการค้นหา (ห้ามตัดออกจาก select)

- [ ] **Step 4: ตรวจด้วยมือ**

เปิด `/store` → ค้นหาด้วยคำที่อยู่ใน description ของไอดี
Expected: ค้นเจอ และการ์ดแสดงเหมือนก่อนแก้

- [ ] **Step 5: Checkpoint**

Run: `npx tsc --noEmit`
Expected: ไม่มี error

---

## Task 5: หน้า `/id/[code]` อ่านจาก view (แก้ 404 ของผู้เยี่ยมชม)

**Files:**
- Modify: `src/app/id/[code]/page.tsx:22-32`

**Interfaces:**
- Consumes: view `accounts_public` (14 คอลัมน์ตาม `DB.md:116`)
- Produces: พฤติกรรมเดิมของหน้า แต่ผู้ไม่ล็อกอินเห็นได้

- [ ] **Step 1: เปลี่ยนตารางเป็น view**

`.from('accounts_public')` และลบ `.neq('status', 'Unavailable')` (view กรองอยู่แล้ว) คง `.ilike('code', decodedCode).maybeSingle()`

- [ ] **Step 2: ตรวจว่า select ตรงกับ view**

คอลัมน์ที่เลือกต้องอยู่ในรายการ: `id, code, status, price, min_down_weekly, min_down_monthly, interest_free_weeks, interest_free_months, tags, description, main_image_url, gallery_urls, created_at, updated_at`

- [ ] **Step 3: ตรวจด้วยมือ**

เปิดหน้าต่าง Incognito (ไม่ล็อกอิน) → `/id/<code>`
Expected: เห็นหน้าไอดีปกติ ไม่ใช่ 404

- [ ] **Step 4: Checkpoint**

Run: `npx tsc --noEmit` และ `npm run build`
Expected: ผ่านทั้งคู่

---

## Task 6: ฟอร์มไอดีบันทึกปลอดดอก/ดาวน์ได้จริง + หน้า "ตั้งค่าผ่อน" เหลือ 2 ช่องดอกเบี้ย

**Files:**
- Modify: `src/app/api/admin/accounts/route.ts:118-123, 143-144`
- Modify: `src/app/api/admin/accounts/[id]/route.ts:201-205, 220-221`
- Modify: `src/app/api/admin/settings/route.ts:4-11, 71-82`
- Modify: `src/components/admin/AdminDashboardClient.tsx:729-800` (ลบ 4 ช่อง)

**Interfaces:**
- Produces: `POST/PATCH /api/admin/accounts` บันทึก `interest_free_weeks/months` จากค่าที่ฟอร์มส่งมา (ไม่ derive จากราคา) และยังบันทึก `min_down_*` เหมือนเดิม
- Produces: `POST/PATCH /api/admin/settings` รับเฉพาะ `weekly_interest_rate` / `monthly_interest_rate`; ตอบ 404 `{ error: 'ยังไม่มีแถวตั้งค่า' }` เมื่อ UPDATE ไม่โดนแถว

- [ ] **Step 1: ให้ API บันทึกค่าปลอดดอกจากฟอร์ม**

ใน `POST /api/admin/accounts` ลบ `isMonthlyPlan`/`freeWeeks`/`freeMonths` และเปลี่ยน payload เป็น:

```ts
interest_free_weeks: Math.max(0, Math.trunc(Number(body.interest_free_weeks) || 0)),
interest_free_months: Math.max(0, Math.trunc(Number(body.interest_free_months) || 0)),
```

ทำแบบเดียวกันใน `PATCH /api/admin/accounts/[id]` (ใช้ `Math.max(0, ...)` ให้สอดคล้องกับ `min_down_*`)

ลบ `getDefaultInstallmentMode` ออกจาก import ทั้งสองไฟล์ถ้าไม่ถูกใช้แล้ว

- [ ] **Step 2: ให้ settings route รับแค่ดอกเบี้ย**

```ts
const NUMERIC_FIELDS = ['weekly_interest_rate', 'monthly_interest_rate'] as const;
```

หลัง `.update(...).eq('id', 1).select('*').maybeSingle()` ให้ตรวจแถวก่อนตรวจ error:

```ts
if (!data) {
  return jsonNoStore({ error: 'ยังไม่มีแถวตั้งค่า' }, { status: 404 });
}
```

- [ ] **Step 3: เอาช่องปลอดดอก/ดาวน์ออกจากหน้า "ตั้งค่าผ่อน"**

ใน `AdminDashboardClient.tsx` ลบ 4 บล็อก `<div>` ที่ผูกกับ `default_min_down_weekly`, `default_min_down_monthly`, `default_free_weeks`, `default_free_months` (ช่วงบรรทัด 729-800) ให้เหลือเฉพาะ 2 ช่องดอกเบี้ย

ฟอร์มไอดี (`AccountFormModal.tsx`) **ไม่ต้องแก้** — มีช่องปลอดดอก/ดาวน์อยู่แล้วและจะทำงานจริงหลัง Step 1

- [ ] **Step 4: ตรวจด้วยมือ**

- `/admin` → ตั้งค่าผ่อน: เห็นเพียง 2 ช่อง และบันทึกได้
- `/admin` → แก้ไอดี: กรอกปลอดดอก 3 สัปดาห์ → บันทึก → เปิดใหม่ ค่ายังเป็น 3
- เปิด `/id/<code>`: แสดง "ฟรีดอก 3 สัปดาห์"

- [ ] **Step 5: Checkpoint**

Run: `npx tsc --noEmit`
Expected: ไม่มี error

---

## Task 7: ตารางผ่อนของแอดมินใช้ค่าของไอดีตรง ๆ + ดอกเบี้ยจาก settings

> Implementer ของ Task 1 พบว่า `ScheduleGeneratorModal` พิมพ์ดอกเบี้ยจากค่าคงที่ 140/600 ตรง ๆ (บรรทัด ~130, 139) และคำนวณด้วยค่าคงที่ — ต้องต่อ rate จาก settings ด้วย ไม่งั้นข้อความกับยอดในตารางจะไม่ตรงกับหน้าลูกค้า

**Files:**
- Modify: `src/components/admin/AdminDashboardClient.tsx:860-874`
- Modify: `src/components/admin/ScheduleGeneratorModal.tsx` (props, labels, calculation call)

**Interfaces:**
- Consumes: `resolveInstallmentRates(settings)` (Task 2)
- Produces: `ScheduleGeneratorModal` รับ `weeklyRate?: number`, `monthlyRate?: number` (default 140/600); `initialDown*`/`initialFree*` มาจากแถวไอดีที่เลือก
- Produces: `ScheduleGeneratorModal` ส่ง rate เข้า `calculateInstallmentPlan` และใช้ค่าเดียวกันใน label ปุ่ม

- [ ] **Step 1: ส่งค่าจากแถวไอดีและ rate จาก settings**

```tsx
const rates = resolveInstallmentRates(settings);

<ScheduleGeneratorModal
  isOpen={true}
  initialCode={scheduleAccount.code}
  initialPrice={scheduleAccount.price}
  initialDownWeekly={scheduleAccount.min_down_weekly}
  initialDownMonthly={scheduleAccount.min_down_monthly}
  initialFreeWeeks={scheduleAccount.interest_free_weeks}
  initialFreeMonths={scheduleAccount.interest_free_months}
  weeklyRate={rates.weeklyRate}
  monthlyRate={rates.monthlyRate}
  onClose={() => setScheduleAccount(null)}
/>
```

- [ ] **Step 2: ให้ modal ใช้ rate ที่รับมา**

- เพิ่ม props `weeklyRate = 140`, `monthlyRate = 600`
- ส่ง `weeklyRate`/`monthlyRate` เข้า `calculateInstallmentPlan` (หรือ `generatePaymentSchedule`)
- เปลี่ยน label ปุ่มเป็น `` `รายสัปดาห์ (${weeklyRate}฿/งวด)` `` และ `` `รายเดือน (${monthlyRate}฿/งวด)` ``
- ลบ import `WEEKLY_INTEREST_RATE`/`MONTHLY_INTEREST_RATE` ออกจาก modal ถ้าไม่ถูกใช้แล้ว

- [ ] **Step 3: ตรวจด้วยมือ**

เปิด modal "สร้างตารางผ่อน" ของไอดีที่ตั้งปลอดดอก 3 สัปดาห์ หลังตั้ง `weekly_interest_rate = 200`
Expected: ช่องฟรีดอกเริ่มที่ 3, ปุ่มแสดง 200฿/งวด และยอดในตารางตรงกับหน้าลูกค้า

- [ ] **Step 4: Checkpoint**

Run: `npx tsc --noEmit`
Expected: ไม่มี error

---

## Task 8: PIN อายุ 30 วัน

**Files:**
- Modify: `src/lib/pin-token.ts:4`
- Test: `tests/lib/pin-token.test.ts` (สร้างใหม่)

**Interfaces:**
- Produces: `PIN_SESSION_SECONDS = 2592000`
- Produces: `signPinToken(userId, pinVersion, ttlSeconds = PIN_SESSION_SECONDS)` (signature เดิม)

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

```ts
import { PIN_SESSION_SECONDS, signPinToken, verifyPinToken } from '../../src/lib/pin-token';

it('อายุ PIN คือ 30 วัน', () => {
  expect(PIN_SESSION_SECONDS).toBe(60 * 60 * 24 * 30);
});

it('token ที่เพิ่งเซ็นผ่านการตรวจ และ token ที่แก้ไขไม่ผ่าน', () => {
  process.env.PIN_TOKEN_SECRET = 'test-secret-for-unit-test';
  const token = signPinToken('user-1', 'v1');
  expect(verifyPinToken(token, 'user-1', 'v1')).toBe(true);
  expect(verifyPinToken(`${token}x`, 'user-1', 'v1')).toBe(false);
  expect(verifyPinToken(token, 'user-2', 'v1')).toBe(false);
});

it('token ที่หมดอายุไม่ผ่าน', () => {
  process.env.PIN_TOKEN_SECRET = 'test-secret-for-unit-test';
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-18T00:00:00Z'));
  const token = signPinToken('user-1', 'v1', 60);
  vi.setSystemTime(new Date('2026-11-18T00:02:00Z'));
  expect(verifyPinToken(token, 'user-1', 'v1')).toBe(false);
  vi.useRealTimers();
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run tests/lib/pin-token.test.ts`
Expected: FAIL — ค่าคงที่ยังเป็น 3600

- [ ] **Step 3: เปลี่ยนค่าคงที่**

```ts
export const PIN_SESSION_SECONDS = 60 * 60 * 24 * 30;
```

คุกกี้ใน `api/admin/pin/route.ts` ใช้ `PIN_SESSION_SECONDS` เป็น `maxAge` อยู่แล้ว — ไม่ต้องแก้

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run tests/lib/pin-token.test.ts`
Expected: PASS

- [ ] **Step 5: Checkpoint**

Run: `npx tsc --noEmit`
Expected: ไม่มี error

---

## Task 9: ตาราง `pin_attempts` + ตัวนับใน DB

**Files:**
- Create: `supabase/migrations/003_pin_attempts.sql`
- Create: `supabase/migrations/003_indexes_concurrently.sql`
- Create: `src/lib/pin-attempts.ts`
- Modify: `src/app/api/admin/pin/route.ts:88-110, 135-136, 189-190`
- Test: `tests/lib/pin-attempts.test.ts` (ทดสอบฟังก์ชัน pure)

**Interfaces:**
- Produces:
  ```ts
  export interface PinAttemptResult { ok: boolean; retryAfter: number }
  export function retryAfterSeconds(oldestISO: string, windowMs: number, now: number): number;
  export async function checkPinAttempts(admin: SupabaseClient, key: string, limit: number, windowMs: number): Promise<PinAttemptResult>;
  export async function clearPinAttempts(admin: SupabaseClient, key: string): Promise<void>;
  ```
- Consumes: `createSupabaseAdminClient()` จาก `src/lib/supabase/admin.ts`

- [ ] **Step 1: เขียน SQL 2 ไฟล์**

`003_pin_attempts.sql`:

```sql
create table if not exists public.pin_attempts (
  id bigint generated always as identity primary key,
  attempt_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pin_attempts_key_created
  on public.pin_attempts (attempt_key, created_at desc);

alter table public.pin_attempts enable row level security;
-- ไม่สร้าง policy: เข้าถึงเฉพาะ service role ฝั่ง server
```

`003_indexes_concurrently.sql` (รันทีละคำสั่ง):

```sql
create index concurrently if not exists idx_accounts_status_created
  on public.accounts (status, created_at desc);

create index concurrently if not exists idx_banners_public_pin
  on public.banners (is_public, is_pinned desc, pin_order, created_at desc);

create index concurrently if not exists idx_banners_category_ids
  on public.banners using gin (category_ids);

create index concurrently if not exists idx_deliveries_expires
  on public.deliveries (expires_at);
```

- [ ] **Step 2: เขียนเทสต์ที่ยังไม่ผ่าน**

```ts
import { retryAfterSeconds } from '../../src/lib/pin-attempts';

it('คำนวณเวลารอจากแถวเก่าสุดในหน้าต่าง', () => {
  const now = Date.parse('2026-11-18T10:00:00Z');
  expect(retryAfterSeconds('2026-11-18T09:55:00Z', 15 * 60_000, now)).toBe(300);
  expect(retryAfterSeconds('2026-11-18T09:00:00Z', 15 * 60_000, now)).toBe(0);
});
```

- [ ] **Step 3: รันให้เห็นว่า fail**

Run: `npx vitest run tests/lib/pin-attempts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: สร้าง `src/lib/pin-attempts.ts`**

- `checkPinAttempts`: ลบแถวที่ `created_at < now - 1 day` → นับแถว `attempt_key = key and created_at >= now - windowMs` → ถ้านับ ≥ limit อ่านแถวเก่าสุดในหน้าต่างแล้วคืน `{ ok: false, retryAfter }` → ไม่งั้น insert แถวใหม่แล้วคืน `{ ok: true, retryAfter: 0 }`
- `clearPinAttempts`: `delete().eq('attempt_key', key)`
- ถ้า query ใด error ให้ throw เพื่อให้ route ตอบ 429/500 (fail closed)

- [ ] **Step 5: เปลี่ยน `api/admin/pin/route.ts` ให้ใช้ตัวใหม่**

สร้าง `const admin = createSupabaseAdminClient()` หลังตรวจ user แล้วแทน `checkRateLimit`/`resetRateLimit` ด้วย `checkPinAttempts`/`clearPinAttempts` โดยคง `getClientIp` และ key เดิม (`pin:user:<userId>:<ip>` limit 5, `pin:ip:<ip>` limit 20, window 15 นาที)

- [ ] **Step 6: รันเทสต์และตรวจด้วยมือ**

Run: `npx vitest run tests/lib/pin-attempts.test.ts`
Expected: PASS

หลังผู้ใช้รัน SQL ทั้ง 2 ไฟล์แล้ว: ยิง PIN ผิด 6 ครั้ง → 429 และ `select count(*) from pin_attempts` > 0

- [ ] **Step 7: Checkpoint**

Run: `npx tsc --noEmit`
Expected: ไม่มี error

---

## Task 10: Logger + error กลาง แทน `error.message` ทั้งระบบ

**Files:**
- Create: `src/lib/logger.ts`
- Create: `src/lib/api-error.ts`
- Modify: `src/app/api/admin/banners/route.ts` (8 จุด), `banner-categories/route.ts` (4), `accounts/route.ts` (3), `accounts/[id]/route.ts` (3), `settings/route.ts` (2), `pin/route.ts` (2)
- Test: `tests/lib/logger.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function sanitizeForLog(value: unknown): unknown;
  export function logServerError(context: string, error: unknown, extra?: Record<string, unknown>): void;
  export function dbErrorResponse(context: string, error: unknown, status?: number): NextResponse;
  export function serverErrorResponse(context: string, error: unknown): NextResponse;
  ```
- ข้อความที่ client เห็น: DB error → `'บันทึกข้อมูลไม่สำเร็จ'`; server error → `'เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์'`

- [ ] **Step 1: เขียนเทสต์ redaction ที่ยังไม่ผ่าน**

```ts
import { sanitizeForLog } from '../../src/lib/logger';

it('ปิดบังค่า key ที่อ่อนไหว', () => {
  const out = sanitizeForLog({
    username: 'player1', password: 'p@ss', pin: '123456',
    pin_salt: 'abc', token: 't', apiKey: 'k', secret: 's', code: 'PM0001',
  }) as Record<string, unknown>;
  expect(out.username).toBe('player1');
  expect(out.code).toBe('PM0001');
  for (const key of ['password', 'pin', 'pin_salt', 'token', 'apiKey', 'secret']) {
    expect(out[key]).toBe('[redacted]');
  }
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run tests/lib/logger.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: สร้าง `logger.ts` และ `api-error.ts`**

- `sanitizeForLog`: เดิน object 1 ระดับ (เพียงพอต่อ usage) และแทนค่าเมื่อชื่อ key ตรงกับ `/(password|passwd|secret|token|pin|salt|key)/i` ด้วย `'[redacted]'`
- `logServerError`: `console.error(JSON.stringify({ level: 'error', context, message, ...extra }))` โดยส่งผ่าน `sanitizeForLog` — เป็นที่เดียวในโปรเจกต์ที่ใช้ `console`
- `dbErrorResponse`: `logServerError` แล้ว `jsonNoStore({ error: 'บันทึกข้อมูลไม่สำเร็จ' }, { status })`
- `serverErrorResponse`: เหมือนกัน แต่ status 500 และข้อความ `'เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์'`

- [ ] **Step 4: แทนที่ทุกจุดที่คืน `error.message`**

เปลี่ยนเป็น `return dbErrorResponse('<context>', error)` (หรือ `error` ตัวแปรตามจริง) โดยเลือก context เช่น `'banners.delete'`, `'accounts.insert'`, `'pin.insert'`

- [ ] **Step 5: ตรวจว่าไม่มี `error.message` หลงเหลือใน API**

Run: `Select-String -Path 'src/app/api/**/route.ts' -Pattern 'error\.message|Error\.message'`
Expected: ไม่พบใน response (เหลือได้เฉพาะใน logger)

- [ ] **Step 6: รันเทสต์ + Checkpoint**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS และไม่มี type error

---

## Task 11: บังคับ PIN เมื่อเปลี่ยนสถานะเป็นติดผ่อน/ขายแล้ว

**Files:**
- Modify: `src/app/api/admin/accounts/[id]/route.ts:151-181`

**Interfaces:**
- Produces: `quickStatusOnly` ตอบ 403 `{ error: 'กรุณาปลดล็อก PIN 6 หลักก่อนเปลี่ยนสถานะนี้' }` เมื่อสถานะปลายทางเป็น `Installment` หรือ `SoldOut` และยังไม่ปลดล็อก

- [ ] **Step 1: เพิ่มเงื่อนไขก่อน update**

```ts
const needsPin = body.status === 'Installment' || body.status === 'SoldOut';
if (needsPin && !(await isPinUnlocked(supabase, user.id))) {
  return jsonNoStore(
    { error: 'กรุณาปลดล็อก PIN 6 หลักก่อนเปลี่ยนสถานะนี้' },
    { status: 403 }
  );
}
```

- [ ] **Step 2: ตรวจด้วยมือ**

ล็อก PIN → เปลี่ยนสถานะเป็น "ติดผ่อน"
Expected: 403 และสถานะไม่เปลี่ยน; ปลดล็อกแล้วทำซ้ำ → สำเร็จ

- [ ] **Step 3: Checkpoint**

Run: `npx tsc --noEmit`
Expected: ไม่มี error

---

## Task 12: แคชข้อมูลสาธารณะ + ล้างแคชเมื่อ mutate

**Files:**
- Create: `src/lib/supabase/public.ts`
- Create: `src/lib/data/store.ts`
- Create: `src/lib/data/banners.ts`
- Modify: `src/app/store/page.tsx`, `src/app/banners/page.tsx`
- Modify: `src/app/api/admin/accounts/route.ts`, `accounts/[id]/route.ts`, `banners/route.ts`, `banner-categories/route.ts`, `settings/route.ts`

**Interfaces:**
- Produces:
  ```ts
  export function createSupabasePublicClient(): SupabaseClient; // anon key, ไม่ผูก cookies
  // การ์ด /store ใช้แค่คอลัมน์ของไอดี (ปลอดดอก/ดาวน์เป็นรายไอดี) จึงไม่ต้องดึง settings
  export async function getStoreData(): Promise<StoreAccount[]>; // 'use cache' + cacheTag('accounts') + cacheLife('minutes')
  export interface BannerSectionsData { sections: BannerCategorySection[]; totalWorksCount: number }
  export async function getBannerSections(): Promise<BannerSectionsData>; // cacheTag('banners','categories')
  ```

- [ ] **Step 1: สร้าง client ที่ไม่ผูก cookies**

`createSupabasePublicClient()` ใช้ `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` และ `auth: { persistSession: false, autoRefreshToken: false }`

- [ ] **Step 2: สร้างฟังก์ชันข้อมูลที่แคชได้**

- `getStoreData()`: ย้าย query ที่ Task 4 ทำไว้มาอยู่ในฟังก์ชันนี้ ใส่ `'use cache'`, `cacheLife('minutes')`, `cacheTag('accounts')`
- `getBannerSections()`: ย้าย logic ทั้งหมดจาก `banners/page.tsx` (4 query + จัดกลุ่ม) มาไว้ ใส่ `'use cache'`, `cacheLife('minutes')`, `cacheTag('banners', 'categories')`
- ห้ามเรียก `connection()` หรือ `cookies()` ภายในฟังก์ชันที่แคช

- [ ] **Step 3: ให้หน้าเว็บเรียกฟังก์ชันที่แคช**

`store/page.tsx` และ `banners/page.tsx` เหลือเพียง `await connection()` แล้ว `await getStoreData()` / `await getBannerSections()` ก่อน render

- [ ] **Step 4: เพิ่ม `revalidateTag` ในทุก route ที่ mutate**

ก่อน `return` ที่สำเร็จของ POST/PATCH/DELETE:

- accounts → `revalidateTag('accounts', { expire: 0 })`
- banners → `revalidateTag('banners', { expire: 0 })`
- banner-categories → `revalidateTag('categories', { expire: 0 })` + `revalidateTag('banners', { expire: 0 })`
- settings → `revalidateTag('settings', { expire: 0 })` (หน้า `/id` เป็น dynamic อยู่แล้ว จึงเห็นดอกเบี้ยใหม่ทันที; tag นี้กันไว้สำหรับแคชที่อาจเพิ่มในอนาคต)

> ตรวจเอกสาร `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md` ก่อนเขียน ถ้า signature ต่างจากนี้ให้ใช้ตามเอกสารเวอร์ชันนี้

- [ ] **Step 5: ตรวจด้วยมือ**

เปิด `/store` → แก้ราคาไอดีใน `/admin` → รีเฟรช `/store`
Expected: เห็นราคาใหม่ทันที (ไม่ต้อง redeploy)

- [ ] **Step 6: Checkpoint**

Run: `npm run build`
Expected: ผ่าน และไม่มี warning เรื่อง cache directive

---

## Task 13: รูปภาพด้วย `next/image` + fallback

**Files:**
- Modify: `next.config.ts`
- Modify: `package.json` (ย้าย `sharp` จาก devDependencies ไป dependencies)
- Create: `src/lib/image-host.ts`
- Create: `src/components/SmartImage.tsx`
- Modify: `src/components/AccountCatalogClient.tsx:223-235`
- Modify: `src/components/BannerPortfolioClient.tsx`, `src/components/BannerCoverflowCarousel.tsx` (จุดที่ใช้ `<img>`)
- Modify: `src/components/AccountDetailClient.tsx` (แกลเลอรี)
- Test: `tests/lib/image-host.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function shouldOptimizeImage(src: string, base: string | undefined): boolean;
  ```
- Produces:
  ```tsx
  export interface SmartImageProps {
    src: string; alt: string; sizes?: string; className?: string;
    priority?: boolean; fill?: boolean; width?: number; height?: number;
  }
  export default function SmartImage(props: SmartImageProps): React.ReactElement;
  ```
- พฤติกรรม: ใช้ `next/image` เมื่อ `shouldOptimizeImage(src, process.env.NEXT_PUBLIC_R2_PUBLIC_URL)` เป็นจริง ไม่งั้นใช้ `<img loading="lazy" decoding="async">`

- [ ] **Step 1: เขียนเทสต์ host ที่ยังไม่ผ่าน**

```ts
import { shouldOptimizeImage } from '../../src/lib/image-host';

it('optimize เฉพาะ host เดียวกับ R2_PUBLIC_URL', () => {
  const base = 'https://pub-abc.r2.dev';
  expect(shouldOptimizeImage('https://pub-abc.r2.dev/a.webp', base)).toBe(true);
  expect(shouldOptimizeImage('https://other.example.com/a.webp', base)).toBe(false);
  expect(shouldOptimizeImage('', base)).toBe(false);
  expect(shouldOptimizeImage('https://pub-abc.r2.dev/a.webp', undefined)).toBe(false);
});
```

รัน: `npx vitest run tests/lib/image-host.test.ts` → FAIL (module not found)

- [ ] **Step 2: ตั้งค่า `next.config.ts`**

```ts
const r2Url = process.env.R2_PUBLIC_URL;
const r2Host = r2Url ? new URL(r2Url).hostname : undefined;

const nextConfig: NextConfig = {
  // ...ของเดิม
  env: { NEXT_PUBLIC_R2_PUBLIC_URL: r2Url ?? '' },
  images: r2Host
    ? { remotePatterns: [{ protocol: 'https' as const, hostname: r2Host, pathname: '/**' }] }
    : undefined,
};
```

- [ ] **Step 3: สร้าง `src/lib/image-host.ts` และรันเทสต์ให้ผ่าน**

`shouldOptimizeImage` แปลง `base` เป็น `URL` แล้วเทียบ `origin` กับ `URL(src).origin` (คืน `false` เมื่อ parse ไม่ได้); รัน `npx vitest run tests/lib/image-host.test.ts` → PASS

- [ ] **Step 4: สร้าง `SmartImage`**

ถ้า `!src` หรือ host ไม่ตรง → `<img>`; ไม่งั้น `<Image fill sizes priority>` (หรือ `width/height` เมื่อไม่ได้ใช้ `fill`)

- [ ] **Step 5: เปลี่ยนจุดที่แสดงรูป**

- การ์ด `/store` (aspect 4/5 → `fill` + `sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"`)
- กริด/แครอเซล `/banners` (รูปแรกของแต่ละ section ใช้ `priority`)
- แกลเลอรีใน `AccountDetailClient` (ไม่ใช้ `priority`)

- [ ] **Step 6: ตรวจด้วยมือ**

เปิด `/store` และ `/banners` → DevTools Network
Expected: เห็น `/_next/image?url=...` และรูปนอกจอไม่ถูกโหลดจนเลื่อนถึง; รูปที่ URL host แปลกยังแสดงได้ผ่าน `<img>`

- [ ] **Step 7: Checkpoint**

Run: `npm run build`
Expected: ผ่าน; ถ้า `R2_PUBLIC_URL` ไม่มีตอน build ให้บันทึกว่าเป็น env ที่ขาดและหยุดตรวจข้อนี้

---

## Task 14: อัปเดตเอกสาร + ตรวจรับทั้งชุด

**Files:**
- Modify: `docs/01-feature-store-and-installment.md` (§9)
- Modify: `docs/03-feature-admin-and-sync.md` (§12)
- Modify: `docs/04-security-audit.md` (§9)
- Modify: `AGENTS.md` (เฉพาะหมายเหตุว่า logger เป็นที่เดียวที่ใช้ `console`)

**Interfaces:**
- ไม่มี (เอกสาร)

- [ ] **Step 1: อัปเดตเอกสาร**

- `docs/01`: แหล่งความจริงของค่าผ่อน — ดอกเบี้ยจาก `installment_settings`, ปลอดดอก + ดาวน์ขั้นต่ำเป็นของไอดี, หน้า `/id` ใช้ `accounts_public`
- `docs/03`: PIN 30 วัน, `pin_attempts`, error กลาง, PIN สำหรับสถานะติดผ่อน/ขายแล้ว, หน้า "ตั้งค่าผ่อน" เหลือ 2 ช่องดอกเบี้ย
- `docs/04` §9: เพิ่มแถว PIN 30 วัน + DB rate limit + error กลาง
- `AGENTS.md` §5: ระบุว่า `src/lib/logger.ts` เป็นข้อยกเว้นเดียวที่ใช้ `console`

- [ ] **Step 2: รันเกตทั้งหมด**

```bash
npx tsc --noEmit
npm run build
npx vitest run
npm run lint
```

Expected: tsc/build/vitest ผ่าน; lint ไม่มี error ใหม่จาก baseline 15

- [ ] **Step 3: ตรวจตาม Review Focus ทั้ง 5 ข้อ**

- settings เป็น null → หน้าเว็บใช้ดอกเบี้ย 140/600 และไม่ crash; ค่าปลอดดอก/ดาวน์ 0 แสดงตามจริง
- ไอดีราคา 0 → หน้า `/id` แสดงข้อความ ไม่ throw
- รูป host แปลก/ว่าง → หน้ายังแสดงได้
- PIN หมดอายุ → 403 + UI ล็อก
- mutate แล้ว `/store` เปลี่ยนทันที

- [ ] **Step 4: ส่งมอบ SQL runbook ให้ผู้ใช้**

แจ้งลำดับ: backup → รัน `003_pin_attempts.sql` → รัน `003_indexes_concurrently.sql` ทีละคำสั่ง → ตรวจ `select count(*) from pin_attempts` และ `pg_stat_progress_create_index`
