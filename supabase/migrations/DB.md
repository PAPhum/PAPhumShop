--------------------------------------------------------
  -- 1. ดูรายชื่อตารางและคอลัมน์ทั้งหมดใน schema public
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
---------------------------------------------------------------

  | table_name           | column_name              | data_type                | is_nullable | column_default                                                                             |
| -------------------- | ------------------------ | ------------------------ | ----------- | ------------------------------------------------------------------------------------------ |
| accounts             | id                       | uuid                     | NO          | gen_random_uuid()                                                                          |
| accounts             | code                     | text                     | NO          | null                                                                                       |
| accounts             | status                   | text                     | NO          | 'Unavailable'::text                                                                        |
| accounts             | price                    | numeric                  | NO          | 0                                                                                          |
| accounts             | cost                     | numeric                  | NO          | 0                                                                                          |
| accounts             | min_down_weekly          | numeric                  | NO          | 0                                                                                          |
| accounts             | min_down_monthly         | numeric                  | NO          | 0                                                                                          |
| accounts             | interest_free_weeks      | integer                  | NO          | 2                                                                                          |
| accounts             | interest_free_months     | integer                  | NO          | 1                                                                                          |
| accounts             | tags                     | ARRAY                    | NO          | '{}'::text[]                                                                               |
| accounts             | description              | text                     | YES         | null                                                                                       |
| accounts             | main_image_url           | text                     | YES         | null                                                                                       |
| accounts             | gallery_urls             | ARRAY                    | NO          | '{}'::text[]                                                                               |
| accounts             | game_uid_enc             | text                     | YES         | null                                                                                       |
| accounts             | login_provider_enc       | text                     | YES         | null                                                                                       |
| accounts             | username_enc             | text                     | YES         | null                                                                                       |
| accounts             | password_enc             | text                     | YES         | null                                                                                       |
| accounts             | authenticator_enc        | text                     | YES         | null                                                                                       |
| accounts             | gmail_enc                | text                     | YES         | null                                                                                       |
| accounts             | gmail_password_enc       | text                     | YES         | null                                                                                       |
| accounts             | gmail_authenticator_enc  | text                     | YES         | null                                                                                       |
| accounts             | gmail_recovery_enc       | text                     | YES         | null                                                                                       |
| accounts             | private_notes_enc        | text                     | YES         | null                                                                                       |
| accounts             | security_status          | jsonb                    | YES         | null                                                                                       |
| accounts             | created_at               | timestamp with time zone | NO          | now()                                                                                      |
| accounts             | updated_at               | timestamp with time zone | NO          | now()                                                                                      |
| accounts_public      | id                       | uuid                     | YES         | null                                                                                       |
| accounts_public      | code                     | text                     | YES         | null                                                                                       |
| accounts_public      | status                   | text                     | YES         | null                                                                                       |
| accounts_public      | price                    | numeric                  | YES         | null                                                                                       |
| accounts_public      | min_down_weekly          | numeric                  | YES         | null                                                                                       |
| accounts_public      | min_down_monthly         | numeric                  | YES         | null                                                                                       |
| accounts_public      | interest_free_weeks      | integer                  | YES         | null                                                                                       |
| accounts_public      | interest_free_months     | integer                  | YES         | null                                                                                       |
| accounts_public      | tags                     | ARRAY                    | YES         | null                                                                                       |
| accounts_public      | description              | text                     | YES         | null                                                                                       |
| accounts_public      | main_image_url           | text                     | YES         | null                                                                                       |
| accounts_public      | gallery_urls             | ARRAY                    | YES         | null                                                                                       |
| accounts_public      | created_at               | timestamp with time zone | YES         | null                                                                                       |
| accounts_public      | updated_at               | timestamp with time zone | YES         | null                                                                                       |
| accounts_secret      | account_id               | uuid                     | NO          | null                                                                                       |
| accounts_secret      | cost                     | integer                  | NO          | 0                                                                                          |
| accounts_secret      | game_uid                 | text                     | YES         | null                                                                                       |
| accounts_secret      | login_provider           | text                     | YES         | null                                                                                       |
| accounts_secret      | username_encrypted       | text                     | YES         | null                                                                                       |
| accounts_secret      | password_encrypted       | text                     | YES         | null                                                                                       |
| accounts_secret      | gmail_encrypted          | text                     | YES         | null                                                                                       |
| accounts_secret      | gmail_password_encrypted | text                     | YES         | null                                                                                       |
| accounts_secret      | authenticator_encrypted  | text                     | YES         | null                                                                                       |
| accounts_secret      | security_status          | jsonb                    | NO          | '{"email": "full_access", "phone": "ready", "garena": "clean", "id_card": "clean"}'::jsonb |
| accounts_secret      | private_notes            | text                     | YES         | null                                                                                       |
| accounts_secret      | updated_at               | timestamp with time zone | NO          | now()                                                                                      |
| admin_roles          | user_id                  | uuid                     | NO          | null                                                                                       |
| admin_roles          | username                 | text                     | NO          | null                                                                                       |
| admin_roles          | role                     | text                     | NO          | null                                                                                       |
| admin_roles          | created_at               | timestamp with time zone | NO          | now()                                                                                      |
| admin_security       | user_id                  | uuid                     | NO          | null                                                                                       |
| admin_security       | pin_hash                 | text                     | NO          | null                                                                                       |
| admin_security       | pin_salt                 | text                     | NO          | null                                                                                       |
| admin_security       | updated_at               | timestamp with time zone | NO          | now()                                                                                      |
| banner_categories    | id                       | uuid                     | NO          | gen_random_uuid()                                                                          |
| banner_categories    | name                     | text                     | NO          | null                                                                                       |
| banner_categories    | slug                     | text                     | NO          | null                                                                                       |
| banner_categories    | sort_order               | integer                  | NO          | 0                                                                                          |
| banner_categories    | created_at               | timestamp with time zone | NO          | now()                                                                                      |
| banner_categories    | description              | text                     | YES         | null                                                                                       |
| banner_categories    | logo_url                 | text                     | YES         | null                                                                                       |
| banner_categories    | icon_url                 | text                     | YES         | null                                                                                       |
| banner_categories    | hide_preview             | boolean                  | NO          | false                                                                                      |
| banners              | id                       | uuid                     | NO          | gen_random_uuid()                                                                          |
| banners              | category_id              | uuid                     | YES         | null                                                                                       |
| banners              | code                     | text                     | YES         | null                                                                                       |
| banners              | watermarked_url          | text                     | NO          | null                                                                                       |
| banners              | is_public                | boolean                  | NO          | true                                                                                       |
| banners              | created_at               | timestamp with time zone | NO          | now()                                                                                      |
| banners              | is_pinned                | boolean                  | NO          | false                                                                                      |
| banners              | pin_order                | integer                  | NO          | 0                                                                                          |
| banners              | category_ids             | ARRAY                    | NO          | '{}'::uuid[]                                                                               |
| deliveries           | id                       | uuid                     | NO          | gen_random_uuid()                                                                          |
| deliveries           | token                    | text                     | NO          | null                                                                                       |
| deliveries           | banner_id                | uuid                     | YES         | null                                                                                       |
| deliveries           | original_r2_key          | text                     | NO          | null                                                                                       |
| deliveries           | original_filename        | text                     | NO          | null                                                                                       |
| deliveries           | expires_at               | timestamp with time zone | NO          | null                                                                                       |
| deliveries           | created_at               | timestamp with time zone | NO          | now()                                                                                      |
| installment_settings | id                       | integer                  | NO          | 1                                                                                          |
| installment_settings | weekly_interest_rate     | integer                  | NO          | 140                                                                                        |
| installment_settings | monthly_interest_rate    | integer                  | NO          | 600                                                                                        |
| installment_settings | default_min_down_weekly  | integer                  | NO          | 1000                                                                                       |
| installment_settings | default_min_down_monthly | integer                  | NO          | 2000                                                                                       |
| installment_settings | default_free_weeks       | integer                  | NO          | 2                                                                                          |
| installment_settings | default_free_months      | integer                  | NO          | 1                                                                                          |
| installment_settings | updated_at               | timestamp with time zone | NO          | now()                                                                                      |

-- 2. ดูคำสั่งสร้าง View ทั้งหมด
SELECT table_name AS view_name, view_definition
FROM information_schema.views
WHERE table_schema = 'public';
| view_name       | view_definition                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| accounts_public |  SELECT id,<br>    code,<br>    status,<br>    price,<br>    min_down_weekly,<br>    min_down_monthly,<br>    interest_free_weeks,<br>    interest_free_months,<br>    tags,<br>    description,<br>    main_image_url,<br>    gallery_urls,<br>    created_at,<br>    updated_at<br>   FROM accounts<br>  WHERE (status = ANY (ARRAY['Available'::text, 'Installment'::text, 'SoldOut'::text])); |

-- 3. ดู RLS Policies ทั้งหมด
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public';

| schemaname | tablename            | policyname                             | permissive | roles                | cmd    | qual                                                                                                             | with_check                                                                                                       |
| ---------- | -------------------- | -------------------------------------- | ---------- | -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| public     | accounts_secret      | Admin full access on accounts_secret   | PERMISSIVE | {authenticated}      | ALL    | true                                                                                                             | true                                                                                                             |
| public     | admin_roles          | Users can read own role                | PERMISSIVE | {authenticated}      | SELECT | (auth.uid() = user_id)                                                                                           | null                                                                                                             |
| public     | admin_security       | Admin manage own pin                   | PERMISSIVE | {authenticated}      | ALL    | (auth.uid() = user_id)                                                                                           | (auth.uid() = user_id)                                                                                           |
| public     | admin_security       | Admin can manage own PIN               | PERMISSIVE | {authenticated}      | ALL    | (auth.uid() = user_id)                                                                                           | (auth.uid() = user_id)                                                                                           |
| public     | accounts             | Owners manage accounts                 | PERMISSIVE | {authenticated}      | ALL    | (EXISTS ( SELECT 1<br>   FROM admin_roles r<br>  WHERE ((r.user_id = auth.uid()) AND (r.role = 'owner'::text)))) | (EXISTS ( SELECT 1<br>   FROM admin_roles r<br>  WHERE ((r.user_id = auth.uid()) AND (r.role = 'owner'::text)))) |
| public     | deliveries           | Authenticated manage deliveries        | PERMISSIVE | {authenticated}      | ALL    | true                                                                                                             | true                                                                                                             |
| public     | deliveries           | Public read active deliveries          | PERMISSIVE | {anon,authenticated} | SELECT | (expires_at > now())                                                                                             | null                                                                                                             |
| public     | deliveries           | Admin full access on deliveries        | PERMISSIVE | {authenticated}      | ALL    | true                                                                                                             | true                                                                                                             |
| public     | deliveries           | Public can read active deliveries      | PERMISSIVE | {anon,authenticated} | SELECT | (expires_at > now())                                                                                             | null                                                                                                             |
| public     | installment_settings | Owners update installment settings     | PERMISSIVE | {authenticated}      | ALL    | (EXISTS ( SELECT 1<br>   FROM admin_roles r<br>  WHERE ((r.user_id = auth.uid()) AND (r.role = 'owner'::text)))) | (EXISTS ( SELECT 1<br>   FROM admin_roles r<br>  WHERE ((r.user_id = auth.uid()) AND (r.role = 'owner'::text)))) |
| public     | installment_settings | Public read installment settings       | PERMISSIVE | {anon,authenticated} | SELECT | true                                                                                                             | null                                                                                                             |
| public     | installment_settings | Admin can update installment settings  | PERMISSIVE | {authenticated}      | ALL    | true                                                                                                             | true                                                                                                             |
| public     | installment_settings | Public can read installment settings   | PERMISSIVE | {anon,authenticated} | SELECT | true                                                                                                             | null                                                                                                             |
| public     | banners              | Authenticated manage banners           | PERMISSIVE | {authenticated}      | ALL    | true                                                                                                             | true                                                                                                             |
| public     | banners              | Public read public banners             | PERMISSIVE | {anon,authenticated} | SELECT | (is_public = true)                                                                                               | null                                                                                                             |
| public     | banners              | Admin full access on banners           | PERMISSIVE | {authenticated}      | ALL    | true                                                                                                             | true                                                                                                             |
| public     | banners              | Public can read public banners         | PERMISSIVE | {anon}               | SELECT | (is_public = true)                                                                                               | null                                                                                                             |
| public     | banner_categories    | Authenticated manage banner categories | PERMISSIVE | {authenticated}      | ALL    | true                                                                                                             | true                                                                                                             |
| public     | banner_categories    | Public read banner categories          | PERMISSIVE | {anon,authenticated} | SELECT | true                                                                                                             | null                                                                                                             |
| public     | banner_categories    | Admin full access on banner categories | PERMISSIVE | {authenticated}      | ALL    | true                                                                                                             | true                                                                                                             |
| public     | banner_categories    | Public can read banner categories      | PERMISSIVE | {anon,authenticated} | SELECT | true                                                                                                             | null                                                                                                             |
