-- 1. ลบตารางระบบ PIN 6 หลัก ประวัติการลองรหัส และตารางข้อมูลลับเก่าที่ไม่ได้ใช้แล้ว
drop table if exists public.pin_attempts cascade;
drop table if exists public.admin_security cascade;
drop table if exists public.accounts_secret cascade;

-- 2. ปรับสถานะไอดีที่เป็น Unavailable เดิมให้เป็น Available ทั้งหมด
update public.accounts
set status = 'Available'
where status = 'Unavailable';

-- 3. ลบคอลัมน์ข้อมูลลับเก่าออกจากตาราง accounts (ถ้ามี)
-- หมายเหตุ: หากมี View accounts_public ผูกอยู่ ให้สร้าง View ใหม่ทับก่อน
drop view if exists public.accounts_public;

alter table public.accounts
  drop column if exists cost,
  drop column if exists game_uid_enc,
  drop column if exists login_provider_enc,
  drop column if exists username_enc,
  drop column if exists password_enc,
  drop column if exists authenticator_enc,
  drop column if exists gmail_enc,
  drop column if exists gmail_password_enc,
  drop column if exists gmail_authenticator_enc,
  drop column if exists gmail_recovery_enc,
  drop column if exists private_notes_enc;

-- สร้าง View accounts_public ใหม่ให้ตรงกับคอลัมน์ปัจจุบัน
create view public.accounts_public as
select
  id,
  code,
  status,
  price,
  min_down_weekly,
  min_down_monthly,
  interest_free_weeks,
  interest_free_months,
  tags,
  description,
  main_image_url,
  gallery_urls,
  created_at,
  updated_at
from public.accounts;

grant select on public.accounts_public to anon, authenticated;

-- 4. ตั้งค่า RLS บนตาราง accounts ให้รัดกุม (ลูกค้าอ่านได้เฉพาะ 3 สถานะ, แก้ไข/ลบได้เฉพาะ Owner)
alter table public.accounts enable row level security;

drop policy if exists "Public can view available accounts" on public.accounts;
drop policy if exists "Admin full access on accounts" on public.accounts;
drop policy if exists "Owner manage accounts" on public.accounts;

create policy "Public can view store accounts"
  on public.accounts for select
  to anon, authenticated
  using (status in ('Available', 'Installment', 'SoldOut'));

create policy "Owner manage accounts"
  on public.accounts for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());