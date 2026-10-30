-- Commerce Payment: private, append-only customer withdrawal claim evidence.
-- P0-PR-01 retention, Legal review, final paid Unit binding, public intake and
-- provider refund authorization remain HOLD. No data is seeded and no API
-- executor, service_role, anon or authenticated privilege is granted.
begin;

create table public.digital_reading_withdrawal_claims_private_v1 (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id),
  purchase_intent_id uuid not null,
  unit_id uuid not null,
  reason_code text not null,
  idempotency_hmac text not null,
  request_hash text not null,
  contract_version text not null default 'digital-reading-withdrawal-claim-v1',
  state text not null default 'received',
  received_at timestamptz not null default clock_timestamp(),
  constraint digital_reading_withdrawal_claim_owner_fk
    foreign key (purchase_intent_id, subject_id)
    references public.purchase_intents(id, subject_id),
  constraint digital_reading_withdrawal_claim_idempotency_unique
    unique (subject_id, idempotency_hmac),
  constraint digital_reading_withdrawal_claim_reason_check
    check (reason_code in (
      'change_of_mind', 'not_provided', 'delivery_failed', 'not_as_described',
      'defect', 'duplicate_charge', 'unprovided_separable_part', 'other'
    )),
  constraint digital_reading_withdrawal_claim_hmac_check
    check (idempotency_hmac ~ '^hmac-sha256:k1:[0-9a-f]{64}$'),
  constraint digital_reading_withdrawal_claim_hash_check
    check (request_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint digital_reading_withdrawal_claim_contract_check
    check (contract_version = 'digital-reading-withdrawal-claim-v1'),
  constraint digital_reading_withdrawal_claim_state_check
    check (state = 'received')
);

comment on table public.digital_reading_withdrawal_claims_private_v1 is
'Private, immutable claim-received evidence only. No legal disposition, refund, delivery, entitlement effect, or public intake authorization. P0-PR-01 retention OPEN.';

create function public.tr_digital_reading_withdrawal_claim_private_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode='23514',
      constraint='digital_reading_withdrawal_claim_private_immutable',
      message='Private withdrawal claim evidence is append-only';
  end if;
  new.received_at := clock_timestamp();
  return new;
end;
$$;

create trigger tr_digital_reading_withdrawal_claim_private_v1
before insert or update or delete on public.digital_reading_withdrawal_claims_private_v1
for each row execute function public.tr_digital_reading_withdrawal_claim_private_v1();

alter table public.digital_reading_withdrawal_claims_private_v1 enable row level security;

revoke all on table public.digital_reading_withdrawal_claims_private_v1 from public;
revoke all on function public.tr_digital_reading_withdrawal_claim_private_v1() from public;

do $$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_worker_runtime','myeongha_commerce_internal_executor'
    )
  loop
    execute pg_catalog.format(
      'revoke all on table public.digital_reading_withdrawal_claims_private_v1 from %I',
      v_role
    );
  end loop;
end;
$$;

-- No INSERT/SELECT function granted and no owner claim is recorded.
commit;
