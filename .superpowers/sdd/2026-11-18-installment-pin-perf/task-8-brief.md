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
