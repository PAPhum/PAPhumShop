create table if not exists public.pin_attempts (
  id bigint generated always as identity primary key,
  attempt_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pin_attempts_key_created
  on public.pin_attempts (attempt_key, created_at desc);

alter table public.pin_attempts enable row level security;