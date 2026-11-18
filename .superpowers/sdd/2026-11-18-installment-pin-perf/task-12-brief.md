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

## Task 12: แคชข้อมูลสาธารณะ + ล้างแคชเมื่อ mutate

**Files:**
- Create: `src/lib/supabase/public.ts`
- Create: `src/lib/data/store.ts`
- Create: `src/lib/data/banners.ts`
- Modify: `src/app/store/page.tsx`, `src/app/banners/page.tsx`
- Modify: `src/app/api/admin/accounts/route.ts`, `accounts/[id]/route.ts`, `banners/route.ts`, `banner-categories/route.ts`, `settings/route.ts`

**Interfaces:**
- Produces:
  ```ts
  export function createSupabasePublicClient(): SupabaseClient; // anon key, ไม่ผูก cookies
  // การ์ด /store ใช้แค่คอลัมน์ของไอดี (ปลอดดอก/ดาวน์เป็นรายไอดี) จึงไม่ต้องดึง settings
  export async function getStoreData(): Promise<StoreAccount[]>; // 'use cache' + cacheTag('accounts') + cacheLife('minutes')
  export interface BannerSectionsData { sections: BannerCategorySection[]; totalWorksCount: number }
  export async function getBannerSections(): Promise<BannerSectionsData>; // cacheTag('banners','categories')
  ```

- [ ] **Step 1: สร้าง client ที่ไม่ผูก cookies**

`createSupabasePublicClient()` ใช้ `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` และ `auth: { persistSession: false, autoRefreshToken: false }`

- [ ] **Step 2: สร้างฟังก์ชันข้อมูลที่แคชได้**

- `getStoreData()`: ย้าย query ที่ Task 4 ทำไว้มาอยู่ในฟังก์ชันนี้ ใส่ `'use cache'`, `cacheLife('minutes')`, `cacheTag('accounts')`
- `getBannerSections()`: ย้าย logic ทั้งหมดจาก `banners/page.tsx` (4 query + จัดกลุ่ม) มาไว้ ใส่ `'use cache'`, `cacheLife('minutes')`, `cacheTag('banners', 'categories')`
- ห้ามเรียก `connection()` หรือ `cookies()` ภายในฟังก์ชันที่แคช

- [ ] **Step 3: ให้หน้าเว็บเรียกฟังก์ชันที่แคช**

`store/page.tsx` และ `banners/page.tsx` เหลือเพียง `await connection()` แล้ว `await getStoreData()` / `await getBannerSections()` ก่อน render

- [ ] **Step 4: เพิ่ม `revalidateTag` ในทุก route ที่ mutate**

ก่อน `return` ที่สำเร็จของ POST/PATCH/DELETE:

- accounts → `revalidateTag('accounts', { expire: 0 })`
- banners → `revalidateTag('banners', { expire: 0 })`
- banner-categories → `revalidateTag('categories', { expire: 0 })` + `revalidateTag('banners', { expire: 0 })`
- settings → `revalidateTag('settings', { expire: 0 })` (หน้า `/id` เป็น dynamic อยู่แล้ว จึงเห็นดอกเบี้ยใหม่ทันที; tag นี้กันไว้สำหรับแคชที่อาจเพิ่มในอนาคต)

> ตรวจเอกสาร `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md` ก่อนเขียน ถ้า signature ต่างจากนี้ให้ใช้ตามเอกสารเวอร์ชันนี้

- [ ] **Step 5: ตรวจด้วยมือ**

เปิด `/store` → แก้ราคาไอดีใน `/admin` → รีเฟรช `/store`
Expected: เห็นราคาใหม่ทันที (ไม่ต้อง redeploy)

- [ ] **Step 6: Checkpoint**

Run: `npm run build`
Expected: ผ่าน และไม่มี warning เรื่อง cache directive
