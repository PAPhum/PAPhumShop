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
