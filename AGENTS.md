<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# AGENTS.md — paphumshop

คู่มือสำหรับ AI Coding Agent ทุกตัวที่เข้ามาแก้โปรเจกต์นี้ อ่านจบแล้วลงมือได้เลย

---

## 1. Project Overview & Stack

**paphumshop** คือเว็บร้านขายไอดีเกม + หน้ารับงานออกแบบ (PAPhum Shop & Studio) ประกอบด้วย

- หน้าร้านสาธารณะ: `/` (landing), `/store` (แคตตาล็อกไอดี), `/id/[code]` (รายละเอียด + เครื่องคำนวณผ่อน), `/banners` (ผลงาน), `/banners/[slug]`, `/deliver/[token]` (ลิงก์ส่งงานส่วนตัว)
- หลังบ้าน: `/admin` (owner/staff) — จัดการไอดี, หมวดผลงาน, แบนเนอร์, PIN
- Route Handlers: `src/app/api/admin/**` (accounts, banners, banner-categories, pin, upload/presign) และ `src/app/api/deliver/[token]/download`

**Stack**

| ชั้น | เทคโนโลยี |
|---|---|
| Framework | Next.js **16.4.6** App Router (React 19.3.0) — อ่าน `node_modules/next/dist/docs/` ก่อนใช้ API ใด ๆ |
| ภาษา | TypeScript strict (`npx tsc --noEmit` ต้องผ่าน) |
| Styling | Tailwind CSS 4.3.3 (`@tailwindcss/turbopack`) |
| Icons | `lucide-react` เท่านั้น |
| Database/Auth | Supabase (Postgres + RLS + Auth) ผ่าน `@supabase/ssr` |
| Storage | Cloudflare R2 (`@aws-sdk/client-s3` + presigned URL) |
| Sync | Google Sheets ผ่าน Apps Script webhook (`GOOGLE_SHEETS_WEBHOOK_URL`) |
| Crypto | AES-256-GCM (`src/lib/crypto.ts`), TOTP (`src/lib/totp.ts`) |
| Test | Vitest 5 (`tests/lib/*.test.ts`) |

**โครงสร้างสำคัญ**

```
src/app/            # routes + API
src/components/     # UI (admin/, store/, banners/)
src/lib/            # crypto, r2, installment, sheets-sync, image-processor, supabase/
src/types/          # database.ts (AccountStatus = PascalCase)
supabase/migrations/DB.md               # ⭐ ความจริงของ production (145 บรรทัด)
supabase/migrations/001_initial_schema.sql  # เอกสารประวัติ — ห้ามใช้สร้าง DB ใหม่
docs/               # เอกสาร 00–06 (ต้องอ่านก่อนแก้โค้ด)
```

---

## 2. Database Reality Check

> **สรุปสั้น: ตาราง View และ RLS ถูกสร้างและใช้งานจริงบน production แล้ว ห้ามสร้างซ้ำ ห้าม drop และห้ามรัน `001_initial_schema.sql`**

**แหล่งความจริง:** `supabase/migrations/DB.md` (ผล dump `information_schema.columns` + `information_schema.views` + `pg_policies` จาก production วันที่ 18 พ.ย. 2026)

**ของจริงบน production = 8 ตาราง + 1 view**

| วัตถุ | ชนิด | หลักฐาน |
|---|---|---|
| `accounts` | TABLE (เก็บทั้งข้อมูลสาธารณะ + `*_enc` + `security_status`) | `DB.md:16-41` |
| `accounts_public` | **VIEW** — `select ... from accounts where status in ('Available','Installment','SoldOut')` | `DB.md:114-116` |
| `accounts_secret` | TABLE (มีอยู่ แต่ **ไม่มีโค้ดเรียก** — grep = 0) | `DB.md:56-67` |
| `admin_roles` | TABLE (`user_id, username, role, created_at`) | `DB.md:68-71` |
| `admin_security` | TABLE | `DB.md:72-75` |
| `banner_categories` | TABLE (มี `description`, `logo_url`, `icon_url`, `hide_preview`) | `DB.md:76-84` |
| `banners` | TABLE (มี `is_pinned`, `pin_order`, `category_ids uuid[]`) | `DB.md:85-93` |
| `deliveries` | TABLE | `DB.md:94-100` |
| `installment_settings` | TABLE | `DB.md:101-106` |

**RLS ที่มีจริง**

| ตาราง | สถานะ |
|---|---|
| `accounts` | owner-only ผ่าน `admin_roles` (`DB.md:129`) — **ห้ามแก้ให้หลวมลง** |
| `accounts_secret` | `true` สำหรับ authenticated (`DB.md:125`) |
| `admin_roles` | อ่าน role ของตัวเอง (`DB.md:126`) |
| `admin_security` | 2 policy ซ้ำ (`DB.md:127-128`) |
| `deliveries` | 4 policy รวม anon อ่าน `expires_at > now()` (`DB.md:131,133`) |
| `installment_settings` | มี owner policy (`DB.md:134`) แต่ถูกทำให้ไร้ผลด้วย policy `true` (`DB.md:136,137`) |
| `banners` / `banner_categories` | `true` สำหรับ authenticated (`DB.md:138-144`) |

**กฎเหล็กของงานฐานข้อมูล**

1. **ห้ามสร้าง migration ที่ `drop` หรือ `create` ตาราง/วิวที่มีอยู่แล้ว** — ใช้ `create table if not exists` / `add column if not exists` เท่านั้น
   โดยเฉพาะ **ห้ามสร้างตาราง `accounts` และ `admin_roles` ใหม่** เพราะมีอยู่จริงใน production (`DB.md:16-41`, `:68-71`)
2. **ห้าม drop view `accounts_public`** — หน้า `/store` และ `GET /api/admin/accounts` ใช้ view นี้
3. **ห้ามสร้าง policy บน `accounts_public`** — มันเป็น view ไม่ใช่ตาราง ให้บังคับสิทธิ์ที่ตารางฐาน `accounts`
4. **ห้ามใส่ `with (security_invoker = true)`** ใน view — จะทำให้ anon อ่านไม่ได้และหน้า `/store` ว่างทันที
5. **ห้ามเพิ่ม policy ให้ `anon` อ่าน `accounts`** — จะเปิดเผยคอลัมน์ `*_enc`
6. **ห้ามให้ `staff` อ่านตาราง `accounts`** — ให้อ่านผ่าน view เท่านั้น
7. **ค่า `status` เป็น PascalCase เท่านั้น**: `'Unavailable' | 'Available' | 'Installment' | 'SoldOut'` (`DB.md:18`, `src/types/database.ts:1`, `src/app/api/admin/accounts/route.ts:12-17`) — ห้ามแปลงเป็นตัวพิมพ์เล็ก
8. **ก่อนวาง policy ใหม่ ต้อง `drop policy` ให้ครบทุกชื่อเดิม** (production มีชื่อซ้ำจากการรัน SQL ทับ) — รายการครบอยู่ใน `docs/05-database-normalize-and-optimize.md` §5.7
9. **งาน schema ใหม่ใช้ไฟล์ `003_*.sql` ขึ้นไป** และต้องรันบน staging/local ก่อน — ห้ามรันกับ production ตรง ๆ
10. `DB.md` เป็น **ไฟล์ dump ผลลัพธ์** ไม่ใช่ migration ที่รันได้ — ห้ามเอาไป execute

---

## 3. Mandatory Reading Before Coding

**ต้องอ่านก่อนแก้โค้ดทุกครั้ง (ไม่ใช่แค่เปิดผ่าน)**

1. `docs/00-overview-architecture.md` — สถาปัตยกรรม, routing, auth flow, สถานะปัจจุบัน
2. เอกสารฟีเจอร์ที่เกี่ยวข้อง:

| จะแก้อะไร | ต้องอ่าน |
|---|---|
| `/store`, `/id/[code]`, เครื่องคำนวณผ่อน, `accounts` | `docs/01-feature-store-and-installment.md` |
| `/banners`, banner categories, `/deliver`, R2 upload/download | `docs/02-feature-banners-and-delivery.md` |
| `/admin`, PIN, role, Google Sheets sync | `docs/03-feature-admin-and-sync.md` |
| Auth guard, RLS, secret, อัปโหลด | `docs/04-security-audit.md` |
| SQL, migration, RLS, index, schema | `docs/05-database-normalize-and-optimize.md` |
| ฟีเจอร์ใหม่, แผนงาน, ลำดับความสำคัญ | `docs/06-roadmap-and-new-features.md` |

3. ก่อนใช้ API ของ Next.js 16 ให้เปิด `node_modules/next/dist/docs/` ในหัวข้อที่เกี่ยวข้อง — API เปลี่ยนจากเวอร์ชันรุ่นก่อน
4. ถ้าเอกสารขัดกับโค้ด ให้ยึด **production + `DB.md` + โค้ดที่รันอยู่** และแก้เอกสารให้ตรงในงานเดียวกัน

---

## 4. UI & Design System Rules

**Dark theme เท่านั้น** — โทนหลักที่ต้องใช้คือ `#0A0A0D` (พื้นหลัง), `#111216` (การ์ด/surface), `#93C5FD` (สีเน้น) และใช้ hex ชุดนี้เท่านั้น (มีอยู่จริงในโค้ด)

| บทบาท | สี |
|---|---|
| พื้นหลังหลัก | `#090B10` |
| พื้นหลังเข้มสุด / hero | `#0A0A0D` |
| การ์ด / surface | `#111216` |
| surface ยกขึ้น / modal | `#12141C` |
| สีเน้น (accent, CTA, active, focus ring) | `#93C5FD` |
| ตัวอักษรหลัก | `#F1F5F9` (ใช้ opacity ลดหลั่นแทนสีเทาใหม่) |

**ไอคอน**

- ใช้ `lucide-react` เท่านั้น — ห้าม import ชุดอื่น, ห้าม inline SVG ที่ไม่จำเป็น
- **ห้ามใส่ Emoji ในโค้ดหรือข้อความ UI เด็ดขาด** — รวมถึงเครื่องหมายถูก ดาวเตือน ไฟ หรือไอคอนที่พิมพ์เป็นตัวอักษร ใน label, ปุ่ม, toast, empty state
- ไอคอนที่ใช้กับข้อความให้มี `aria-hidden` และขนาดสม่ำเสมอ (14/16/18/20px)

**ข้อความบนหน้าเว็บ**

- สั้น กระชับ เป็นธรรมชาติแบบร้านขายไอดีเกมจริง เช่น "พร้อมขาย", "ติดผ่อน", "ขายแล้ว", "ดาวน์เริ่ม 1,000"
- ห้ามคำบรรยายยืดยาว ห้ามประโยคการตลาดเกินจำเป็น ห้าม paraphrase ข้อมูลซ้ำในหน้าเดียว
- ศัพท์คงที่: `ไอดี`, `ราคา`, `ดาวน์`, `ผ่อนรายสัปดาห์`, `ผ่อนรายเดือน`, `รับประกัน`, `ส่งงาน`
- ภาษาไทยเป็นหลัก ไม่ผสมอังกฤษโดยไม่จำเป็น (ศัพท์เทคนิค เช่น PIN, WebP ใช้ได้)

**รูปแบบ**

- มุมโค้งและระยะห่างใช้ค่าที่มีใน component เดิม (ไม่สร้าง design token ใหม่)
- Mobile-first — หน้า `/store` และ `/id/[code]` ต้องใช้งานได้ที่ 375px
- ปุ่มที่กำลังทำงานต้อง disabled + สื่อสถานะด้วยข้อความ ไม่ใช่แค่สี
- รูปสินค้าใช้ `next/image` หรือ `<img>` ที่มี `loading="lazy"` + `alt` ที่อธิบายจริง

---

## 5. Security & Critical Rules

**ข้อมูลลับ — อยู่ฝั่ง server เท่านั้น**

- `ENCRYPTION_SECRET_KEY` ใช้ได้เฉพาะ `src/lib/crypto.ts` และโค้ดที่รันบน server — **ห้าม import `crypto.ts` เข้า Client Component**
- **ห้ามใช้ `SUPABASE_SERVICE_ROLE_KEY` ฝั่ง Client โดยเด็ดขาด** และห้ามให้ `R2_SECRET_ACCESS_KEY`, `R2_ACCESS_KEY_ID`, `GOOGLE_SHEETS_WEBHOOK_SECRET` ปรากฏใน client bundle, response, log หรือ error message
- env ที่ขึ้นต้น `NEXT_PUBLIC_` เท่านั้นที่ส่งไป client ได้ (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_R2_PUBLIC_URL`)
- ห้าม `console.log` ค่า secret, plaintext password, ciphertext หรือ token — โปรเจกต์นี้ตั้งใจไม่มี `console.*` ใน `src/`

**API หลังบ้าน `src/app/api/admin/**` ต้องตรวจ 3 ชั้นตามสิทธิ์**

1. **Session** — `supabase.auth.getUser()` ต้องได้ user (401 ถ้าไม่มี)
2. **Role** — query `admin_roles` ตาม `user_id`; ต้องมีแถวจึงเป็นแอดมิน; งานที่แตะ secret/ต้นทุน/ลบข้อมูลต้องเป็น `role = 'owner'` (403)
3. **PIN** — route ที่อ่าน/เขียนข้อมูลลับต้องเช็ก cookie `paphum_admin_pin_ok` ว่ามีค่าเท่ากับ `user.id`

```ts
// ลำดับที่ถูกต้อง — ห้ามสลับ ห้ามข้าม
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const { data: role } = await supabase.from('admin_roles').select('role').eq('user_id', user.id).maybeSingle();
if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
if (ownerOnly && role.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
if (needsPin && (await cookies()).get('paphum_admin_pin_ok')?.value !== user.id)
  return NextResponse.json({ error: 'ต้องปลดล็อก PIN' }, { status: 403 });
```

- **ห้ามลอก pattern ที่ยังไม่มีการตรวจ role/PIN** — ปัจจุบัน `api/admin/banners`, `banner-categories`, `upload/presign` ตรวจแค่ session (ช่องโหว่ H-5 ใน `docs/04`) ถ้าแก้ route เหล่านี้ **ต้องเพิ่ม role + PIN** ไม่ใช่ทำตามของเดิม
- `requireOwner` / `isPinUnlocked` มีอยู่แล้วใน `src/app/api/admin/accounts/route.ts` — ควรย้ายเป็น helper กลาง `src/lib/auth/guard.ts` แล้วใช้ร่วมกัน (ห้าม copy ซ้ำหลายไฟล์)
- response ที่มีข้อมูลลับหรือข้อมูลหลังบ้าน (เช่น `GET /api/admin/accounts/[id]`) **ต้องมี `Cache-Control: no-store`** ทุกครั้ง
- ห้ามคืน `cost`, `*_enc`, `private_notes` หรือ ciphertext ให้ client ที่ไม่ผ่าน owner + PIN
- PIN เก็บเป็น hash + salt (scrypt) — ห้ามเก็บ plaintext และห้ามเทียบด้วย `===` (ใช้ `timingSafeEqual`)

**รูปภาพ**

- แปลงเป็น **WebP ฝั่ง client** ด้วย `processImageToWebP` (`src/lib/image-processor.ts`) ก่อนอัปโหลดเสมอ — quality 0.88, maxWidth 1600
- อัปโหลดผ่าน **Presigned URL ของ R2** (`src/app/api/admin/upload/presign/route.ts` → PUT ตรงไป R2) — ห้ามส่งไฟล์ binary ผ่าน Next route handler
- ฝั่ง presign ต้องตรวจ: session + role + PIN, `contentType` ต้องเป็น `image/webp` (หรือ image ที่อนุญาต), จำกัดขนาด, และ sanitize `folder`/extension
- URL รูปที่บันทึกลง DB ต้องเป็น host ของ `R2_PUBLIC_URL` และเป็น `https:` เท่านั้น

**ข้อมูลลับของไอดี**

- เก็บด้วย `encryptSecret()` (AES-256-GCM, IV 12 bytes สุ่มใหม่ทุกครั้ง) — ห้ามเขียน plaintext ลง DB, Sheets, log หรือ URL
- Google Sheets sync ต้องไม่ส่งรหัสผ่าน/seed และต้องแนบ `GOOGLE_SHEETS_WEBHOOK_SECRET`
- `deliveries.token` ต้องสุ่มด้วย `crypto.randomBytes` (128 บิตขึ้นไป) — ห้ามใช้ `Math.random()` หรือ code ที่เดาได้

---

## 6. Verification Commands

รันตามลำดับนี้หลังแก้โค้ด **ทุกครั้ง** ก่อนรายงานว่างานเสร็จ

```bash
npx tsc --noEmit      # gate — ต้องไม่มี error (โปรเจกต์ใช้ strict)
npm run build         # gate — ต้อง build ผ่าน ไม่มี error
npm run lint          # ต้องไม่เพิ่ม error ใหม่ (มี error เดิมอยู่ — ดูหมายเหตุ)
npx vitest run        # ถ้าแก้ src/lib/crypto|r2|installment หรือ tests/
```

**หมายเหตุ**

- `package.json` **ไม่มี** script `test` / `typecheck` — ห้าม invent คำสั่งใหม่ ใช้สี่คำสั่งข้างบน
- `npm run lint` **ยังไม่ผ่าน 100%** ณ วันที่เขียนไฟล์นี้: มี error เดิมจาก `react-hooks/set-state-in-effect`, `react-hooks/purity` และไฟล์ tooling ใต้ `.opencode/skills/**` → ห้ามถือว่าเป็นความผิดของงานที่ทำ และ **ห้ามแก้ไฟล์ใน `.opencode/`** เพื่อให้ lint ผ่าน
- เกณฑ์ที่ใช้ตัดสินคือ `npx tsc --noEmit` + `npm run build` ผ่าน และจำนวน lint error ในไฟล์ที่แก้ต้องไม่เพิ่ม
- `npx vitest run` ใช้ได้โดยไม่ต้องมี config เพราะ test import ด้วย relative path
- ถ้า `npm run build` ล้มเหลวจาก env ที่ขาด ให้ระบุชื่อ key ที่ขาดในรายงาน ห้ามใส่ค่าจริงลงไฟล์หรือ commit
- งานที่แตะ DB ต้องรายงานด้วยว่าได้ตรวจ `supabase/migrations/DB.md` แล้ว และ migration ใหม่ไม่ทับของเดิม

**Definition of Done**

- [ ] `npx tsc --noEmit` ผ่าน
- [ ] `npm run build` ผ่าน
- [ ] ไม่มี lint error ใหม่ในไฟล์ที่แก้
- [ ] ไม่มี secret หลุดไป client / log / response
- [ ] admin route ที่แก้มีการตรวจ session + role + PIN ครบ
- [ ] ไม่มี Emoji ในโค้ดหรือข้อความ UI, ไอคอนมาจาก `lucide-react`
- [ ] สถานะไอดีเป็น PascalCase และไม่แตะ/สร้างตารางหรือ view ซ้ำ
- [ ] เอกสารใน `docs/` ที่เกี่ยวข้องถูกอัปเดตให้ตรงกับสิ่งที่แก้
