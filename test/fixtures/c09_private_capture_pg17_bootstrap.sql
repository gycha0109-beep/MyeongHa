-- Synthetic, disposable PostgreSQL 17 only; no production identity.
create role anon nologin;
create role authenticated nologin;
create role c09_capture_subject_a nologin;
create role c09_capture_subject_b nologin;
create table public.characters (character_id text primary key);
insert into public.characters values ('seyeon');
create table public.conversation_messages (
  id uuid primary key,
  subject_id uuid not null,
  thread_id uuid not null,
  sender_type text not null,
  content_hash text not null,
  body_text text,
  created_at timestamptz not null,
  redacted_at timestamptz,
  unique(id,subject_id)
);

-- Never use an editable app GUC as identity in this fixture.
create function public.current_myeongha_subject_id() returns uuid
language sql stable as $$
  select case current_user
    when 'c09_capture_subject_a' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
    when 'c09_capture_subject_b' then 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
    else null::uuid end
$$;
create function public.assert_myeongha_subject_context_v1(p_subject_id uuid) returns void
language plpgsql stable as $$
begin
  if p_subject_id is distinct from public.current_myeongha_subject_id() then
    raise exception 'C09_NOT_CANONICAL_SUBJECT' using errcode='42501';
  end if;
end $$;
alter table public.conversation_messages enable row level security;
alter table public.conversation_messages force row level security;
create policy c09_capture_message_a on public.conversation_messages for select
 to c09_capture_subject_a using (subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
create policy c09_capture_message_b on public.conversation_messages for select
 to c09_capture_subject_b using (subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
create policy c09_capture_message_lock_a on public.conversation_messages for update
 to c09_capture_subject_a using (subject_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid);
create policy c09_capture_message_lock_b on public.conversation_messages for update
 to c09_capture_subject_b using (subject_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid);
