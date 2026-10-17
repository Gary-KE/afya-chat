-- Afya Chat database (Supabase -> SQL Editor -> paste -> Run)
create extension if not exists pgcrypto;

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('web', 'whatsapp')),
  contact_hash text,                 -- salted SHA-256 of the phone number, never the number itself
  contact_masked text,               -- e.g. +2547••••234, for the dashboard
  language text not null default 'en' check (language in ('en', 'sw')),
  red_flag boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists conversations_contact on conversations (channel, contact_hash) where contact_hash is not null;
create index if not exists conversations_updated on conversations (updated_at desc);

create table if not exists messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists messages_by_conversation on messages (conversation_id, created_at);

-- Health conversations are private: row-level security on, and no public policies.
-- Only the server (service role key) can read or write.
alter table conversations enable row level security;
alter table messages enable row level security;

-- Delete conversations older than 90 days (run on a schedule, or by hand).
-- delete from conversations where updated_at < now() - interval '90 days';
