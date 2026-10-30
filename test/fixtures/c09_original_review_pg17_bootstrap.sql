-- Disposable PG17 ONLY. Synthetic identities and reviews; never production data.
create role anon nologin;
create role authenticated nologin;
create role myeongha_api_executor nologin;
create table public.characters (character_id text primary key);
insert into public.characters values ('seyeon');
create schema myeongha_internal;
revoke all on schema myeongha_internal from public;
grant usage on schema myeongha_internal to myeongha_api_executor;

create table public.conversation_messages (
 id uuid primary key,
 subject_id uuid not null,
 sender_type text not null,
 content_hash text not null,
 body_text text not null,
 created_at timestamptz not null,
 redacted_at timestamptz,
 unique (id,subject_id)
);
create table myeongha_internal.character_knowledge_topics_v1 (
 character_id text not null references public.characters(character_id),
 topic_key text not null,
 primary key(character_id,topic_key)
);
insert into myeongha_internal.character_knowledge_topics_v1 values ('seyeon','python.programming');

create function public.current_myeongha_subject_id() returns uuid
language sql stable as $$
 select case current_user
 when 'myeongha_api_executor' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
 else null::uuid end
$$;

insert into public.conversation_messages
 (id,subject_id,sender_type,content_hash,body_text,created_at)
values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'user','original-a','synthetic content A',now()-interval '2 days'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'user','original-b','synthetic content B',now()-interval '2 days');
