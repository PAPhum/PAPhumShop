-- 1. ฟังก์ชันตรวจสอบสิทธิ์ owner
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_roles
    where user_id = auth.uid() and role = 'owner'
  );
$$;

-- 2. ปิดการอ่าน deliveries ของบุคคลภายนอก (anon) และให้เฉพาะ owner จัดการ
drop policy if exists "Public read active deliveries" on public.deliveries;
drop policy if exists "Public can read active deliveries" on public.deliveries;
drop policy if exists "Authenticated manage deliveries" on public.deliveries;
drop policy if exists "Admin full access on deliveries" on public.deliveries;
revoke all on public.deliveries from anon;

create policy "owner manage deliveries"
  on public.deliveries for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- 3. จำกัดสิทธิ์ตาราง accounts_secret, banners, banner_categories, installment_settings
drop policy if exists "Admin full access on accounts_secret" on public.accounts_secret;
create policy "owner manage account secrets"
  on public.accounts_secret for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "Authenticated manage banners" on public.banners;
drop policy if exists "Admin full access on banners" on public.banners;
create policy "owner manage banners"
  on public.banners for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "Authenticated manage banner categories" on public.banner_categories;
drop policy if exists "Admin full access on banner categories" on public.banner_categories;
create policy "owner manage categories"
  on public.banner_categories for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "Admin can update installment settings" on public.installment_settings;
create policy "owner manage settings"
  on public.installment_settings for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- 4. ป้องกันการแก้ pin_hash ตรง ๆ ผ่าน PostgREST
drop policy if exists "Users can manage own security" on public.admin_security;
drop policy if exists "Admin full access on admin_security" on public.admin_security;
create policy "owner read own security"
  on public.admin_security for select to authenticated
  using (auth.uid() = user_id and public.is_owner());