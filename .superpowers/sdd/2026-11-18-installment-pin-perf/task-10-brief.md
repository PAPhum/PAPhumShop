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
