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
