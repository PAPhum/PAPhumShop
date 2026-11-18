-- ลบคอลัมน์ที่เพิ่งสร้างรอบที่แล้ว (ถ้ามี) เพื่อสร้างใหม่เป็น uuid[] ให้ตรงกับ category_ids
alter table public.banners
  drop column if exists pinned_category_ids;

alter table public.banners
  add column if not exists pinned_category_ids uuid[] not null default '{}'::uuid[],
  add column if not exists pin_orders jsonb not null default '{}'::jsonb;

create index if not exists idx_banners_pinned_category_ids
  on public.banners using gin (pinned_category_ids);

-- ย้ายข้อมูลปักหมุดเดิม (is_pinned = true) ไปใส่ในทุกหมวดหมู่ที่รูปนั้นสังกัดอยู่ ณ ปัจจุบัน
update public.banners
set
  pinned_category_ids = coalesce(category_ids, '{}'::uuid[]),
  pin_orders = coalesce(
    (
      select jsonb_object_agg(cat_id::text, greatest(1, pin_order))
      from unnest(coalesce(category_ids, '{}'::uuid[])) as cat_id
    ),
    '{}'::jsonb
  )
where is_pinned = true
  and cardinality(pinned_category_ids) = 0;