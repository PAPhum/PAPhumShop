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
