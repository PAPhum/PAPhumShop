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
