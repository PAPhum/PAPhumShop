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
