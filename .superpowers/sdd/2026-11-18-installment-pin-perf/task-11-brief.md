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

## Task 11: บังคับ PIN เมื่อเปลี่ยนสถานะเป็นติดผ่อน/ขายแล้ว

**Files:**
- Modify: `src/app/api/admin/accounts/[id]/route.ts:151-181`

**Interfaces:**
- Produces: `quickStatusOnly` ตอบ 403 `{ error: 'กรุณาปลดล็อก PIN 6 หลักก่อนเปลี่ยนสถานะนี้' }` เมื่อสถานะปลายทางเป็น `Installment` หรือ `SoldOut` และยังไม่ปลดล็อก

- [ ] **Step 1: เพิ่มเงื่อนไขก่อน update**

```ts
const needsPin = body.status === 'Installment' || body.status === 'SoldOut';
if (needsPin && !(await isPinUnlocked(supabase, user.id))) {
  return jsonNoStore(
    { error: 'กรุณาปลดล็อก PIN 6 หลักก่อนเปลี่ยนสถานะนี้' },
    { status: 403 }
  );
}
```

- [ ] **Step 2: ตรวจด้วยมือ**

ล็อก PIN → เปลี่ยนสถานะเป็น "ติดผ่อน"
Expected: 403 และสถานะไม่เปลี่ยน; ปลดล็อกแล้วทำซ้ำ → สำเร็จ

- [ ] **Step 3: Checkpoint**

Run: `npx tsc --noEmit`
Expected: ไม่มี error
