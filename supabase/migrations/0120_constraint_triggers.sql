-- MyeongHa DDL draft: cross-row integrity that cannot be expressed as simple CHECK/FK.
-- External calls and unrelated side effects are forbidden in these triggers.

create or replace function public.ct_validate_subject_merge_edge()
returns trigger
language plpgsql
as $$
declare
  target_kind text;
  target_status text;
  incoming_count bigint;
begin
  if new.status = 'merged' then
    select kind, status
      into target_kind, target_status
      from public.subjects
      where id = new.merged_into_subject_id;

    if target_kind is distinct from 'member'
       or target_status not in ('active', 'deletion_pending') then
      raise exception using
        errcode = '23514',
        constraint = 'ct_subject_merge_target_valid',
        message = 'merged subject must point directly to an active/deletion_pending member';
    end if;
  end if;

  select count(*) into incoming_count
  from public.subjects
  where merged_into_subject_id = new.id
    and status = 'merged';

  if incoming_count > 0
     and (new.kind <> 'member' or new.status not in ('active', 'deletion_pending')) then
    raise exception using
      errcode = '23514',
      constraint = 'ct_subject_merge_target_valid',
      message = 'canonical merge target cannot become non-member, merged, or deleted';
  end if;

  return new;
end;
$$;

create constraint trigger ct_subject_merge_target_valid
  after insert or update of kind, status, merged_into_subject_id
  on public.subjects
  deferrable initially deferred
  for each row execute function public.ct_validate_subject_merge_edge();

create or replace function public.ct_validate_subject_merge_job_parties()
returns trigger
language plpgsql
as $$
declare
  guest_kind text;
  guest_status text;
  member_kind text;
  member_status text;
begin
  select kind, status into guest_kind, guest_status
  from public.subjects where id = new.guest_subject_id;

  select kind, status into member_kind, member_status
  from public.subjects where id = new.member_subject_id;

  if guest_kind is distinct from 'guest' or guest_status is distinct from 'active' then
    raise exception using
      errcode = '23514',
      constraint = 'ct_subject_merge_job_parties_valid',
      message = 'merge job guest must be an active guest';
  end if;

  if member_kind is distinct from 'member'
     or member_status not in ('active', 'deletion_pending') then
    raise exception using
      errcode = '23514',
      constraint = 'ct_subject_merge_job_parties_valid',
      message = 'merge job member must be active/deletion_pending member';
  end if;

  return new;
end;
$$;

create constraint trigger ct_subject_merge_job_parties_valid
  after insert or update of guest_subject_id, member_subject_id
  on public.subject_merge_jobs
  deferrable initially deferred
  for each row execute function public.ct_validate_subject_merge_job_parties();

create or replace function public.ct_validate_target_profile_kind()
returns trigger
language plpgsql
as $$
declare
  actual_kind text;
begin
  select profile_kind into actual_kind
  from public.birth_profiles
  where id = new.birth_profile_id and subject_id = new.subject_id;

  if actual_kind is distinct from 'target' then
    raise exception using
      errcode = '23514',
      constraint = 'ct_target_profile_kind',
      message = 'target_person_profiles must reference a target birth profile';
  end if;

  return new;
end;
$$;

create constraint trigger ct_target_profile_kind
  after insert or update of subject_id, birth_profile_id
  on public.target_person_profiles
  deferrable initially deferred
  for each row execute function public.ct_validate_target_profile_kind();

create or replace function public.ct_validate_life_fact_supersession()
returns trigger
language plpgsql
as $$
declare
  parent_type text;
  cycle_found boolean;
begin
  if new.supersedes_fact_id is null then
    return new;
  end if;

  select fact_type into parent_type
  from public.life_facts
  where id = new.supersedes_fact_id and subject_id = new.subject_id;

  if parent_type is distinct from new.fact_type then
    raise exception using
      errcode = '23514',
      constraint = 'ct_life_fact_supersession_integrity',
      message = 'life fact supersession must preserve fact_type';
  end if;

  with recursive lineage(id, supersedes_fact_id) as (
    select id, supersedes_fact_id
    from public.life_facts
    where id = new.supersedes_fact_id and subject_id = new.subject_id
    union
    select lf.id, lf.supersedes_fact_id
    from public.life_facts lf
    join lineage l on lf.id = l.supersedes_fact_id
    where lf.subject_id = new.subject_id
  )
  select exists(select 1 from lineage where id = new.id)
    into cycle_found;

  if cycle_found then
    raise exception using
      errcode = '23514',
      constraint = 'ct_life_fact_supersession_integrity',
      message = 'life fact supersession cycle is not allowed';
  end if;

  return new;
end;
$$;

create constraint trigger ct_life_fact_supersession_integrity
  after insert or update of subject_id, fact_type, supersedes_fact_id
  on public.life_facts
  deferrable initially deferred
  for each row execute function public.ct_validate_life_fact_supersession();

create or replace function public.ct_validate_memory_proposal_source_character()
returns trigger
language plpgsql
as $$
declare
  source_sender text;
  source_character text;
begin
  if new.source_message_id is null then
    return new;
  end if;

  select m.sender_type, tc.character_id
    into source_sender, source_character
  from public.conversation_messages m
  left join public.conversation_thread_characters tc
    on tc.id = m.thread_character_id and tc.thread_id = m.thread_id
  where m.id = new.source_message_id
    and m.turn_id = new.source_turn_id
    and m.subject_id = new.subject_id;

  if source_sender = 'character' and source_character is distinct from new.character_id then
    raise exception using
      errcode = '23514',
      constraint = 'ct_memory_proposal_source_character',
      message = 'memory proposal character must match its source character message';
  end if;

  return new;
end;
$$;

create constraint trigger ct_memory_proposal_source_character
  after insert or update of character_id, source_turn_id, source_message_id, subject_id
  on public.memory_proposals
  deferrable initially deferred
  for each row execute function public.ct_validate_memory_proposal_source_character();

create or replace function public.ct_validate_memory_item_source_character()
returns trigger
language plpgsql
as $$
declare
  source_sender text;
  source_character text;
begin
  if new.source_message_id is null or new.source_kind <> 'user_approved' then
    return new;
  end if;

  select m.sender_type, tc.character_id
    into source_sender, source_character
  from public.conversation_messages m
  left join public.conversation_thread_characters tc
    on tc.id = m.thread_character_id and tc.thread_id = m.thread_id
  where m.id = new.source_message_id
    and m.subject_id = new.subject_id;

  if source_sender = 'character'
     and source_character is distinct from new.created_by_character_id then
    raise exception using
      errcode = '23514',
      constraint = 'ct_memory_item_source_character',
      message = 'memory creator character must match its source character message';
  end if;

  return new;
end;
$$;

create constraint trigger ct_memory_item_source_character
  after insert or update of source_kind, source_message_id, created_by_character_id, subject_id
  on public.memory_items
  deferrable initially deferred
  for each row execute function public.ct_validate_memory_item_source_character();
