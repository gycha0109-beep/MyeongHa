-- Privacy-safe Guest/Member Purchase Intent history read authority.
--
-- This is a DB-only projection boundary. It does not add or imply a public HTTP
-- purchase-history endpoint, payment provider integration, receipt verification,
-- reconciliation runtime, refund authority, or entitlement mutation.
--
-- Canonical active Guest subjects read only their own immutable Purchase Intent
-- ownership history. Canonical active Member subjects read their own rows plus
-- rows still historically owned by direct merged Guest subjects. Historical
-- owner rows are never rewritten and recursive merge ancestry is not inferred.
--
-- The projection intentionally omits provider_account_link_id, idempotency_key,
-- request_hash, offer_snapshot_jsonb/hash, charge_terms_version, Subject ids,
-- Receipt/Event provenance, provider transaction ids, fingerprints, and verified
-- provider payloads. Those fields are internal authority/evidence and are not
-- needed for the minimal user-facing intent-state projection.
--
-- Legacy Purchase Intents created before authoritative charge terms may contain
-- NULL expected_amount_minor / expected_currency. This query preserves NULLs and
-- never fabricates historical monetary meaning.

create or replace function public.qry_purchase_intent_history_v2(
  p_subject_id uuid
)
returns table (
  purchase_intent_id uuid,
  product_offer_id uuid,
  status text,
  expected_amount_minor bigint,
  expected_currency text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subject_kind text;
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_purchase_intent_history_v2_subject_required',
      message = 'purchase intent history subject identity is required';
  end if;

  select s.kind
    into v_subject_kind
  from public.subjects s
  where s.id = p_subject_id
    and s.kind in ('guest', 'member')
    and s.status = 'active'
    and s.merged_into_subject_id is null
    and (s.kind <> 'member' or s.auth_user_id is not null);

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_purchase_intent_history_v2_subject_ineligible',
      message = 'purchase intent history read requires an active canonical Guest or Member subject';
  end if;

  return query
  with source_subjects(subject_id) as (
    select p_subject_id
    union all
    select s.id
    from public.subjects s
    where v_subject_kind = 'member'
      and s.kind = 'guest'
      and s.status = 'merged'
      and s.merged_into_subject_id = p_subject_id
  )
  select
    pi.id as purchase_intent_id,
    pi.product_offer_id,
    pi.status,
    pi.expected_amount_minor,
    pi.expected_currency,
    pi.created_at,
    pi.updated_at
  from public.purchase_intents pi
  join source_subjects src
    on src.subject_id = pi.subject_id
  order by pi.created_at desc, pi.id desc;
end;
$$;

revoke execute on function public.qry_purchase_intent_history_v2(uuid) from public;
