-- 1. ฟังก์ชันตรวจสอบสิทธิ์ Admin (ทั้ง owner และ staff) และ Owner
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_roles
    where user_id = auth.uid() and role in ('owner', 'staff')
  );
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_roles
    where user_id = auth.uid() and role = 'owner'
  );
$$;

-- 2. ตาราง admin_security: ปิด INSERT/UPDATE/DELETE ฝั่ง Client ทั้งหมด (ให้แก้ผ่าน Service Role API เท่านั้น)
drop policy if exists "Users can manage own security" on public.admin_security;
drop policy if exists "Admin full access on admin_security" on public.admin_security;
drop policy if exists "Admin manage own pin" on public.admin_security;
drop policy if exists "Admin can manage own PIN" on public.admin_security;
drop policy if exists "owner read own security" on public.admin_security;

create policy "admin read own security"
  on public.admin_security for select to authenticated
  using (auth.uid() = user_id and public.is_admin());

-- 3. ตาราง banners: Admin (owner + staff) อ่าน/เพิ่ม/แก้ไขได้ (รวมรูปที่ไม่ public), ลบได้เฉพาะ owner
drop policy if exists "Authenticated manage banners" on public.banners;
drop policy if exists "Admin full access on banners" on public.banners;
drop policy if exists "owner manage banners" on public.banners;
drop policy if exists "Public read public banners" on public.banners;
drop policy if exists "Public can read public banners" on public.banners;

create policy "Public can read public banners"
  on public.banners for select to anon, authenticated
  using (is_public = true or public.is_admin());

create policy "Admin insert and update banners"
  on public.banners for insert to authenticated
  with check (public.is_admin());

create policy "Admin update banners"
  on public.banners for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Owner delete banners"
  on public.banners for delete to authenticated
  using (public.is_owner());

-- 4. ตาราง banner_categories: Admin (owner + staff) เพิ่ม/แก้ไขได้, ลบได้เฉพาะ owner
drop policy if exists "Authenticated manage banner categories" on public.banner_categories;
drop policy if exists "Admin full access on banner categories" on public.banner_categories;
drop policy if exists "owner manage categories" on public.banner_categories;
drop policy if exists "Public read banner categories" on public.banner_categories;
drop policy if exists "Public can read banner categories" on public.banner_categories;

create policy "Public can read banner categories"
  on public.banner_categories for select to anon, authenticated
  using (true);

create policy "Admin insert banner categories"
  on public.banner_categories for insert to authenticated
  with check (public.is_admin());

create policy "Admin update banner categories"
  on public.banner_categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Owner delete banner categories"
  on public.banner_categories for delete to authenticated
  using (public.is_owner());

-- 5. ตาราง deliveries: ปิด anon, Admin (owner + staff) อ่าน/เพิ่ม/ลบแถวหมดอายุได้
drop policy if exists "Public read active deliveries" on public.deliveries;
drop policy if exists "Public can read active deliveries" on public.deliveries;
drop policy if exists "Authenticated manage deliveries" on public.deliveries;
drop policy if exists "Admin full access on deliveries" on public.deliveries;
drop policy if exists "owner manage deliveries" on public.deliveries;
revoke all on public.deliveries from anon;

create policy "Admin manage deliveries"
  on public.deliveries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 6. ตาราง installment_settings: ลบ policy ซ้ำ เหลือเฉพาะ public read + owner manage
drop policy if exists "Admin can update installment settings" on public.installment_settings;
drop policy if exists "Owners update installment settings" on public.installment_settings;
drop policy if exists "Public read installment settings" on public.installment_settings;
drop policy if exists "Public can read installment settings" on public.installment_settings;
drop policy if exists "owner manage settings" on public.installment_settings;

create policy "Public can read installment settings"
  on public.installment_settings for select to anon, authenticated
  using (true);

create policy "Owner manage installment settings"
  on public.installment_settings for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- 7. ลบ policy ค้างของตารางเก่า accounts_secret (ถ้าตารางยังอยู่)
drop policy if exists "Admin full access on accounts_secret" on public.accounts_secret;
drop policy if exists "owner manage account secrets" on public.accounts_secret;