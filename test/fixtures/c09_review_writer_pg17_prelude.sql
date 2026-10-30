-- Disposable synthetic PG17 extra prelude for C09 reviewer role.
alter table myeongha_internal.character_knowledge_topics_v1
 add column published_at timestamptz,
 add column revoked_at timestamptz;
update myeongha_internal.character_knowledge_topics_v1
 set published_at=now()-interval '3 days';
alter table public.conversation_messages enable row level security;
alter table public.conversation_messages force row level security;
alter table myeongha_internal.character_knowledge_topics_v1 enable row level security;
alter table myeongha_internal.character_knowledge_topics_v1 force row level security;
create or replace function public.current_myeongha_subject_id()
returns uuid language sql stable as $$
 select case current_user
 when 'myeongha_api_executor' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
 when 'c09_original_review_writer' then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
 else null::uuid end
$$;
create function public.assert_myeongha_subject_context_v1(p uuid)
returns void language plpgsql stable as $$
begin
 if p is null or p <> public.current_myeongha_subject_id() then
  raise exception 'synthetic subject mismatch' using errcode='42501';
 end if;
end $$;
revoke all on function public.current_myeongha_subject_id() from public;
revoke all on function public.assert_myeongha_subject_context_v1(uuid) from public;
grant execute on function public.current_myeongha_subject_id() to myeongha_api_executor;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
 to myeongha_api_executor;
