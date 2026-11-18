# ฐานข้อมูล — Schema Drift, Normalization และการ Optimize

> **วิธีอ่านเอกสารนี้:** ทุกข้อสรุปมาจาก (1) `supabase/migrations/001_initial_schema.sql` 188 บรรทัด (2) ชื่อตาราง/คอลัมน์ที่โค้ดเรียกจริงใน `src/` (ตรวจด้วย grep `.from('...')` ได้ 55 จุด) และ (3) `src/types/database.ts` 83 บรรทัด
> **ไม่ได้เชื่อมต่อ DB จริง** — จึงไม่ยืนยันว่า production ตรงกับ migration หรือตรงกับโค้ด สิ่งที่ทำได้คือชี้ให้เห็นว่า "สามแหล่งนี้ไม่ตรงกันตรงไหน" และให้ SQL ที่ปลอดภัยพอจะรันเพื่อปรับให้เป็นแบบเดียว

---

## 1. สถานะปัจจุบัน: มีสามแหล่งความจริงที่ไม่ตรงกัน

```mermaid
flowchart LR
  M["migration<br/>001_initial_schema.sql<br/>7 ตาราง"] -->|"ไม่ตรง"| C["โค้ดใน src/<br/>8 ชื่อตาราง"]
  T["src/types/database.ts<br/>PascalCase status"] -->|"ไม่ตรง"| M
  C -->|"ไม่ตรง"| T
  M -.->|"ไม่มีใครรู้"| P[("Supabase production")]
  C -.->|"ไม่รู้ว่าใช้ได้"| P
```

| แหล่ง | ตารางที่ประกาศ | ใช้สร้างอะไร |
|---|---|---|
| `supabase/migrations/001_initial_schema.sql` | `accounts_public`, `accounts_secret`, `installment_settings`, `banner_categories`, `banners`, `deliveries`, `admin_security` | เอกสาร schema ที่ควรเป็นจริง |
| โค้ด (`src/`) | `accounts_public`, `accounts`, `admin_roles`, `installment_settings`, `banner_categories`, `banners`, `deliveries`, `admin_security` | สิ่งที่แอปรันจริง |
| `src/types/database.ts` | ไม่ประกาศตาราง เป็น TypeScript interface 5 ตัว | สัญญาระหว่างชั้นข้อมูลกับ UI |

**ข้อสรุปสั้น:** migration ไม่มีตาราง `accounts` และ `admin_roles` แต่โค้ดเรียกสองตารางนี้รวม 13 จุด (grep แล้ว: `accounts` 10 จุด, `admin_roles` 3 จุด) → ถ้าใครสร้าง DB ใหม่จาก migration นี้ แอปจะพังทันทีในหน้าแรกที่ query

---

## 2. รายการ Schema Drift ทั้งหมด (ตรวจทีละคอลัมน์)

### 2.1 ระดับตาราง

| # | ตาราง | ใน migration | ในโค้ด | ผลเมื่อสร้าง DB จาก migration |
|---|---|---|---|---|
| T-1 | `accounts` | ❌ ไม่มี | ✅ ใช้ 10 จุด | `/id/[code]` (`src/app/id/[code]/page.tsx:24`), `/admin` (`src/app/admin/page.tsx:67`), API ทั้ง 4 method (`accounts/route.ts:159,241`; `[id]/route.ts:172,224,312,379,385`) ตอบ 404/500 |
| T-2 | `admin_roles` | ❌ ไม่มี | ✅ ใช้ 3 จุด (`src/app/admin/page.tsx:26`; `accounts/route.ts:24`; `[id]/route.ts:20`) | `roleRow = null` → ทุกคนถูกมองเป็น `staff` (`admin/page.tsx:31`) และ `requireOwner()` คืน false ตลอด → **owner คนแรกเข้าระบบไม่ได้เลย** |
| T-3 | `accounts_public` | ✅ TABLE (`001:5`) | ✅ ใช้ 3 จุด (`src/app/store/page.tsx:12`; `accounts/route.ts:110`) | ทำงานได้ แต่ถูกมองข้ามว่าเป็น "view" ในเอกสารรุ่นก่อน |
| T-4 | `accounts_secret` | ✅ TABLE (`001:23`) | ❌ **ไม่มีผู้เรียกเลย** | ตารางว่างถาวร; การแยก secret ที่ออกแบบไว้ไม่มีผล |
| T-5 | `banner_category_links` | ❌ ไม่มี | ❌ ไม่มี (ใช้ array แทน) | ไม่มี junction table → ต้องพึ่ง `category_ids` |

### 2.2 ระดับคอลัมน์ — ตาราง `accounts` ที่โค้ดต้องการ

รวมจาก `insertData` ใน `accounts/route.ts:204-238`, `decryptAccountRow()` ใน `[id]/route.ts:79-110`, และ `SELECT` ที่ `src/app/admin/page.tsx:68-70`

| คอลัมน์ที่โค้ดใช้ | ชนิดที่โค้ดคาด | มีใน migration? | หมายเหตุ |
|---|---|---|---|
| `id` | uuid | อยู่ใน `accounts_public.id` ✅ | |
| `code` | text | ✅ `accounts_public.code` | |
| `status` | text (PascalCase) | ✅ แต่ CHECK เป็นตัวพิมพ์เล็ก | **ชนกัน** (ข้อ 2.3) |
| `price` | integer | ✅ | |
| `min_down_weekly` | integer | ✅ | โค้ดบังคับ 0 ตอนสร้าง (`route.ts:209`) |
| `min_down_monthly` | integer | ✅ | โค้ดบังคับ 0 ตอนสร้าง (`:210`) |
| `interest_free_weeks` / `_months` | integer | ✅ | |
| `tags` | text[] | ✅ | |
| `description` | text \| null | ✅ | |
| `main_image_url` | text \| null | ✅ **NOT NULL** ใน migration (`:16`) | โค้ดส่ง `null` ได้ (`route.ts:215`) → **violation** |
| `gallery_urls` | text[] | ✅ | |
| `created_at` / `updated_at` | timestamptz | ✅ | |
| `cost` | integer | อยู่ใน `accounts_secret.cost` | โค้ดเขียนลง `accounts` (`route.ts:208`) |
| `game_uid_enc` | text | ❌ (migration: `game_uid` plaintext `:26`) | ชื่อต่าง + รูปแบบต่าง |
| `login_provider_enc` | text | ❌ (`login_provider` `:27`) | |
| `username_enc` | text | ❌ (`username_encrypted` `:28`) | |
| `password_enc` | text | ❌ (`password_encrypted` `:29`) | |
| `authenticator_enc` | text | ❌ (`authenticator_encrypted` `:32`) | |
| `gmail_enc` | text | ❌ (`gmail_encrypted` `:30`) | |
| `gmail_password_enc` | text | ❌ (`gmail_password_encrypted` `:31`) | |
| `gmail_authenticator_enc` | text | ❌ **ไม่มีคอลัมน์ใดเลย** | ข้อมูล 2FA ของ Gmail หาที่เก็บไม่ได้ |
| `gmail_recovery_enc` | text | ❌ **ไม่มีคอลัมน์ใดเลย** | รหัสกู้ 8 หลักหาที่เก็บไม่ได้ |
| `private_notes_enc` | text | ❌ (`private_notes` plaintext `:39`) | |
| `purchase_date`, `phone_owner` | ฝังใน `private_notes_enc` | ❌ | ไม่มีคอลัมน์ของตัวเอง (ข้อ 3.2) |
| `security_status` (jsonb) | — | ✅ `:33-38` | **โค้ดไม่ใช้เลย** → dead column |

**สรุปตัวเลข:** คอลัมน์ที่โค้ดใช้แต่ไม่มีชื่อตรงใน migration = **11 คอลัมน์** และมี **1 คอลัมน์** ใน migration ที่โค้ดไม่ใช้ (`security_status`)

### 2.3 ระดับค่า enum — `status`

| แหล่ง | ค่าที่อนุญาต | หลักฐาน |
|---|---|---|
| TypeScript | `'Unavailable' \| 'Available' \| 'Installment' \| 'SoldOut'` | `src/types/database.ts:1` |
| CHECK constraint | `'available' \| 'installment' \| 'sold'` | `001:8` |
| RLS anon | `status = 'available'` | `001:117-120` |
| โค้ดกรองหน้าเว็บ | `['Available','Installment','SoldOut']` | `src/app/store/page.tsx:14` |
| โค้ด validate ฝั่ง API | 4 ค่า PascalCase | `accounts/route.ts:12-17` (ค่าคงที่ `VALID_STATUSES`) |
| ค่า default ตอนสร้าง | `'Unavailable'` | `accounts/route.ts:186-188` |

**ผลลัพธ์ที่เป็นไปได้ 3 กรณี:**

1. DB จริงยึด CHECK → การ INSERT ทุกครั้งล้มเหลว (PascalCase ไม่ผ่าน CHECK) และ RLS anon ไม่คืนแถวใดเลย → `/store` ว่าง
2. DB จริงยึด PascalCase (แก้ CHECK ไปแล้ว) → ทำงานได้ แต่ migration ใน repository เป็นเท็จ
3. DB จริงยึดตัวพิมพ์เล็กและแอปไม่เคย INSERT สำเร็จ → ไม่มีข้อมูลใหม่

ไม่ว่ากรณีใด **ต้องเลือกค่าเดียวและทำให้ครบทั้ง 4 ชั้น** (type, CHECK, RLS, UI) แนวทางที่แนะนำอยู่ในข้อ 5.1

### 2.4 ระดับคอลัมน์ — ตาราง `banners` และ `banner_categories`

| คอลัมน์ที่โค้ดใช้ | migration | หมายเหตุ |
|---|---|---|
| `banners.category_ids` (text[]) | ❌ ไม่มี | ใช้กรอง `.contains()` (`banners/route.ts:49`; `banners/[slug]/page.tsx:41`) และใช้จัดกลุ่มหน้าแรก (`banners/page.tsx:72-87`) |
| `banners.is_pinned` (boolean) | ❌ ไม่มี | เรียงลำดับ (`banners/page.tsx:30`) และเช็กโควตา (`banners/route.ts:295-317`) |
| `banners.pin_order` (integer) | ❌ ไม่มี | |
| `banners.original_r2_key` | อยู่ใน `deliveries` (`001:88`) | โค้ดไม่ได้เก็บใน banners — ตรวจแล้วไม่มี insert ฟิลด์นี้ (`banners/route.ts:127-135`) ✅ ตรงกัน |
| `banner_categories.description` | ❌ ไม่มี | `BannerCategory` ประกาศไว้ (`src/types/database.ts:41`) และ insert ที่ `banners/route.ts:99` |
| `banner_categories.logo_url` | ❌ ไม่มี | `types:42`, insert `:100` |
| `banner_categories.hide_preview` | ❌ ไม่มี | ใช้ `order('hide_preview')` (`banners/page.tsx:19`) → **query นี้ error ทันทีถ้าคอลัมน์ไม่มี** |
| `banner_categories.updated_at` | ❌ ไม่มี | ไม่ได้ใช้ |
| `deliveries` ทุกคอลัมน์ | ✅ ตรง (`001:84-92`) | ตรงกันครบ ✅ |

### 2.5 ระดับ RLS

| ตาราง | policy ใน migration | ปัญหา |
|---|---|---|
| `accounts` (ที่โค้ดใช้จริง) | **ไม่มี policy เพราะไม่มีตาราง** | ถ้าเปิด RLS ไว้แต่ไม่มี policy → อ่านได้ 0 แถว; ถ้าปิด RLS → anon อ่าน secret ทั้งหมด |
| `accounts_secret` | `FOR ALL TO authenticated USING(true)` (`001:129-133`) | ละเมิดหลัก least privilege (ดู `docs/04-security-audit.md` C-1) |
| `deliveries` | anon อ่านทุกแถวที่ยังไม่หมดอายุ (`001:172-175`) | token หมดความหมาย (C-2) |
| `admin_roles` | ไม่มีตาราง/policy | สิทธิ์ไม่ถูกบังคับที่ชั้น DB |
| `admin_security` | `USING (auth.uid() = user_id)` (`001:184-188`) | เจ้าของแก้ `pin_hash` ตรง ๆ ได้ (M-9) |
| `banner_categories` / `banners` / `installment_settings` | `FOR ALL TO authenticated USING(true)` | staff แก้ได้ทุกอย่างที่ชั้น DB (H-5) |

---

## 3. Normalization: จุดที่ผิดปกติและผลกระทบจริง

> ใช้เกณฑ์ 1NF/2NF/3NF แบบเข้าใจง่าย: **1NF** = ทุกช่องเก็บค่าเดี่ยวและ atomic, **2NF** = ไม่มีแอตทริบิวต์ที่ไม่ใช่คีย์ขึ้นกับเพียงส่วนหนึ่งของคีย์ผสม, **3NF** = ไม่มีแอตทริบิวต์ที่ไม่ใช่คีย์ขึ้นกับแอตทริบิวต์ที่ไม่ใช่คีย์อื่น

### 3.1 ภาพ ER ปัจจุบัน (ตาม migration)

```mermaid
erDiagram
  accounts_public ||--o| accounts_secret : "account_id (1:1)"
  banner_categories ||--o{ banners : "category_id (SET NULL)"
  banners ||--o{ deliveries : "banner_id (SET NULL)"

  accounts_public {
    uuid id PK
    text code UK
    text status "CHECK ตัวพิมพ์เล็ก"
    int price
    int min_down_weekly
    int min_down_monthly
    int interest_free_weeks
    int interest_free_months
    text_array tags
    text description
    text main_image_url "NOT NULL"
    text_array gallery_urls
    timestamptz created_at
    timestamptz updated_at
  }
  accounts_secret {
    uuid account_id PK
    int cost
    text game_uid "plaintext"
    text login_provider "plaintext"
    text username_encrypted
    text password_encrypted
    text gmail_encrypted
    text gmail_password_encrypted
    text authenticator_encrypted
    jsonb security_status "ไม่ถูกใช้"
    text private_notes "plaintext"
    timestamptz updated_at
  }
  installment_settings {
    int id PK "CHECK id = 1"
    int weekly_interest_rate
    int monthly_interest_rate
    int default_min_down_weekly
    int default_min_down_monthly
    int default_free_weeks
    int default_free_months
    timestamptz updated_at
  }
  banner_categories {
    uuid id PK
    text name
    text slug UK
    int sort_order
    timestamptz created_at
  }
  banners {
    uuid id PK
    uuid category_id FK
    text code
    text watermarked_url
    bool is_public
    timestamptz created_at
  }
  deliveries {
    uuid id PK
    text token UK
    uuid banner_id FK
    text original_r2_key
    text original_filename
    timestamptz expires_at
    timestamptz created_at
  }
  admin_security {
    uuid user_id PK
    text pin_hash
    text pin_salt
    timestamptz updated_at
  }
```

### 3.2 ตารางตรวจ Normal Form

| # | จุด | ละเมิด | เหตุผลเชิงข้อมูล | ผลกระทบที่เกิดจริง |
|---|---|---|---|---|
| N-1 | `banners.category_ids` เป็น `text[]` **ซ้ำกับ** `category_id` | **1NF** (multi-valued attribute) + redundancy | 1 banner อยู่ในหลายหมวด แต่เก็บเป็น array ในแถวเดียว ขณะที่ `category_id` เก็บ "หมวดแรก" อีกช่อง | ต้องเขียนสองที่ทุกครั้ง; ลบหมวดแล้ว UUID ค้างใน array (`banner-categories/route.ts:175-178`); banner ที่มีเฉพาะ `category_id` หายจากหน้ารายหมวด (`banners/[slug]/page.tsx:41` ไม่มี fallback) |
| N-2 | `accounts.tags` เป็น `text[]` | **1NF** (multi-valued) | แท็กหลายค่าต่อแถว | ค้นหาแบบ exact tag ต้องใช้ GIN; แก้ชื่อแท็กต้องอัปเดตทุกแถว (update anomaly) |
| N-3 | `private_notes_enc` เก็บ `[ซื้อ:...][เบอร์:...]` ต่อท้ายโน้ต | **1NF** (non-atomic) | 3 ค่า (purchase_date, phone_owner, notes) อัดในสตริงเดียว เข้ารหัสทั้งก้อน | ถอดรหัสไม่ได้ = ข้อมูล 3 อย่างหายพร้อมกัน; query/filter ตาม `phone_owner` ทำไม่ได้เลย; `unpackPrivateNotes` ต้อง regex ทุกครั้ง (`[id]/route.ts:57-77`) |
| N-4 | `banners.is_pinned` / `pin_order` เป็นคุณสมบัติระดับ banner แต่ semantics คือ "pin ในหมวด X" | **2NF/3NF** (ขึ้นกับคู่ (banner, category) ไม่ใช่ banner เดี่ยว) | ค่าหนึ่งช่องต้องตอบคำถาม "pin ในหมวดไหน" ซึ่งไม่มีในคีย์ | pin ในหมวด A ไปโผล่หมวด B; `pin_order` ชนกันข้ามหมวด; โควตา 10 ต่อหมวด (`banners/route.ts:295-317`) นับผิด |
| N-5 | `status` เก็บเป็น text อิสระ + ค่าไม่ตรงกัน 3 ชุด | **Domain integrity** (ไม่ใช่ NF แต่ร้ายแรงกว่า) | ไม่มีโดเมนกลาง | ข้อ 2.3 |
| N-6 | `accounts_secret` มี `cost` ปนกับ credential | **3NF** แบบหลวม (cost เป็นข้อมูลธุรกิจ ไม่ใช่ความลับเชิงรับรอง) | `cost` ต้องเข้า RLS เดียวกับรหัสผ่าน ทำให้ staff/รายงานทั่วไปอ่านไม่ได้โดยไม่จำเป็น | ต้องแยก `cost` ไปไว้ฝั่ง public/admin-only ที่ไม่ใช่ credential |
| N-7 | `installment_settings` เป็น singleton `CHECK (id = 1)` | ยอมรับได้ (ตาราง config แถวเดียว) | — | แต่ถ้าจะมีหลายสาขา/หลายโปรไฟล์ผ่อนในอนาคต ต้องเปลี่ยน PK เป็น `profile_id` |
| N-8 | ไม่มี junction table ระหว่าง banner กับ category | **1NF/2NF** (ตาม N-1) | ความสัมพันธ์ many-to-many ถูกยัดใน array | ไม่สามารถใส่ FK constraint ได้ → ไม่มี referential integrity |

### 3.3 ข้อดีที่ควรเก็บไว้

| จุด | เหตุผล |
|---|---|
| `installment_settings` แยกตาราง (ไม่ hardcode ใน component) | แก้เรทได้โดยไม่ต้อง deploy — แม้ UI ยังเรียก endpoint ที่ไม่มี (`AdminDashboardClient.tsx:287`) |
| `deliveries` แยกจาก `banners` | token/วันหมดอายุไม่ปนกับข้อมูลผลงาน; ลบ banner ได้โดยไม่ทำ token พัง (`ON DELETE SET NULL`) |
| `token TEXT UNIQUE` | ให้ DB บังคับ uniqueness เอง ไม่พึ่งแอป |
| `accounts_secret.account_id` เป็น PK + FK CASCADE | บังคับ cardinality 1:1 ได้ถูกต้อง |

---

## 4. เป้าหมาย Schema ที่แนะนำ (Target Model)

```mermaid
erDiagram
  accounts ||--o| account_secrets : "account_id"
  accounts ||--o{ account_images : "account_id"
  accounts }o--o{ tags : "account_tags"
  banner_categories ||--o{ banner_category_links : ""
  banners ||--o{ banner_category_links : ""
  banners ||--o{ deliveries : "banner_id"
  auth_users ||--o| admin_roles : "user_id"
  auth_users ||--o| admin_security : "user_id"
  auth_users ||--o{ admin_audit_log : "user_id"

  accounts {
    uuid id PK
    citext code UK
    account_status status
    int price
    int cost "ย้ายมาจาก secret"
    int min_down_weekly
    int min_down_monthly
    int interest_free_weeks
    int interest_free_months
    text description
    text main_image_url
    timestamptz created_at
    timestamptz updated_at
  }
  account_secrets {
    uuid account_id PK
    text game_uid_enc
    text login_provider_enc
    text username_enc
    text password_enc
    text authenticator_enc
    text gmail_enc
    text gmail_password_enc
    text gmail_authenticator_enc
    text gmail_recovery_enc
    text private_notes_enc
    date purchase_date
    text phone_owner
    int pin_version
    timestamptz updated_at
  }
  banners {
    uuid id PK
    text code
    text watermarked_url
    bool is_public
    timestamptz created_at
    timestamptz updated_at
  }
  banner_category_links {
    uuid banner_id PK
    uuid category_id PK
    bool is_pinned
    int pin_order
  }
  deliveries {
    uuid id PK
    text token UK
    uuid banner_id FK
    text original_r2_key
    text original_filename
    timestamptz expires_at
    timestamptz created_at
    int download_count
    text last_download_ip
  }
  admin_roles {
    uuid user_id PK
    citext username UK
    admin_role role
  }
  admin_security {
    uuid user_id PK
    text pin_hash
    text pin_salt
    int pin_version
    int failed_attempts
    timestamptz locked_until
  }
  admin_audit_log {
    bigint id PK
    uuid user_id FK
    text action
    text target_table
    uuid target_id
    text ip
    jsonb meta
    timestamptz created_at
  }
```

### 4.1 เหตุผลของการเปลี่ยนแต่ละจุด

| การเปลี่ยน | แก้อะไร | ต้องแก้โค้ดกี่จุด |
|---|---|---|
| รวม `accounts_public` + `accounts_secret` → `accounts` + `account_secrets` | โค้ดเรียก `accounts` อยู่แล้ว 10 จุด; ลด drift | เปลี่ยน `store/page.tsx:12` และ `accounts/route.ts:110` ให้ชี้ `accounts` + view |
| `account_secrets` มีคอลัมน์ `*_enc` ตรงกับโค้ด | ลบคอลัมน์ drift 11 ตัว | 0 (โค้ดตรงอยู่แล้ว) |
| แยก `purchase_date`/`phone_owner` เป็นคอลัมน์ | 1NF, query ได้, ไม่ต้อง regex | `accounts/route.ts:196-200`, `[id]/route.ts:57-77,112-137` |
| `banner_category_links` แทน `category_ids` + `is_pinned` | 1NF/2NF, FK จริง, pin ต่อหมวดถูกต้อง | ~8 จุดใน `banners/*` และ `banners/page.tsx` |
| `account_status` enum | ล็อกโดเมนค่าเดียว | 4 ไฟล์ (`types`, `store/page`, `accounts/route`, `[id]/route`) |
| `citext` สำหรับ `code`/`username` | ลบ `ilike` ที่ต้อง escape wildcard (`id/[code]/page.tsx:28`) | 1 จุด |
| `admin_roles` + `admin_audit_log` + `pin_version` | บังคับสิทธิ์ที่ DB และ audit ได้ | เพิ่ม helper กลาง |

---

## 5. Migration SQL ที่รันได้จริง

> ทุกคำสั่งใช้ `IF NOT EXISTS` / `IF EXISTS` และ **ไม่ลบข้อมูลเดิม** เพื่อให้รันบน production ได้อย่างปลอดภัย
> ลำดับที่ปลอดภัย: **5.1 (enum) → 5.2 (ตารางที่ขาด) → 5.3 (คอลัมน์ที่ขาด) → 5.4 (backfill) → 5.5 (index) → 5.6 (trigger) → 5.7 (RLS) → 5.8 (drop ของเก่า)**

### 5.1 โดเมนสถานะเดียว (เลือกตัวพิมพ์เล็กเป็นแหล่งความจริง)

```sql
-- เลือกตัวพิมพ์เล็กเพราะ RLS ใน 001:120 เขียนไว้แล้วว่า status = 'available'
do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum ('available','installment','sold','unavailable');
  end if;
end $$;

-- ตรวจค่าที่มีอยู่ในปัจจุบันก่อนแปลง (ต้องได้ 0 แถว ถ้าไม่ใช่ ให้แก้ข้อมูลก่อน)
-- select distinct status from public.accounts;

-- alter table public.accounts
--   alter column status type public.account_status
--   using (lower(status))::public.account_status;
```

ลำดับการแปลงค่าที่ต้องทำในโค้ดให้ตรงกัน:

| ค่าเดิม (PascalCase) | ค่าใหม่ |
|---|---|
| `Available` | `available` |
| `Installment` | `installment` |
| `SoldOut` | `sold` |
| `Unavailable` | `unavailable` |

จุดที่ต้องแก้: `src/types/database.ts:1`, `src/app/store/page.tsx:14`, `src/components/AccountCatalogClient.tsx:26,30,34,58,60,258`, `src/app/api/admin/accounts/route.ts:12-17`, `src/app/api/admin/accounts/[id]/route.ts:12-17` (ถ้ามีค่าคงที่เดียวกัน), RLS `001:120`

### 5.2 ตารางที่ขาด

```sql
-- 1) accounts: ตารางฐานที่โค้ดใช้จริง
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'unavailable',
  price integer not null default 0 check (price >= 0),
  cost integer not null default 0 check (cost >= 0),
  min_down_weekly integer not null default 1000 check (min_down_weekly >= 0),
  min_down_monthly integer not null default 2000 check (min_down_monthly >= 0),
  interest_free_weeks integer not null default 2 check (interest_free_weeks >= 0),
  interest_free_months integer not null default 1 check (interest_free_months >= 0),
  tags text[] not null default '{}',
  description text,
  main_image_url text,
  gallery_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) account_secrets: 1:1 กับ accounts, ชื่อคอลัมน์ตรงกับโค้ดทุกตัว
create table if not exists public.account_secrets (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  game_uid_enc text,
  login_provider_enc text,
  username_enc text,
  password_enc text,
  authenticator_enc text,
  gmail_enc text,
  gmail_password_enc text,
  gmail_authenticator_enc text,
  gmail_recovery_enc text,
  private_notes_enc text,
  purchase_date date,
  phone_owner text,
  updated_at timestamptz not null default now()
);

-- 3) admin_roles: จำเป็นต่อ requireOwner() ทั้ง 3 จุด
create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'staff' check (role in ('owner','staff')),
  created_at timestamptz not null default now()
);

-- 4) junction table แทน category_ids array
create table if not exists public.banner_category_links (
  banner_id uuid not null references public.banners(id) on delete cascade,
  category_id uuid not null references public.banner_categories(id) on delete cascade,
  is_pinned boolean not null default false,
  pin_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (banner_id, category_id)
);

-- 5) audit log (ปิดช่อง M-7)
create table if not exists public.admin_audit_log (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  ip text,
  user_agent text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 6) ตารางนับความพยายามใส่ PIN (ปิดช่อง H-3)
create table if not exists public.admin_pin_attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ip text,
  success boolean not null,
  created_at timestamptz not null default now()
);
```

### 5.3 คอลัมน์ที่ขาดบนตารางเดิม

```sql
-- banners: 5 คอลัมน์ที่โค้ดใช้แต่ migration ไม่มี
alter table public.banners
  add column if not exists category_ids uuid[] not null default '{}',
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pin_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

-- banner_categories: 4 คอลัมน์
alter table public.banner_categories
  add column if not exists description text,
  add column if not exists logo_url text,
  add column if not exists hide_preview boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- admin_security: รองรับ HMAC token + lockout
alter table public.admin_security
  add column if not exists pin_version integer not null default 0,
  add column if not exists failed_attempts integer not null default 0,
  add column if not exists locked_until timestamptz;

-- deliveries: นับดาวน์โหลด + ตรวจ rate limit
alter table public.deliveries
  add column if not exists download_count integer not null default 0,
  add column if not exists last_download_ip text;

-- accounts: ให้ main_image_url ว่างได้ตามที่โค้ดส่ง (route.ts:215)
alter table public.accounts alter column main_image_url drop not null;
```

### 5.4 Backfill ข้อมูลเดิม

```sql
-- ย้าย accounts_public → accounts (ถ้ายังมีข้อมูลอยู่)
insert into public.accounts (
  id, code, status, price, min_down_weekly, min_down_monthly,
  interest_free_weeks, interest_free_months, tags, description,
  main_image_url, gallery_urls, created_at, updated_at
)
select
  id, code, lower(status), price, min_down_weekly, min_down_monthly,
  interest_free_weeks, interest_free_months, tags, description,
  main_image_url, gallery_urls, created_at, updated_at
from public.accounts_public
on conflict (id) do nothing;

-- ย้าย accounts_secret → account_secrets (คอลัมน์ชื่อใหม่)
insert into public.account_secrets (
  account_id, game_uid_enc, login_provider_enc, username_enc, password_enc,
  authenticator_enc, gmail_enc, gmail_password_enc, updated_at
)
select
  account_id, game_uid, login_provider, username_encrypted, password_encrypted,
  authenticator_encrypted, gmail_encrypted, gmail_password_encrypted, updated_at
from public.accounts_secret
on conflict (account_id) do nothing;

-- ย้าย category_ids array → junction table
insert into public.banner_category_links (banner_id, category_id, is_pinned, pin_order)
select
  b.id,
  unnest(
    case
      when coalesce(array_length(b.category_ids, 1), 0) > 0 then b.category_ids
      when b.category_id is not null then array[b.category_id]
      else array[]::uuid[]
    end
  ),
  b.is_pinned,
  b.pin_order
from public.banners b
on conflict (banner_id, category_id) do nothing;
```

> หลัง backfill ต้องตรวจ `select count(*) from public.banner_category_links;` เทียบกับจำนวนคู่ที่คาดหวัง ก่อน drop คอลัมน์เก่า

### 5.5 Index Plan (11 ตัวที่ควรมี)

**ของเดิมมี 3 ตัว (`001:103-105`) และตัวหนึ่งซ้ำซ้อน:**

| Index เดิม | สถานะ |
|---|---|
| `idx_accounts_public_status_created (status, created_at DESC)` | ใช้ได้ แต่ตารางที่โค้ดอ่านจริงคือ `accounts` → ต้องสร้างใหม่ |
| `idx_banners_category_public_created (category_id, is_public, created_at DESC)` | ใช้กับการกรอง `category_id` เดี่ยว แต่หน้า `/banners/[slug]` ใช้ `category_ids` + `contains` → **ไม่ได้ใช้ index นี้** |
| `idx_deliveries_token (token)` | **ซ้ำซ้อน** กับ index ที่ `UNIQUE (token)` สร้างให้อัตโนมัติแล้ว (`001:86`) → ลบได้ |

```sql
-- I-1 หน้า /store: filter status + order created_at DESC
create index if not exists idx_accounts_status_created
  on public.accounts (status, created_at desc);

-- I-2 หน้า admin: เรียงตาม created_at ไม่มี filter
create index if not exists idx_accounts_created
  on public.accounts (created_at desc);

-- I-3 ค้นหาไอดีด้วย code แบบไม่สนตัวพิมพ์ (แทน ilike ที่ escape ยาก)
create unique index if not exists uq_accounts_code_lower
  on public.accounts (lower(code));

-- I-4 หน้า /banners: filter is_public + เรียง pinned/pin_order/created_at
create index if not exists idx_banners_public_pinned_created
  on public.banners (is_public, is_pinned desc, pin_order asc, created_at desc);

-- I-5 หน้า /banners: นับจำนวนต่อหมวด (count head)
create index if not exists idx_banners_public_created
  on public.banners (is_public, created_at desc);

-- I-6 GIN สำหรับ category_ids array (ใช้กับ .contains())
create index if not exists idx_banners_category_ids_gin
  on public.banners using gin (category_ids);

-- I-7 lookup ลิงก์ส่งงาน + sweep ที่หมดอายุ
create index if not exists idx_deliveries_expires
  on public.deliveries (expires_at);
create index if not exists idx_deliveries_active
  on public.deliveries (token) where expires_at > now();  -- หมายเหตุ: ดูข้อ 5.5.1

-- I-8 ค้นหาแท็ก (ถ้าจะทำ filter ตามแท็ก)
create index if not exists idx_accounts_tags_gin
  on public.accounts using gin (tags);

-- I-9 audit log
create index if not exists idx_audit_user_created
  on public.admin_audit_log (user_id, created_at desc);
create index if not exists idx_audit_target
  on public.admin_audit_log (target_table, target_id, created_at desc);

-- I-10 pin attempts (นับในหน้าต่างเวลา)
create index if not exists idx_pin_attempts_user_created
  on public.admin_pin_attempts (user_id, created_at desc);

-- I-11 FK index (Postgres ไม่สร้างให้อัตโนมัติ)
create index if not exists idx_deliveries_banner
  on public.deliveries (banner_id);
create index if not exists idx_banner_links_category
  on public.banner_category_links (category_id);
```

**ตารางสรุปเหตุผล:**

| # | Index | Query ที่รองรับ | ไฟล์อ้างอิง |
|---|---|---|---|
| I-1 | `accounts(status, created_at desc)` | `/store` | `src/app/store/page.tsx:12-15` |
| I-2 | `accounts(created_at desc)` | `/admin` | `src/app/admin/page.tsx:67-70` |
| I-3 | `lower(code)` unique | `/id/[code]` | `src/app/id/[code]/page.tsx:28` |
| I-4 | `banners(is_public, is_pinned desc, pin_order, created_at desc)` | `/banners` | `src/app/banners/page.tsx:27-33` |
| I-5 | `banners(is_public, created_at desc)` | count + หน้าหมวด | `banners/page.tsx:22-25`, `banners/[slug]/page.tsx:39-47` |
| I-6 | GIN `category_ids` | `.contains()` | `banners/[slug]/page.tsx:41`, `banners/route.ts:49` |
| I-7 | `deliveries(expires_at)` | sweep + ตรวจอายุ | `banners/route.ts:153`, `download/route.ts:16` |
| I-8 | GIN `tags` | ค้นหาแท็กในอนาคต | `AccountCatalogClient.tsx` (กรองฝั่ง client) |
| I-9 | audit log | รายงาน/สอบสวน | ตารางใหม่ |
| I-10 | pin attempts | lockout | `pin/route.ts` |
| I-11 | FK index | join / ON DELETE | `deliveries`, junction |

### 5.5.1 ข้อควรระวัง: partial index ที่ใช้ `now()`

`create index ... where expires_at > now()` **ใช้ไม่ได้** เพราะ `now()` ไม่ immutable — Postgres จะปฏิเสธ (หรือ index จะค้างค่าเดิม) ให้ใช้ index ธรรมดาบน `expires_at` (I-7) แล้วปล่อยให้ planner ใช้ range scan

```sql
-- ถูกต้อง
create index if not exists idx_deliveries_expires on public.deliveries (expires_at);
```

### 5.6 Trigger `updated_at` อัตโนมัติ

ปัจจุบัน **ไม่มี trigger ใด ๆ** ในโปรเจกต์ (grep `CREATE TRIGGER` = 0) ทำให้ `updated_at` อัปเดตก็ต่อเมื่อโค้ดส่งค่าเอง (`accounts/route.ts:237`, `[id]/route.ts:308`)

```sql
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['accounts','account_secrets','banners','banner_categories','installment_settings','admin_security']
  loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
```

### 5.7 RLS สำหรับตารางใหม่

```sql
alter table public.accounts           enable row level security;
alter table public.account_secrets    enable row level security;
alter table public.admin_roles        enable row level security;
alter table public.banner_category_links enable row level security;
alter table public.admin_audit_log    enable row level security;
alter table public.admin_pin_attempts enable row level security;

-- ฟังก์ชันช่วย (security definer เพื่อไม่ให้ recurse RLS)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_roles where user_id = auth.uid());
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_roles where user_id = auth.uid() and role = 'owner');
$$;

-- accounts: anon อ่านเฉพาะที่ขายได้
create policy "anon read sellable accounts" on public.accounts
  for select to anon using (status in ('available','installment','sold'));

create policy "admin read accounts" on public.accounts
  for select to authenticated using (public.is_admin());
create policy "owner write accounts" on public.accounts
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- account_secrets: owner เท่านั้น ทุกกรณี
create policy "owner manage secrets" on public.account_secrets
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- admin_roles: อ่านของตัวเองได้ เขียนเฉพาะ owner
create policy "self read role" on public.admin_roles
  for select to authenticated using (user_id = auth.uid() or public.is_owner());
create policy "owner manage roles" on public.admin_roles
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- junction: อ่านสาธารณะ เขียน owner
create policy "public read links" on public.banner_category_links
  for select to anon, authenticated using (true);
create policy "owner write links" on public.banner_category_links
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- audit log: เขียนได้ผ่าน security definer เท่านั้น (ปฏิเสธการเขียนตรง)
create policy "owner read audit" on public.admin_audit_log
  for select to authenticated using (public.is_owner());
```

> ทุกครั้งที่แก้ RLS ให้ทดสอบด้วย `set role anon;` และ `set role authenticated;` ใน SQL editor เพื่อยืนยันผลจริง ไม่ใช่ดูจาก UI

### 5.8 ลบของที่ไม่ได้ใช้ (ทำหลังยืนยันว่าไม่มีข้อมูลเหลือ)

```sql
-- ตรวจก่อน
-- select count(*) from public.accounts_secret;
-- select count(*) from public.accounts_public;

-- drop index ที่ซ้ำกับ UNIQUE
drop index if exists public.idx_deliveries_token;
drop index if exists public.idx_banners_category_public_created;

-- drop ตารางเก่า (เมื่อ backfill เสร็จและผ่านการตรวจแล้วเท่านั้น)
-- drop table if exists public.accounts_secret;
-- drop table if exists public.accounts_public;

-- drop คอลัมน์ที่เลิกใช้
-- alter table public.banners drop column if exists category_id;
-- alter table public.banners drop column if exists category_ids;
-- alter table public.accounts_secret drop column if exists security_status;
```

---

## 6. Performance: ปัญหาที่วัดได้จากโค้ด

> ไม่มี benchmark จริงในโปรเจกต์ (ไม่มี k6/Artillery/`console.time`) ตัวเลขด้านล่างจึงเป็น **จำนวน round trip / ขนาดข้อมูลที่ต้องส่ง** ซึ่งคำนวณจากโค้ดได้ตรง ๆ

### 6.1 ตารางปัญหา

| # | ปัญหา | หลักฐาน | ผลกระทบ | วิธีแก้ |
|---|---|---|---|---|
| P-1 | `/store` ไม่มี `.limit()` | `src/app/store/page.tsx:11-15` | ดึงทุกแถว + render ทุกการ์ด; 1,000 ไอดี = HTML/RSC payload หลาย MB | เพิ่ม `.range(0, 23)` + ปุ่มโหลดเพิ่ม หรือ infinite scroll |
| P-2 | `select('*')` หลายจุด | `store/page.tsx:13`, `accounts/route.ts:111,173,160`, `[id]/route.ts:173`, `banners/route.ts:48`, `banners/page.tsx:28` | คอลัมน์ใหม่ (รวม secret ถ้าเผลอ select จากตารางรวม) ไหลถึง client; payload โต | ระบุคอลัมน์ที่ใช้จริงทุก query |
| P-3 | `/banners` ยิง 4–5 query และดึง banner ทั้งตาราง | `src/app/banners/page.tsx:15-65` | 3 query ที่ `.range(0,999)/(1000,1999)/...` โหลดได้ถึง 2,000+ แถวเข้าหน้าแรก แม้แสดงแค่ 10 รูป/หมวด (`:101-102`) | ทำ RPC/view เดียวคืนเฉพาะ 10 รูปแรกของแต่ละหมวด (ข้อ 6.2) |
| P-4 | ไม่มี `use cache` / `cacheTag` แม้เปิด `cacheComponents` | grep `use cache` ใน `src/` = 0; `next.config.ts:4` | ทุก request render ใหม่ทั้งหมด | ห่อ query หมวด/ผลงานด้วย `use cache` + `cacheTag('banners')` แล้ว invalidate ใน PATCH |
| P-5 | N+1 ที่ `GET /api/admin/banner-categories` | `src/app/api/admin/banner-categories/route.ts:33-53` (2 count ต่อหมวด) | 16 หมวด = 32 round trip ต่อการ refresh 1 ครั้ง และ UI เรียกซ้ำทุก action (`BannerCategoryManager.tsx:277,318,349,379,417`) | ใช้ query เดียว `select category_id, count(*) ... group by` หรือ RPC |
| P-6 | ไม่มี index สำหรับ query หลัก | `001:103-105` | ข้อ 5.5 | รัน SQL ในข้อ 5.5 |
| P-7 | Pagination ที่ `/banners` เรียงด้วยคอลัมน์ไม่ unique | `banners/page.tsx:30-32` (is_pinned, pin_order, created_at) | แถวอาจซ้ำ/หายระหว่าง 2 query ที่รันขนาน | เพิ่ม `id` เป็น tiebreaker หรือเลิกทำ manual batching |
| P-8 | ไม่มี `next/image`, ไม่มี `srcSet` | grep `from 'next/image'` = 0; `next.config.ts` ไม่มี `images` | มือถือโหลดภาพ 1600px ทุกใบ | เพิ่ม `images.remotePatterns` ชี้ `R2_PUBLIC_URL` แล้วเปลี่ยน `<img>` เป็น `<Image>` |
| P-9 | Sweep delivery ใช้ `DELETE` ทั้งตารางทุกครั้งที่สร้าง banner | `banners/route.ts:153` | seq scan + lock ทุกครั้ง (ก่อนมี index) | เพิ่ม index `expires_at` (I-7) และย้ายไป cron/RPC |
| P-10 | ไม่มี connection pooling/ตัวคั่น | ไม่มี config ใด ๆ | Supabase pooler ทำงานแทนอยู่แล้ว — **ไม่ใช่ปัญหา** เว้นแต่ย้ายไป self-host | — |

### 6.2 Query rewrite: `/banners` จาก 4 query → 1 RPC

ปัจจุบัน 4 query (`banners/page.tsx:15-65`) แล้วจัดกลุ่มใน JS (`:72-87`)

```sql
create or replace function public.get_banner_sections(p_per_category int default 10)
returns table (
  category_id uuid,
  category_name text,
  category_slug text,
  logo_url text,
  hide_preview boolean,
  sort_order int,
  total_count bigint,
  banner_ids uuid[],
  banner_urls text[],
  banner_codes text[]
)
language sql stable as $$
  with cats as (
    select c.id, c.name, c.slug, c.logo_url, c.hide_preview, c.sort_order
    from public.banner_categories c
  ),
  counts as (
    select l.category_id, count(*) as total
    from public.banner_category_links l
    join public.banners b on b.id = l.banner_id and b.is_public
    group by l.category_id
  ),
  ranked as (
    select
      l.category_id, b.id, b.watermarked_url, b.code,
      row_number() over (
        partition by l.category_id
        order by l.is_pinned desc, l.pin_order asc, b.created_at desc
      ) as rn
    from public.banner_category_links l
    join public.banners b on b.id = l.banner_id and b.is_public
  )
  select
    c.id, c.name, c.slug, c.logo_url, c.hide_preview, c.sort_order,
    coalesce(ct.total, 0),
    coalesce(array_agg(r.id) filter (where r.rn <= p_per_category), '{}'),
    coalesce(array_agg(r.watermarked_url) filter (where r.rn <= p_per_category), '{}'),
    coalesce(array_agg(r.code) filter (where r.rn <= p_per_category), '{}')
  from cats c
  left join counts ct on ct.category_id = c.id
  left join ranked r on r.category_id = c.id
  group by c.id, c.name, c.slug, c.logo_url, c.hide_preview, c.sort_order, ct.total
  order by c.hide_preview asc, c.sort_order asc, c.name asc;
$$;
```

ข้อดี: ส่งเฉพาะ 10 URL/หมวด, ไม่ต้องมี query ที่ 4–5, ไม่มีปัญหา pagination ที่ไม่ stable

### 6.3 Query rewrite: N+1 ของหมวด

```sql
-- แทน 2 count ต่อหมวดใน banner-categories/route.ts:33-53
select
  c.id, c.name, c.slug, c.description, c.logo_url, c.sort_order, c.hide_preview,
  count(l.banner_id) as total_count,
  count(l.banner_id) filter (where l.is_pinned) as pinned_count
from public.banner_categories c
left join public.banner_category_links l on l.category_id = c.id
group by c.id
order by c.hide_preview asc, c.sort_order asc;
```

### 6.4 Query rewrite: `/store`

```ts
// src/app/store/page.tsx — แทน select('*') ที่ไม่มี limit
const PAGE_SIZE = 24;

const { data, error, count } = await supabase
  .from('accounts')
  .select(
    'id, code, status, price, min_down_weekly, min_down_monthly, tags, description, main_image_url, gallery_urls, created_at',
    { count: 'exact' }
  )
  .in('status', ['available', 'installment', 'sold'])
  .order('created_at', { ascending: false })
  .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

if (error) throw error;   // ปัจจุบันกลืน error ที่ :17
```

### 6.5 Caching ที่ควรใช้ (Next 16 Cache Components)

```ts
// src/lib/queries/banners.ts (ใหม่)
import { cacheTag } from 'next/cache';   // Next 16: import ตรง ไม่มี prefix unstable_ (ยืนยันใน node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md)

export async function getBannerSections() {
  'use cache';
  cacheTag('banners');

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc('get_banner_sections', { p_per_category: 10 });
  return data ?? [];
}
```

แล้ว invalidate ใน route ที่แก้ข้อมูล:

```ts
import { revalidateTag } from 'next/cache';
// หลัง PATCH/POST/DELETE สำเร็จ
revalidateTag('banners');
```

> ยังควรตรวจ API จริงของ Next 16.4.6 ใน `node_modules/next/dist/docs/` ซ้ำก่อนเขียนจริง — โปรเจกต์นี้ตั้ง `cacheComponents: true` และ `partialPrefetching: true` ที่ `next.config.ts:3-15` ซึ่งมีผลต่อว่าฟังก์ชันใดใช้ได้ในบริบทใด

### 6.6 ขนาดข้อมูลที่ต้องระวัง

| ตาราง | อัตราการโต | เหตุผล |
|---|---|---|
| `banners` | +1 แถว/รูปที่อัปโหลด (อัปโหลดทีละ 30+ ไฟล์ได้ในครั้งเดียว) | `BannerBulkUploader.tsx:96-182` |
| `deliveries` | +1 แถว/งาน แต่ **ถูกลบเมื่อหมดอายุ** (`banners/route.ts:153`) | ขนาดคาดคงที่ ~7 วันของงาน |
| `admin_audit_log` | +1 แถว/การกระทำ | ต้องมี retention (เช่น 180 วัน) |
| `admin_pin_attempts` | +1 แถว/การลอง PIN | ต้องมี retention 30 วัน |

---

## 7. แผนดำเนินการและเกณฑ์ตรวจรับ

| ลำดับ | งาน | เกณฑ์ผ่าน |
|---|---|---|
| 1 | รัน `002_align_schema.sql` (ข้อ 5.1–5.4) | `select count(*) from public.accounts` = จำนวนไอดีเดิม |
| 2 | แก้ status ให้เป็นตัวพิมพ์เล็กทั้ง 4 ชั้น | `npx vitest run` ผ่าน + `/store` แสดงไอดี + admin สร้างไอดีใหม่ได้ |
| 3 | เพิ่ม index ทั้งหมด (5.5) | `explain analyze` ของ query `/store` และ `/banners` ใช้ Index Scan ไม่ใช่ Seq Scan |
| 4 | เพิ่ม trigger `updated_at` (5.6) | PATCH แล้ว `updated_at` เปลี่ยนโดยไม่ต้องส่งจากโค้ด |
| 5 | เปิด RLS ใหม่ (5.7) | `set role anon;` อ่าน `account_secrets` ได้ 0 แถว และอ่าน `accounts` เฉพาะที่ขายได้ |
| 6 | เปลี่ยน `/banners` เป็น RPC | query count ต่อ 1 page load = 1 (จาก 4–5) |
| 7 | ลบตาราง/คอลัมน์เก่า (5.8) | ไม่มี query ใน `src/` อ้างถึง `accounts_public`/`accounts_secret` แล้ว |

### 7.1 Checklist ก่อนถือว่าเสร็จ

- [ ] `grep -r "from('accounts" src/` คืนชื่อตารางชุดเดียว (ไม่ปน `accounts_public` / `accounts`)
- [ ] `grep -rn "Available\|SoldOut\|Unavailable\|'Installment'" src/` ไม่เหลือ PascalCase
- [ ] `grep -rn "category_ids" src/` = 0 (ถ้าย้ายไป junction แล้ว)
- [ ] `grep -rn "private_notes_enc" src/` ยังใช้ แต่ `unpackPrivateNotes` ถูกลบ
- [ ] `grep -rn "admin_roles" src/` ใช้ helper กลาง ไม่เขียนซ้ำ 3 ที่
- [ ] `select indexrelname from pg_stat_user_indexes where idx_scan = 0;` ไม่มี index ที่ไม่มีใครใช้
- [ ] `select * from pg_policies where schemaname='public';` ไม่มี `USING (true)` กับ `authenticated` อีก

---

## 8. ภาคผนวก: คำสั่งตรวจ schema จริงเทียบกับเอกสาร

```sql
-- 1) ตารางที่มีอยู่จริง
select table_name from information_schema.tables
where table_schema = 'public' order by 1;

-- 2) คอลัมน์ของตารางที่โค้ดใช้
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in
  ('accounts','accounts_public','accounts_secret','banners','banner_categories','deliveries','admin_roles','admin_security')
order by table_name, ordinal_position;

-- 3) CHECK constraint ทั้งหมด
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid)
from pg_constraint
where contype = 'c' and connamespace = 'public'::regnamespace;

-- 4) RLS ที่เปิดอยู่
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r';

-- 5) policy ทั้งหมด (มองหาคำว่า true)
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;

-- 6) index ที่มีอยู่และจำนวนครั้งที่ถูกใช้
select relname as table_name, indexrelname, idx_scan, idx_tup_read
from pg_stat_user_indexes
where schemaname = 'public' order by relname, indexrelname;

-- 7) ค่า status ที่มีจริง (จับ drift)
select status, count(*) from public.accounts group by 1 order by 2 desc;
```

> ผลจาก query เหล่านี้คือ "ความจริง" ที่ต้องเอามาแทนที่สมมติฐานในเอกสารทั้งชุดนี้ — ถ้าผลออกมาไม่ตรงกับข้อ 2 ถือว่าข้อ 2 คือรายการที่ต้องแก้ ไม่ใช่รายการที่ต้องเชื่อ
