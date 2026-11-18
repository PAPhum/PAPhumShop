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
