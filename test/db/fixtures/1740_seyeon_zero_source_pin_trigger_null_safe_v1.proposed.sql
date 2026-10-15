-- Nondeployable R2-H/1740 forward-only proposal: block SQL NULL records Commit escape.
-- Watchtower-Track: ops
-- HOLD_OWNER_REVIEW. NEVER add this fixture under supabase/migrations or apply to Production.
-- Original 1640 blob 51862c2b4adcfcf65d76ab08459b1c26a12e0fba is unchanged.
-- Requires existing 1640 trigger/function. CREATE OR REPLACE preserves function OID,
-- ownership, ACL, SECURITY INVOKER, and installed trigger linkage.
begin;
set local lock_timeout='5s';
do $preflight$
declare fn oid:=to_regprocedure('public.tr_seyeon_zero_source_pin_immutable_v1()');
begin
  if fn is null or not exists (
    select 1 from pg_trigger
    where tgrelid='public.chat_turn_attempts'::regclass
      and tgname='tr_seyeon_zero_source_pin_immutable_v1'
      and not tgisinternal and tgenabled='O' and tgfoid=fn
  ) then
    raise exception 'HOLD_R2_H_1740_ORIGINAL_TRIGGER_MISSING';
  end if;
  if position('#> ''{zeroProof,records}'' <>' in pg_get_functiondef(fn))=0 then
    raise exception 'HOLD_R2_H_1740_ORIGINAL_FUNCTION_NOT_AT_PINNED_GAP';
  end if;
end
$preflight$;

create or replace function public.tr_seyeon_zero_source_pin_immutable_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $pin_trigger$
begin
  if old.seyeon_personal_source_pin_jsonb is not null and
     (old.seyeon_personal_source_pin_jsonb is distinct from
        new.seyeon_personal_source_pin_jsonb or
      old.seyeon_personal_source_pinned_at is distinct from
        new.seyeon_personal_source_pinned_at) then
    raise exception using
      errcode='23514',
      constraint='seyeon_source_pin_immutable',
      message='Se-yeon attempt source pin cannot be changed';
  end if;
  if old.seyeon_personal_source_pin_jsonb is null and
     new.seyeon_personal_source_pin_jsonb is not null and
     (old.state <> 'running' or new.state <> 'running') then
    raise exception using
      errcode='23514',
      constraint='seyeon_source_pin_must_precede_generation',
      message='Se-yeon source pin must be stored during running state';
  end if;
  -- SQL-side final safety net for Se-yeon: never Commit an unpinned attempt,
  -- nor a generated validation proof unrelated to its durable source pin.
  if old.state = 'validated' and new.state = 'committed' and
     new.planner_version = 'seyeon-production-chat-planner-v1' then
    if old.seyeon_personal_source_pin_jsonb is null or
       old.seyeon_personal_source_pin_jsonb #> '{zeroProof,records}' IS DISTINCT FROM
         '[]'::jsonb or
       old.validation_result_jsonb -> 'personalRecordProvenance' is distinct from
         old.seyeon_personal_source_pin_jsonb -> 'zeroProof' then
      raise exception using
        errcode='23514',
        constraint='seyeon_commit_requires_original_zero_source_pin',
        message='Se-yeon Chat Commit requires matching durable zero-source evidence';
    end if;
  end if;
  return new;
end
$pin_trigger$;

-- Replacement is intentional but must contain the SQL NULL-safe predicate.
do $postflight$
declare fn oid:=to_regprocedure('public.tr_seyeon_zero_source_pin_immutable_v1()');
begin
 if fn is null or position('#> ''{zeroProof,records}'' IS DISTINCT FROM' in pg_get_functiondef(fn))=0 then
   raise exception 'HOLD_R2_H_1740_NULL_SAFE_REPLACEMENT_MISSING';
 end if;
end
$postflight$;
commit;
