-- Test-only facade for local deployment rehearsal. Never run in production.
create role anon nologin;
create role authenticated nologin;
create role myeongha_api_executor nologin;
create table public.characters(character_id text primary key);
insert into public.characters(character_id) values('seyeon');
create table public.conversation_messages(
  id uuid primary key,
  thread_id uuid,
  subject_id uuid,
  sequence_no bigint,
  sender_type text,
  redacted_at timestamptz,
  body_text text,
  message_payload_jsonb jsonb
);
alter table public.conversation_messages enable row level security;
create function public.current_myeongha_subject_id() returns uuid
language sql stable as 'select nullif(current_setting(''myeongha.subject_id'',true),'''')::uuid';
grant usage on schema public to myeongha_api_executor;
grant execute on function public.current_myeongha_subject_id() to myeongha_api_executor;
create policy conversation_messages_api_current_select_v1
 on public.conversation_messages for select to myeongha_api_executor
 using(subject_id=public.current_myeongha_subject_id());
insert into public.conversation_messages
  (id,thread_id,subject_id,sequence_no,sender_type,body_text)
values ('00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'user','synthetic secret'),
       ('00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000004',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,'user','another synthetic secret');
