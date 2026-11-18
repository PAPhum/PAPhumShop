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
