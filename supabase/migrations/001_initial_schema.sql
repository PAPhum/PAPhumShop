-- เปิดใช้งาน pgcrypto สำหรับสร้าง UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ตารางข้อมูลไอดีฝั่งสาธารณะ (แสดงหน้าเว็บเฉพาะ status = 'available')
CREATE TABLE public.accounts_public (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'installment', 'sold')),
  price INTEGER NOT NULL CHECK (price >= 0),
  min_down_weekly INTEGER NOT NULL DEFAULT 1000 CHECK (min_down_weekly >= 0),
  min_down_monthly INTEGER NOT NULL DEFAULT 2000 CHECK (min_down_monthly >= 0),
  interest_free_weeks INTEGER NOT NULL DEFAULT 2 CHECK (interest_free_weeks >= 0),
  interest_free_months INTEGER NOT NULL DEFAULT 1 CHECK (interest_free_months >= 0),
  tags TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  main_image_url TEXT NOT NULL,
  gallery_urls TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. ตารางข้อมูลลับไอดีเกม (เฉพาะแอดมินเท่านั้น ข้อมูลสำคัญถูกเข้ารหัส AES-256-GCM)
CREATE TABLE public.accounts_secret (
  account_id UUID PRIMARY KEY REFERENCES public.accounts_public(id) ON DELETE CASCADE,
  cost INTEGER NOT NULL DEFAULT 0,
  game_uid TEXT,
  login_provider TEXT,
  username_encrypted TEXT,
  password_encrypted TEXT,
  gmail_encrypted TEXT,
  gmail_password_encrypted TEXT,
  authenticator_encrypted TEXT,
  security_status JSONB NOT NULL DEFAULT '{
    "garena": "clean",
    "phone": "ready",
    "email": "full_access",
    "id_card": "clean"
  }'::jsonb,
  private_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. ตารางตั้งค่าเรทผ่อนกลาง (กำหนดค่าเริ่มต้นโดยแอดมิน)
CREATE TABLE public.installment_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  weekly_interest_rate INTEGER NOT NULL DEFAULT 140,
  monthly_interest_rate INTEGER NOT NULL DEFAULT 600,
  default_min_down_weekly INTEGER NOT NULL DEFAULT 1000,
  default_min_down_monthly INTEGER NOT NULL DEFAULT 2000,
  default_free_weeks INTEGER NOT NULL DEFAULT 2,
  default_free_months INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.installment_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 4. ตารางหมวดหมู่รูปแบบป้าย (เช่น PAPHUM, V1, V2, V3)
CREATE TABLE public.banner_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.banner_categories (name, slug, sort_order) VALUES
  ('แบบ PAPHUM', 'paphum', 1),
  ('แบบ V1', 'v1', 2),
  ('แบบ V2', 'v2', 3),
  ('แบบ V3', 'v3', 4)
ON CONFLICT (slug) DO NOTHING;

-- 5. ตารางผลงานตัดป้าย (ไฟล์ WebP ติดลายน้ำสำหรับแสดงหน้าพอร์ตโฟลิโอ)
CREATE TABLE public.banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.banner_categories(id) ON DELETE SET NULL,
  code TEXT,
  watermarked_url TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. ตารางลิงก์ส่งงานดาวน์โหลดต้นฉบับให้ลูกค้า (ลบอัตโนมัติใน R2 ภายใน 7 วัน)
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  banner_id UUID REFERENCES public.banners(id) ON DELETE SET NULL,
  original_r2_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. ตารางเก็บรหัส PIN 6 หลักของแอดมิน (แบบแฮช)
CREATE TABLE public.admin_security (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index สำหรับเพิ่มความเร็วในการดึงข้อมูลและแบ่งหน้า (Pagination)
CREATE INDEX idx_accounts_public_status_created ON public.accounts_public(status, created_at DESC);
CREATE INDEX idx_banners_category_public_created ON public.banners(category_id, is_public, created_at DESC);
CREATE INDEX idx_deliveries_token ON public.deliveries(token);

-- เปิดใช้งาน Row Level Security (RLS) ทุกตาราง
ALTER TABLE public.accounts_public ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_secret ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banner_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_security ENABLE ROW LEVEL SECURITY;

-- กฎ RLS: accounts_public (ลูกค้าอ่านได้เฉพาะ status = 'available')
CREATE POLICY "Public can view available accounts"
  ON public.accounts_public FOR SELECT
  TO anon
  USING (status = 'available');

CREATE POLICY "Admin full access on accounts_public"
  ON public.accounts_public FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- กฎ RLS: accounts_secret (ห้าม anon อ่าน/เขียนเด็ดขาด เข้าถึงได้เฉพาะ authenticated admin)
CREATE POLICY "Admin full access on accounts_secret"
  ON public.accounts_secret FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- กฎ RLS: installment_settings
CREATE POLICY "Public can read installment settings"
  ON public.installment_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admin can update installment settings"
  ON public.installment_settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- กฎ RLS: banner_categories
CREATE POLICY "Public can read banner categories"
  ON public.banner_categories FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admin full access on banner categories"
  ON public.banner_categories FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- กฎ RLS: banners
CREATE POLICY "Public can read public banners"
  ON public.banners FOR SELECT
  TO anon
  USING (is_public = true);

CREATE POLICY "Admin full access on banners"
  ON public.banners FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- กฎ RLS: deliveries
CREATE POLICY "Public can read active deliveries"
  ON public.deliveries FOR SELECT
  TO anon, authenticated
  USING (expires_at > now());

CREATE POLICY "Admin full access on deliveries"
  ON public.deliveries FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- กฎ RLS: admin_security
CREATE POLICY "Admin can manage own PIN"
  ON public.admin_security FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
