create index if not exists idx_accounts_status_created
  on public.accounts (status, created_at desc);

create index if not exists idx_banners_public_pin
  on public.banners (is_public, is_pinned desc, pin_order, created_at desc);

create index if not exists idx_banners_category_ids
  on public.banners using gin (category_ids);

create index if not exists idx_deliveries_expires
  on public.deliveries (expires_at);