# ⚠️ เอกสารนี้ถูกแทนที่แล้ว (Deprecated)

> **สถานะ:** ไฟล์นี้เคยเป็นสเปกภาษาอังกฤษชื่อ "PAPhum Store & Studio — Technical Documentation & CLI Implementation Plan"
> **วันที่แทนที่:** 18 พฤศจิกายน 2026
> **เหตุผล:** เนื้อหาหลายจุดขัดกับโค้ดจริงใน repository (ตรวจจาก source code ทุกไฟล์) และบางจุดอ้างถึงไฟล์/ตาราง/endpoint ที่ไม่มีอยู่

---

## 1. ไปอ่านเอกสารชุดใหม่ที่นี่

| ไฟล์ | เนื้อหา |
|---|---|
| [`docs/00-overview-architecture.md`](./00-overview-architecture.md) | ภาพรวมธุรกิจ, tech stack จริง, แผนผังสถาปัตยกรรม, route inventory, env ทั้ง 13 ตัว, ข้อจำกัดเชิงสถาปัตยกรรม |
| [`docs/01-feature-store-and-installment.md`](./01-feature-store-and-installment.md) | หน้าร้าน `/store`, รายละเอียดไอดี `/id/[code]`, สูตรผ่อนทีละบรรทัด, ตาราง edge case 35 กรณี, ImageLightbox, ช่องว่างของเทสต์ |
| [`docs/02-feature-banners-and-delivery.md`](./02-feature-banners-and-delivery.md) | พอร์ตโฟลิโอ `/banners`, pipeline อัปโหลด WebP → R2 14 ขั้น, presigned URL, bulk upload, ระบบส่งงาน `/deliver/[token]` |
| [`docs/03-feature-admin-and-sync.md`](./03-feature-admin-and-sync.md) | หลังบ้าน, สิทธิ์ owner/staff, PIN (scrypt), AES-256-GCM, TOTP, Google Sheets sync, รายการสิ่งที่ระบบยังไม่มี |
| [`docs/04-security-audit.md`](./04-security-audit.md) | ช่องโหว่ **27 รายการ** เรียง Critical → High → Medium → Low พร้อมไฟล์:บรรทัด, พฤติกรรม, วิธีแก้เป็น SQL/TypeScript |
| [`docs/05-database-normalize-and-optimize.md`](./05-database-normalize-and-optimize.md) | Schema Drift, ER diagram, 1NF/2NF/3NF, migration SQL ที่รันได้, index 11 ตัว, trigger, query rewrite |
| [`docs/06-roadmap-and-new-features.md`](./06-roadmap-and-new-features.md) | แผน 4 เฟส, ฟีเจอร์ใหม่ 6 ข้อพร้อม data model และ acceptance criteria, ความเสี่ยง, Definition of Done |

---

## 2. สรุป 9 จุดที่เอกสารเดิมขัดกับโค้ดจริง

ตัวเลขบรรทัดอ้างจากไฟล์จริงใน repository นี้

| # | เอกสารเดิมระบุ | ความจริงในโค้ด |
|---|---|---|
| 1 | `accounts_public` เป็น **VIEW** | เป็น **TABLE** (`supabase/migrations/001_initial_schema.sql:5`) และทั้งโปรเจกต์ไม่มีคำสั่ง `CREATE VIEW` เลย |
| 2 | มีตาราง `accounts` ตารางเดียวเก็บทั้งข้อมูลสาธารณะและ secret | migration แยกเป็น `accounts_public` (`:5`) + `accounts_secret` (`:23`) และ **ไม่มีตาราง `accounts`** แต่โค้ดเรียก `accounts` 10 จุด |
| 3 | ไม่กล่าวถึงระบบ role | โค้ดใช้ตาราง `admin_roles` (`src/app/admin/page.tsx:26`, `src/app/api/admin/accounts/route.ts:24`, `src/app/api/admin/accounts/[id]/route.ts:20`) ซึ่งไม่มีใน migration |
| 4 | PIN hash เป็น **PBKDF2** | ใช้ **scrypt** (`src/lib/crypto.ts:75,89`) |
| 5 | PIN cookie อายุ 15 นาที, `sameSite: lax` | อายุ **30 วัน** (`src/app/api/admin/pin/route.ts:7`) และ `sameSite: 'strict'` (`:85`) |
| 6 | `deliveries` อ่านได้เฉพาะแถวที่ token ตรง | RLS ให้ anon อ่าน **ทุกแถวที่ยังไม่หมดอายุ** (`001:172-175`) → enumerate ได้ (ดู `docs/04` C-2) |
| 7 | มี `scripts/migrate-legacy-banners.ts` (±1,230 รูป, ใช้ sharp, watermark) | ไฟล์นั้นมีขนาด **0 bytes**; ไฟล์ที่ใช้งานจริงคือ `scripts/migrate-banners.ts` (อ่าน CSV, ไม่ใช้ sharp) |
| 8 | endpoint `/api/upload/presign` | จริงคือ `/api/admin/upload/presign` — และ UI ยังเรียก path เก่าที่ `src/components/admin/BannerCategoryManager.tsx:39` ทำให้สร้างหมวดพร้อมโลโก้ไม่ได้ |
| 9 | มี `/api/admin/logout`, `/api/admin/settings`, `DELETE /api/admin/pin` | **ทั้ง 3 ไม่มีอยู่จริง** แต่ UI เรียกที่ `src/components/admin/AdminDashboardClient.tsx:198, 203, 287` |

---

## 3. ข้อกำหนดการทำงาน (Global Constraints) ที่ยังใช้ได้

ส่วนนี้เป็นข้อตกลงเชิงสไตล์จากเอกสารเดิมที่ **ยังตรงกับโค้ดปัจจุบัน** จึงยกมาไว้เพื่อไม่ให้สูญหาย

| # | ข้อกำหนด | หลักฐานในโค้ด |
|---|---|---|
| 1 | ทุก Server Component ที่อ่าน dynamic data ต้อง `await connection()` | เรียก 6 จุด: `src/app/store/page.tsx:8`, `banners/page.tsx:12`, `banners/[slug]/page.tsx:17`, `id/[code]/page.tsx:17`, `deliver/[token]/page.tsx:12`, `admin/page.tsx:15` |
| 2 | Modal ต้องใช้ `ModalPortal` (portal ไป `document.body`) เพื่อไม่ถูก `transform` ของ parent clip | `src/components/ModalPortal.tsx`; ใช้ที่ `BannerPortfolioClient.tsx:198-208` |
| 3 | ห้ามใช้ `<input type="password">` กับ PIN 6 หลัก ให้ใช้ `type="text"` + `WebkitTextSecurity` | `src/components/admin/PinGuardModal.tsx` |
| 4 | ห้ามใช้อีโมจิใน UI/ซอร์สโค้ด ให้ใช้ `lucide-react` | import จาก `lucide-react` ในทุกคอมโพเนนต์ |
| 5 | ธีม "Obsidian & Frost": พื้น `#0A0A0D`, การ์ด `#111216`, ตัวอักษร `#F1F5F9`, accent `#93C5FD` | `src/app/globals.css` |
| 6 | ไม่มี tagline/hero banner/ข้อความการตลาดในหน้าแคตตาล็อก | `src/app/store/page.tsx`, `AccountCatalogClient.tsx` |
| 7 | ห้ามตัด imports/types/ฟังก์ชันเดิมออกเมื่อแก้ไฟล์ | — (เป็นวินัยการแก้โค้ด) |

> ข้อกำหนดเพิ่มเติมที่ **ไม่มี** ในเอกสารเดิม แต่สำคัญกว่า:
> - ห้ามใช้ `SUPABASE_SERVICE_ROLE_KEY` ใน `src/` (ปัจจุบันใช้เฉพาะ `scripts/migrate-banners.ts:108,124`) — ดู `docs/04` §7
> - ทุก response ที่มีข้อมูลลับต้องมี `Cache-Control: no-store` — ดู `docs/04` M-2
> - เกณฑ์เลือกโหมดผ่อนต้องเป็นค่าเดียวจาก `MONTHLY_DEFAULT_PRICE_THRESHOLD = 6000` (`src/lib/installment.ts:5,66`) — ดู `docs/01` §4.1

---

## 4. ทำไมถึงเขียนใหม่ทั้งชุดแทนการแก้ไฟล์เดิม

1. **เอกสารเดิมผูกกับแผนงาน (CLI roadmap) ไม่ใช่สภาพจริง** — ครึ่งหนึ่งของเนื้อหาเป็น checkbox สำหรับ agent ทำงานในอนาคต ไม่ใช่คำอธิบายระบบที่รันอยู่
2. **ไม่มีการอ้างบรรทัด** — เมื่อโค้ดเปลี่ยน เอกสารจึงตรวจสอบไม่ได้ว่า point ไหนล้าสมัย
3. **มีข้อความที่หลุดมาจาก prompt/เครื่องมือ** (เช่นประโยคเปิดไฟล์) ปนกับเนื้อหา
4. **ไม่มีผลตรวจความปลอดภัย** ทั้งที่ระบบเก็บ credential ของลูกค้า (AES-256 + PIN + RLS)

เอกสารชุดใหม่จึงยึดหลัก: ทุกข้อความอ้าง `path:line` ที่มีอยู่จริง, แยกชัดระหว่าง "สิ่งที่โค้ดทำ" กับ "สิ่งที่ควรทำ", และระบุข้อจำกัด (ไม่ได้เชื่อมต่อ DB จริง) อย่างตรงไปตรงมา

---

## 5. หากต้องการเก็บประวัติ

ไฟล์นี้จะถูกเขียนทับแล้ว หากทีมต้องการดูเนื้อหาเดิม ให้ดูจาก git history:

```bash
git log --follow -- docs/techdocs.md
git show <commit>:docs/techdocs.md
```

> หมายเหตุ: repository นี้ ณ วันที่ปรับปรุง **ยังไม่ใช่ git repository** (ไม่มีโฟลเดอร์ `.git`) จึงควร `git init` และ commit เอกสารชุดนี้ก่อนเริ่มแก้โค้ด เพื่อให้ย้อนกลับได้
