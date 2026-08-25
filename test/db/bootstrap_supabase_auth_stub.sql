-- CI-only compatibility fixture.
-- Production Supabase owns auth.users; product migrations must never create or replace it.

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key
);
