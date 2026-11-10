-- Extra tables the Go API needs when it runs against its own Postgres (the web app on Lovable Cloud does not use these).
create table if not exists users (id uuid primary key default gen_random_uuid(), email text unique not null, created_at timestamptz default now());

create table if not exists email_codes (
  id bigserial primary key,
  email text not null,
  code_hash text not null,
  used boolean not null default false,
  expires_at timestamptz not null
);
create index if not exists email_codes_lookup on email_codes(email, code_hash);

create table if not exists refresh_tokens (
  token_hash text primary key,
  family text not null,
  user_id uuid not null,
  device_hash text not null,
  used boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists refresh_tokens_family on refresh_tokens(family);
create index if not exists refresh_tokens_user on refresh_tokens(user_id);
-- Also apply the profiles / media_assets / activity_logs / auth_throttle + throttle_hit() definitions from the web schema.
