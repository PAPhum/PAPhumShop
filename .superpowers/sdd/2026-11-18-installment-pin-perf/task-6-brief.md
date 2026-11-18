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
