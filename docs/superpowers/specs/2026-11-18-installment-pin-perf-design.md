# ดีไซน์: ค่าผ่อนตรงกันทั้งระบบ + PIN 30 วัน + Rate limit ใน DB + เร่งความเร็วหน้าเว็บ

- วันที่: 18 พ.ย. 2026
- ขอบเขต: 4 งาน (ผู้ใช้เลือกแล้ว: 3.1-A, PIN-A1, B1, C2)
- สถานะ: รออนุมัติก่อนลงโค้ด

> หมายเหตุ: โปรเจกต์นี้ยังไม่เป็น git repo ไฟล์นี้จึงยังไม่ถูก commit

---

## 1. ที่มาและเหตุผล

1. ผู้ใช้แก้ "จำนวนฟรีดอก" ในหน้า `/admin` แล้วหน้า `/store` และ `/id/[code]` ไม่เปลี่ยนตาม
2. ผู้ใช้ต้องการกรอก PIN ครั้งเดียวแล้วใช้ได้ 1 เดือน (ปัจจุบัน 1 ชั่วโมง)
3. เว็บอืดเมื่อมีไอดี/ผลงานเยอะ และต้องการ lazy load รูป

---

## 2. สาเหตุที่ตรวจพบ (หลักฐานในโค้ด)

| # | อาการ | สาเหตุ | หลักฐาน |
|---|---|---|---|
| 1 | หน้า "ตั้งค่าผ่อน" มีช่องปลอดดอก/ดาวน์ขั้นต่ำที่แก้แล้วไม่มีผล | ทั้งสองค่าเป็นของ **รายไอดี** ไม่ใช่ค่ากลางของร้าน แต่ UI หลังบ้านเปิดให้แก้และไม่มีโค้ดอ่านค่านั้น | `src/components/admin/AdminDashboardClient.tsx` (แท็บตั้งค่าผ่อน), `src/app/api/admin/settings/route.ts:9-10` |
| 2 | ค่าฟรีดอกที่กรอกในฟอร์มไอดีถูกทิ้ง | `POST/PATCH /api/admin/accounts` เขียนทับด้วยค่าคงที่จากราคา (2 สัปดาห์ / 1 เดือน) | `src/app/api/admin/accounts/route.ts:119-121`, `src/app/api/admin/accounts/[id]/route.ts:201-205` |
| 3 | แก้ `weekly_interest_rate/monthly_interest_rate` แล้วยอดผ่อนไม่เปลี่ยน | `calculateInstallmentPlan` ใช้ค่าคงที่จาก lib | `src/lib/installment.ts:3-4, 97` |
| 4 | การ์ด `/store` ไม่แสดง "ดาวน์เริ่ม" ของบางไอดี | เป็นพฤติกรรมที่ถูกต้องเมื่อไอดีนั้นไม่ตั้งค่าดาวน์ของโหมดนั้น (เช่นไอดีรายสัปดาห์มี `min_down_monthly = 0`) — **ไม่ต้องแก้** | `src/components/AccountCatalogClient.tsx:260` |
| 5 | PIN หมดอายุเร็ว | ค่าคงที่ 1 ชั่วโมง | `src/lib/pin-token.ts:4` |
| 6 | ล็อก PIN ถูก bypass ได้ | ตัวนับอยู่ใน memory ของแต่ละ instance | `src/lib/rate-limit.ts:6` |

**สรุป:** ค่าที่เป็น "รายไอดี" (ปลอดดอก, ดาวน์ขั้นต่ำ) ถูกทำให้ดูเหมือน "ค่ากลางของร้าน" และ API เขียนทับค่าที่กรอก → ต้องแยกให้ชัด: ตั้งค่าผ่อนเหลือแค่ดอกเบี้ย ส่วนที่เหลือกรอกและบันทึกเป็นรายไอดี

### 2.1 ผลตรวจข้อมูล production (18 พ.ย. 2026 — อ่านอย่างเดียว ไม่แก้ข้อมูล)

| สิ่งที่ตรวจ | ผล | ความหมาย |
|---|---|---|
| `anon` อ่านตาราง `accounts` | ได้ **0 แถว** (ไม่มี error) | RLS เปิดอยู่ และ policy เป็น owner-only จริง |
| `anon` อ่าน view `accounts_public` | ได้แถวปกติ | view ใช้งานได้ตามที่ออกแบบ |
| แถว `installment_settings` | **มี 1 แถว** (140 / 600 / 1000 / 2000 / 2 / 1) | ค่าเริ่มต้นครบ ไม่ต้อง seed |
| host ของรูปทั้งหมด (1,032 URL) | `pub-….r2.dev` **host เดียว** ตรงกับ `R2_PUBLIC_URL` | ใช้ `next/image` ได้ ไม่ต้องมี pattern อื่น |
| `PIN_TOKEN_SECRET` | ตั้งไว้แล้ว | ไม่ต้องพึ่ง fallback จาก `ENCRYPTION_SECRET_KEY` |

**บั๊กที่ตรวจพบเพิ่ม (สำคัญ):** `src/app/id/[code]/page.tsx:24` อ่าน **ตารางฐาน `accounts`** ด้วย client ของผู้เยี่ยมชม แต่ RLS อนุญาตเฉพาะ owner → **ผู้เยี่ยมชมทั่วไปเปิดหน้าไอดีได้ 0 แถวและเจอ 404** หน้า `/store` ไม่กระทบเพราะใช้ view อยู่แล้ว

→ เพิ่มงานในรอบนี้: เปลี่ยนหน้า `/id/[code]` ไปอ่าน `accounts_public` (view มีคอลัมน์ครบทั้ง 14 ที่หน้านี้ใช้อยู่แล้ว — `DB.md:116`) ไม่ต้องแตะ RLS

---

## 3. เป้าหมาย / ไม่ใช่เป้าหมาย / สิ่งที่ถือว่าล้มเหลว

**เป้าหมาย**

- แก้ค่าในหลังบ้านแล้วหน้าเว็บเปลี่ยนตามทันที: ดอกเบี้ย, จำนวนงวดฟรีดอก, ดาวน์ขั้นต่ำเริ่มต้น
- PIN กรอกครั้งเดียวอยู่ 30 วัน และเพิกถอนได้ทันทีเมื่อเปลี่ยน PIN / กดล็อก / ออกจากระบบ
- ตัวนับ PIN ผิดนับรวมทุก instance
- `/store` และ `/banners` เร็วขึ้นเมื่อข้อมูลเยอะ และรูปไม่ถูกโหลดทั้งหมดพร้อมกัน

**ไม่ใช่เป้าหมายรอบนี้**

- ไม่แก้ RLS บน production (งานแยก ต้องทำบน staging)
- ไม่ทำ server-side pagination/search เต็มรูปแบบ (C3)
- ไม่ลบคอลัมน์ `default_free_*` / `default_min_down_*` ใน DB (แค่เลิกใช้)
- ไม่แตะตาราง `accounts` หรือ view `accounts_public` ในทางโครงสร้าง

**ถือว่าล้มเหลวถ้า**

- ตัวเลขบนหน้าเว็บไม่ตรงกับค่าที่แอดมินตั้งไว้
- แอดมินบันทึกแล้วหน้าเว็บยังแสดงค่าเก่าเพราะแคชค้าง
- PIN 30 วันทำให้คนที่ไม่มีสิทธิ์เข้าถึง secret ได้โดยไม่ต้องมี Supabase session

---

## 4. ทางเลือกที่พิจารณาและที่เลือก

| เรื่อง | ทางเลือก | เลือก | เหตุผล |
|---|---|---|---|
| ดอกเบี้ย | A: ส่ง rate จาก settings เข้า lib / B: ซ่อนช่องในหลังบ้าน | **A** | ของพร้อมอยู่แล้ว การซ่อนคือถอย |
| ปลอดดอก + ดาวน์ขั้นต่ำ | D1: ต่อไอดี / D2: ค่าหลังบ้าน / D3: ผสม | **D1** | ผู้ใช้ยืนยันว่าแต่ละไอดีไม่เท่ากัน ต้องกรอกเองทุกไอดี |
| PIN | A1: 30 วันคงที่ / A2: 30 วัน + ขอซ้ำตอนอันตราย / A3: sliding | **A1** | ผู้ใช้ต้องการไม่ต้องกรอกบ่อย |
| Rate limit | B1: ตารางใน DB / B2: คงใน memory | **B1** | นับรวมทุก instance จริง |
| ความเร็ว | C1: quick wins / C2: C1 + cache / C3: + RPC/pagination | **C2** | คุ้มสุดต่อเวลา และคุมความเสี่ยงแคชค้างได้ด้วย tag |

---

## 5. สิ่งที่จะสร้าง

### 5.1 แหล่งความจริงของค่าผ่อน (แก้บั๊กที่ผู้ใช้เจอ)

**กติกาที่จะใช้**

| ค่า | ที่เก็บ | หมายเหตุ |
|---|---|---|
| ดอกเบี้ย/งวด | `installment_settings.weekly_interest_rate` / `monthly_interest_rate` | ค่าเดียวกันทั้งร้าน (140 / 600) |
| จำนวนงวดฟรีดอก | `accounts.interest_free_weeks` / `interest_free_months` | **ต่อไอดี** กรอกในฟอร์มไอดี |
| ดาวน์ขั้นต่ำ | `accounts.min_down_weekly` / `min_down_monthly` | **ต่อไอดี** กรอกในฟอร์มไอดี |

**หน้า "ตั้งค่าผ่อน" ของหลังบ้านจะเหลือเฉพาะ 2 ช่องดอกเบี้ย** — เอาช่องปลอดดอกและดาวน์ขั้นต่ำออก เพราะไม่ใช่ค่ากลางของร้าน
คอลัมน์ `default_free_weeks/months` และ `default_min_down_weekly/monthly` ใน DB ยังอยู่ แต่จะไม่มีโค้ดอ่าน (คงไว้เพื่อความเข้ากันได้ ไม่ drop)

**ผลกับข้อมูลปัจจุบัน (ตรวจแล้ว):** มี 1 ไอดี (PM0204, ราคา 3,790 → รายสัปดาห์) มี `min_down_monthly = 0` และ `interest_free_months = 0` ซึ่งถูกต้องเพราะเป็นค่าของโหมดที่ไม่ได้ใช้ → **ห้ามใส่ fallback ที่เดาแทนผู้ใช้** ค่า 0 ต้องแสดงตามจริง

**โค้ดที่จะแก้**

1. `src/lib/installment.ts`
   - เพิ่ม optional `weeklyRate`, `monthlyRate` ใน `InstallmentInput`
   - `calculateInstallmentPlan` ใช้ค่าที่ส่งมา ถ้าไม่ส่งใช้ค่าคงที่เดิม → เทสเดิมไม่พัง
2. `src/components/AccountDetailClient.tsx`
   - `freePeriods` และ `minDown` มาจากคอลัมน์ของไอดีตามเดิม (ถูกอยู่แล้ว)
   - เปลี่ยนเฉพาะการส่ง rate จาก settings เข้า `calculateInstallmentPlan`
3. `src/components/admin/AdminDashboardClient.tsx`
   - เอาช่อง "ปลอดดอก" และ "ดาวน์ขั้นต่ำ" ออกจากหน้า "ตั้งค่าผ่อน" เหลือ 2 ช่องดอกเบี้ย
4. `src/components/admin/AccountFormModal.tsx`
   - คงช่องปลอดดอก/ดาวน์ขั้นต่ำต่อไอดีไว้ **และต้องบันทึกได้จริง**
5. `src/app/api/admin/accounts/route.ts` + `[id]/route.ts`
   - เลิก derive `interest_free_weeks/months` จากราคา → บันทึกค่าที่ฟอร์มส่งมา
   - `min_down_*` บันทึกจากฟอร์มอยู่แล้ว
6. `src/app/api/admin/settings/route.ts`
   - รับเฉพาะ `weekly_interest_rate`, `monthly_interest_rate`
7. `src/components/admin/ScheduleGeneratorModal.tsx` + `AdminDashboardClient.tsx`
   - ใช้ค่าดาวน์/ฟรีดอกของไอดีนั้นตรง ๆ (ไม่ fallback ไป settings ที่จะไม่มีแล้ว)
8. `src/app/store/page.tsx` + `AccountCatalogClient.tsx`
   - ยังใช้ `min_down_*` ของไอดี; ถ้าเป็น 0 ให้ซ่อนบรรทัด "ดาวน์เริ่ม" ตามเดิม
9. `src/app/id/[code]/page.tsx`
   - เปลี่ยน query จากตาราง `accounts` เป็น view `accounts_public` (แก้บั๊ก 404 ของผู้เยี่ยมชม — §2.1)
10. `src/app/api/admin/settings/route.ts`
    - ถ้า UPDATE ไม่โดนแถว (`data` เป็น null) ให้ตอบ error ว่า "ยังไม่มีแถวตั้งค่า" แทนการตอบ `ok: true` หลอก ๆ (ตอนนี้ production มีแถวอยู่ แต่กันพลาด)

**ผลข้างเคียงที่ยอมรับ:** ค่าที่เคยอยู่ใน `default_free_*` / `default_min_down_*` จะไม่ถูกใช้จากที่ใดอีก แต่ไม่ลบคลัมน์ เพื่อกันข้อมูลหายและให้ย้อนกลับได้ง่าย

### 5.2 PIN อายุ 30 วัน

- `src/lib/pin-token.ts`: `PIN_SESSION_SECONDS = 60 * 60 * 24 * 30`
- คุกกี้ยังเป็น `httpOnly`, `sameSite: 'strict'`, `secure` ใน production, `maxAge` เท่ากับค่าคงที่เดียวกัน
- การเพิกถอนยังทำงานทันทีผ่าน `pin_version` (hash ของ `pin_salt`) เมื่อเปลี่ยน PIN, กดล็อก, ออกจากระบบ
- ไม่ทำ sliding expiry ในรอบนี้
- **ข้อจำกัดที่ต้องรู้:** อายุจริงอาจสั้นกว่า 30 วันถ้า Supabase session หมดก่อน — การตั้งค่า JWT/refresh token อยู่ใน Supabase console ไม่ใช่โค้ด
- จะแสดงผลว่า "ปลดล็อกแล้ว" ตามจริงจาก `GET /api/admin/pin` (มีอยู่แล้ว)

### 5.3 Rate limit ของ PIN เก็บใน DB

**Migration `003_pin_attempts_and_perf_indexes.sql`**

```sql
create table if not exists public.pin_attempts (
  id bigint generated always as identity primary key,
  attempt_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pin_attempts_key_created
  on public.pin_attempts (attempt_key, created_at desc);

alter table public.pin_attempts enable row level security;
-- ไม่สร้าง policy ใด ๆ: เข้าถึงได้เฉพาะ service role ฝั่ง server
```

**โค้ด**

- `src/lib/rate-limit.ts` เปลี่ยนจาก `Map` เป็นฟังก์ชัน async ที่รับ service-role client
- ลำดับ: ลบแถวที่เก่ากว่าหน้าต่างเวลา → นับแถวของ key → ถ้านับได้ ≥ limit คืน 429 พร้อม `Retry-After` → ถ้าผ่าน บันทึกแถวใหม่
- บันทึกก่อนอนุญาต (insert-then-check) เพื่อลดช่องว่างจากการแข่งกันของ request พร้อมกัน
- เมื่อ PIN ถูกต้อง ลบแถวของ key นั้น (แทน `resetRateLimit` เดิม)
- ถ้าเขียน DB ไม่ได้ → ปฏิเสธ (fail closed) เพราะถ้า DB ใช้งานได้ `admin_security` ก็ทำงาน ถ้าไม่ได้ user ก็ล็อกอินไม่ได้อยู่แล้ว
- ใช้ key เดิม: `pin:user:<userId>:<ip>` (5 ครั้ง/15 นาที) และ `pin:ip:<ip>` (20 ครั้ง/15 นาที)
- ลบข้อมูลเก่าเป็นรอบ ๆ ด้วยเงื่อนไข `created_at < now() - interval '1 day'` ในคำสั่งเดียวกับตอนนับ
- **ไม่แตะ** `rate-limit.ts` เดิม เพราะ `api/deliver/[token]/download` ยังใช้ตัวนับใน memory อยู่ (งานนั้นแยกทีหลัง) — ของ PIN ใช้โมดูลใหม่ `src/lib/pin-attempts.ts`

### 5.4 เปลี่ยน `error.message` ของ DB เป็นข้อความกลาง (22 จุด)

- เพิ่ม `src/lib/logger.ts` — log ฝั่ง server เป็น JSON บรรทัดเดียว, ใส่ `context`, `code`, `message`, `requestId` และ redact key ที่ขึ้นต้นด้วย `pin`, `password`, `secret`, `token`, `key`
- เพิ่ม `src/lib/api-error.ts`
  - `respondDbError(context, error, status = 400)` → log รายละเอียด แล้วคืน `{ error: 'บันทึกข้อมูลไม่สำเร็จ' }` + `no-store`
  - ข้อความ validation ที่เราเขียนเอง (400) คงไว้ตามเดิม
- แทนที่ทุกจุดที่คืน `error.message`: `banners` 8, `banner-categories` 4, `accounts` 3, `accounts/[id]` 3, `settings` 2, `pin` 2
- ห้าม log ค่า secret/plaintext ตามกฎใน `AGENTS.md` §5

### 5.5 บังคับ PIN ตอนเปลี่ยนสถานะเป็นติดผ่อน/ขายแล้ว

- `PATCH /api/admin/accounts/[id]` กรณี `quickStatusOnly`
  - ถ้าสถานะปลายทางเป็น `Installment` หรือ `SoldOut` → ต้อง `isPinUnlocked()` (403 ถ้าไม่)
  - สถานะอื่น (`Available`, `Unavailable`) ยังเปลี่ยนได้โดยไม่ต้อง PIN
- ไม่เพิ่มความลำบาก เพราะ PIN อยู่ 30 วันแล้ว
- ไม่ทำ audit log ในรอบนี้ (ยังไม่มีตาราง) — บันทึกเป็นงานถัดไป

### 5.6 ความเร็ว: cache + รูป

**a) แคชข้อมูลสาธารณะ**

- เพิ่ม `src/lib/supabase/public.ts` — client แบบ anon key ที่ไม่ผูก cookies (ใช้ได้ใน `'use cache'` เพราะไม่แตะ dynamic API)
- `src/app/store/page.tsx`
  - ย้าย query ไปฟังก์ชัน `getStoreData()` ที่มี `'use cache'`, `cacheLife('minutes')`, `cacheTag('accounts', 'settings')`
  - `select` เฉพาะคอลัมน์ที่ใช้จริง (ไม่ใช้ `*`)
  - `connection()` ยังอยู่ที่ component ตามเดิม
- `src/app/banners/page.tsx`
  - ย้าย query ไป `getBannerSections()` ที่มี `'use cache'`, `cacheLife('minutes')`, `cacheTag('banners', 'categories')`
- `revalidateTag` หลัง mutation:
  - accounts POST/PATCH/DELETE → `accounts`
  - banners POST/PATCH/DELETE → `banners`
  - banner-categories → `categories` + `banners`
  - settings → `settings` (และ `accounts` เพราะการ์ดใช้ค่าดาวน์เริ่มต้น)
- ห้ามใส่ `'use cache'` ในฟังก์ชันที่อ่าน cookies/session

**b) รูป**

- `next.config.ts`: เพิ่ม `images.remotePatterns` สำหรับ host ของ `R2_PUBLIC_URL` (https เท่านั้น)
  - ตรวจแล้วว่ารูปทั้ง 1,032 URL อยู่ host เดียวกัน (§2.1) จึงใช้ pattern เดียวพอ
  - ต้องมี `R2_PUBLIC_URL` ใน environment ตอน build ด้วย (ไม่ใช่แค่ runtime) ไม่งั้น `remotePatterns` ว่างและรูปจะพัง
  - เพิ่ม `env: { NEXT_PUBLIC_R2_PUBLIC_URL: process.env.R2_PUBLIC_URL }` เพื่อให้ฝั่ง client รู้ว่า URL ไหน optimize ได้ (เป็น URL สาธารณะ ไม่ใช่ secret) แล้วทำคอมโพเนนต์ `SmartImage` ที่ถอยไปใช้ `<img>` เมื่อ host ไม่ตรง
  - ย้าย `sharp` จาก `devDependencies` ไป `dependencies` เพื่อให้ image optimization ทำงานบนเครื่องที่ self-host
- เปลี่ยน `<img>` เป็น `next/image` ใน: การ์ด `/store`, กริด/แครอเซลของ `/banners`, แกลเลอรีในหน้าไอดี
  - ใส่ `sizes` ให้ตรงเลย์เอาต์ (การ์ด ~50vw/33vw/25vw, แครอเซลตามความกว้างจริง)
  - รูปแรกที่เห็นทันทีใช้ `priority`; ที่เหลือ lazy โดย default ของ `next/image`
  - คง `loading="lazy"` + `decoding="async"` สำหรับรูปที่ไม่ได้ใช้ `next/image` (เช่นใน lightbox)
- ทางถอยถ้าโควตาการ optimize ไม่พอ: ใช้ `loader` ชี้ไป Cloudflare Image Resizing ของโดเมน R2 (บันทึกเป็นตัวเลือก ไม่ทำรอบนี้)

**c) สิ่งที่ยังไม่ทำ**

- server-side pagination/search ของ `/store` (C3)
- RPC รวม query ของ `/banners` (C3)

### 5.7 Migration 003 — index สำหรับ performance

```sql
-- รันนอก transaction (ใช้ concurrently)
create index concurrently if not exists idx_accounts_status_created
  on public.accounts (status, created_at desc);

create index concurrently if not exists idx_banners_public_pin
  on public.banners (is_public, is_pinned desc, pin_order, created_at desc);

create index concurrently if not exists idx_banners_category_ids
  on public.banners using gin (category_ids);

create index concurrently if not exists idx_deliveries_expires
  on public.deliveries (expires_at);
```

- ทุกคำสั่งใช้ `if not exists` และไม่ drop/alter ตารางหรือ view ที่มีอยู่
- `create index concurrently` รันใน transaction ไม่ได้ → ต้องรันทีละคำสั่ง
- ต้องรันบน staging ก่อน production และควรทำนอกเวลาใช้งาน

---

## 6. งานทดสอบและเครื่องมือ

- ติดตั้ง `vite` เป็น devDependency เพื่อให้ `npx vitest run` ใช้ได้จริง (ตอนนี้ล้มเพราะหา `vite` ไม่เจอ) + `vitest.config.ts` แบบ `environment: 'node'`
- **ไม่เพิ่ม script ใหม่ใน `package.json`** เพราะ `AGENTS.md` §6 ห้ามสร้างคำสั่งใหม่ — ใช้ `npx vitest run` / `npx tsc --noEmit` ตามเดิม
- เทสใหม่:
  - `calculateInstallmentPlan` รับ rate ที่ส่งมา และยังให้ผลเดิมเมื่อไม่ส่ง
  - ฟังก์ชันเลือกค่า (rate/free/down) คืนค่าตามลำดับความสำคัญ
- เกตเดิมต้องผ่าน: `npx tsc --noEmit`, `npm run build`, และ lint error ต้องไม่เพิ่มจาก baseline 15

---

## 7. สิ่งที่ตัดออกและเหตุผล

| เรื่อง | เหตุผล |
|---|---|
| ค่าผลกลางของปลอดดอก/ดาวน์ | ผู้ใช้ยืนยันว่าแต่ละไอดีไม่เท่ากัน จึงไม่ควรมีค่ากลาง (คลัมน์เดิมคงไว้แต่เลิกใช้) |
| Rate limit ของลิงก์ส่งงาน (`/deliver`) | คนละงาน ต้องใช้ตาราง/IP และไม่เกี่ยวกับ PIN |
| Audit log | ต้องมีตารางใหม่และ helper ทั้งระบบ — งานแยก |
| ลบ policy anon ของ `deliveries` / RLS hardening | เป็นงาน DB ที่ต้องทำบน staging และอยู่นอกขอบเขตที่ผู้ใช้เลือก |
| Server-side pagination + RPC | ผลตอบแทนสูงแต่ใช้เวลามากกว่า C2 หลายวัน |

---

## 8. เกณฑ์ตรวจรับ

1. ตั้ง `weekly_interest_rate = 200` แล้วตั้งฟรีดอกของไอดีเป็น 0 ในฟอร์มไอดี → หน้า `/id/<code>` ของไอดีราคา < 6,000 แสดง "ดอก 200.- / สัปดาห์" และยอด "ผ่อนงวดละ" เปลี่ยนตาม
2. ตั้ง `monthly_interest_rate = 700` → ไอดีราคา ≥ 6,000 แสดง 700
3. กรอกปลอดดอก 3 สัปดาห์ในฟอร์มไอดี → หน้าไอดีแสดง "ฟรีดอก 3 สัปดาห์" และคงอยู่หลังรีเฟรช (ค่าถูกบันทึกจริง)
4. หน้า "ตั้งค่าผ่อน" เหลือเพียง 2 ช่องดอกเบี้ย ไม่มีช่องปลอดดอก/ดาวน์ขั้นต่ำ
5. กรอก PIN ครั้งเดียว → ปิด/เปิดแท็บใหม่ยังปลดล็อก; เปลี่ยน PIN → ปลดล็อกหลุดทันที
6. ยิง PIN ผิด 6 ครั้ง → 429 และมีแถวใน `pin_attempts`
7. แอดมินแก้ราคา/สถานะ → หน้า `/store` เปลี่ยนภายในรอบแคชถัดไป (ไม่ต้องรอ deploy)
8. รูปในหน้า `/store` ส่ง `srcset` และรูปที่อยู่นอกจอไม่ถูกโหลดตอนเปิดหน้า
9. `npx tsc --noEmit` ผ่าน, `npm run build` ผ่าน, `npx vitest run` ผ่าน
10. เปิด `/id/<code>` ในหน้าต่างที่ยังไม่ล็อกอิน (หรือโหมดไม่ระบุตัวตน) แล้วเห็นหน้าไอดีปกติ ไม่ใช่ 404

---

## 9. ความเสี่ยงและมาตรการ

| ความเสี่ยง | มาตรการ |
|---|---|
| แคชค้างเพราะลืม `revalidateTag` ใน route ที่เพิ่มใหม่ | รวมการเรียกไว้ใน helper ต่อโดเมน + ใส่ใน Definition of Done ของ PR |
| `next/image` กับ R2 ตั้งค่าไม่ครบ ทำให้รูปไม่ขึ้น | ตรวจ `remotePatterns` จาก env จริงก่อน merge และทดสอบ build |
| PIN 30 วันบนเครื่องที่ใช้งานร่วมกัน | คงปุ่มล็อก + เพิกถอนเมื่อเปลี่ยน PIN/logout; ระบุในเอกสารให้กดล็อกเมื่อเลิกใช้เครื่อง |
| `create index concurrently` ทำบน production แล้วล้มกลางทาง | รันบน staging ก่อน, รันทีละคำสั่ง, ตรวจ `pg_stat_progress_create_index` |
| การเปลี่ยนไปใช้ settings-only ทำให้ตัวเลขของไอดีเก่าเปลี่ยน | เป็นพฤติกรรมที่ต้องการ (ให้ตรงกับค่าหลังบ้าน) และแจ้งผู้ใช้ก่อน deploy |

---

## 10. สิ่งที่ตัดสินใจไว้แล้วโดยผู้ใช้

- ใช้ A (ส่ง rate จาก settings เข้า lib)
- PIN A1 (30 วันคงที่) เพราะไม่ต้องการกรอกบ่อย
- B1 (rate limit ใน DB)
- C2 (quick wins + cache)

## 11. สิ่งที่เหลือให้ผู้สร้างตัดสินใจเอง

- รูปแบบข้อความ error กลาง (ภาษาไทยสั้น) และรหัส `context` ของ logger
- จะเก็บ `interest_free_*` ในตารางไว้เฉย ๆ หรือลบออกจาก payload ของ API (ไม่ลบคลัมน์)
- ตำแหน่ง `sizes` ของแต่ละคอมโพเนนต์รูป
- จะเพิ่มป้าย "ปลดล็อกถึงวันที่" ในหน้า admin หรือไม่

## 12. คำตัดสินของผู้สร้างหลัง builder check (ให้ผู้ใช้อนุมัติ)

| # | คำถามจาก reviewer | คำตัดสิน |
|---|---|---|
| 1 | RLS ของ `accounts` เปิดไหม และหน้า `/id` โหลดได้อย่างไร | ตรวจแล้ว: anon อ่านได้ 0 แถว → หน้า `/id` เป็น 404 สำหรับผู้เยี่ยมชม จึงเปลี่ยนไปใช้ `accounts_public` (§2.1, §5.1 ข้อ 6) |
| 2 | แถว `installment_settings` มีจริงไหม | มี 1 แถว ค่าครบ แต่ยังเพิ่มการตรวจว่า UPDATE โดนแถวจริง (§5.1 ข้อ 8) |
| 3 | รูปอยู่ host เดียวกับ `R2_PUBLIC_URL` ไหม | ใช่ ทั้ง 1,032 URL → ใช้ `remotePatterns` host เดียว + `SmartImage` ถอยเป็น `<img>` เมื่อ host ไม่ตรง (§5.6) |
| 4 | ข้อความคัดลอกต้องมีบรรทัดดอกเบี้ยไหม | ไม่เพิ่มบรรทัดใหม่ — ให้ยอด "ผ่อนงวดละ" สะท้อน rate ใหม่ และปรับเกณฑ์ตรวจรับให้ทดสอบด้วยการตั้งค่าปลอดดอกของไอดีเป็น 0 (§8 ข้อ 1) |
| 5 | เอา input ปลอดดอกต่อไอดีออกหรือเก็บไว้ | **เก็บไว้และต้องบันทึกได้จริง** — เปลี่ยนจากเดิม: ผู้ใช้ยืนยันว่าแต่ละไอดีไม่เท่ากัน จึงเอาช่องปลอดดอก/ดาวน์ออกจากหน้า "ตั้งค่าผ่อน" แทน (§5.1) |
| 6 | `checkRateLimit` ของ download route ทำอย่างไร | คงตัวเดิมใน memory ไว้ ไม่แตะ; PIN ใช้โมดูลใหม่ (§5.3) |
| 7 | `revalidateTag` ใน Next 16 | ใช้ `revalidateTag(tag, { expire: 0 })` ตามเอกสารเวอร์ชันนี้ |
| 8 | เพิ่ม script `test`/`typecheck` ไหม | ไม่เพิ่ม (ขัด `AGENTS.md` §6) — ติดตั้ง `vite` + config ให้ `npx vitest run` ใช้ได้แทน (§6) |
| 9 | รัน migration 003 อย่างไร (ไม่มี staging) | ผู้ใช้เลือก: แยกเป็น 2 ไฟล์ (`003_pin_attempts.sql`, `003_indexes_concurrently.sql`) ให้รันเองใน Supabase SQL Editor ทีละคำสั่ง พร้อม backup ก่อน (§5.7) |
