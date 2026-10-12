-- D-01 private Product rule source candidate. No approvals are seeded.
-- Standard: universal product-level eligibility across 9 canonical Readers.
-- Premium: a single Product -> target Reader association; no multi-Reader allowlist.
-- Paid access always needs exact current Grant, Release, Subject and bind checks.
-- NOT a purchase, Offer, binder, Grant, release, or public authorization.
-- Existing 1130/1150/1220/1270 and 1720 migrations stay unchanged.
create table public.standard_reader_product_approved_rules_v1 (
  product_id uuid not null references public.standard_reading_product_specs(product_id),
  product_spec_version text not null,
  saju_domain text not null references public.saju_domains(saju_domain),
  approved_policy_revision text not null,
  rule_version text not null,
  policy_kind text not null,
  target_reader_id text null,
  approval_record_ref text not null,
  approved_at timestamptz not null,
  effective_from timestamptz not null,
  effective_until timestamptz null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (product_id, approved_policy_revision),
  constraint std_reader_policy_version_nonblank check (
    product_spec_version = btrim(product_spec_version) and product_spec_version <> ''
    and length(product_spec_version) <= 256
    and rule_version = btrim(rule_version) and rule_version <> ''
    and length(rule_version) <= 256
    and approved_policy_revision = btrim(approved_policy_revision)
    and approved_policy_revision <> '' and length(approved_policy_revision) <= 256
    and approval_record_ref = btrim(approval_record_ref)
    and approval_record_ref <> '' and length(approval_record_ref) <= 256
  ),
  constraint std_reader_policy_kind check (
    (policy_kind = 'standard_all_readers' and target_reader_id is null)
    or
    (policy_kind = 'premium_character_bound'
      and target_reader_id in (
        'seyeon', 'baekheon', 'yeoul', 'seorin', 'rahyeon',
        'mira', 'taegyeom', 'yunho', 'doyun'
      ))
  ),
  constraint std_reader_policy_window check (
    approved_at <= effective_from
    and (effective_until is null or effective_until > effective_from)
  )
);

-- A separate append-only revocation preserves both original approval and its withdrawal.
create table public.standard_reader_product_rule_withdrawals_v1 (
  product_id uuid not null,
  approved_policy_revision text not null,
  withdrawn_at timestamptz not null,
  withdrawal_record_ref text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (product_id, approved_policy_revision),
  foreign key (product_id, approved_policy_revision)
    references public.standard_reader_product_approved_rules_v1
      (product_id, approved_policy_revision),
  constraint std_reader_policy_withdrawal_ref check (
    withdrawal_record_ref = btrim(withdrawal_record_ref)
    and withdrawal_record_ref <> '' and length(withdrawal_record_ref) <= 256
  )
);

create function public.tr_standard_reader_product_policy_immutable_v1()
returns trigger language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = '23514',
    constraint = 'std_reader_product_policy_append_only_v1',
    message = 'Product Reader rule approvals and withdrawals are append-only';
end;
$$;

create trigger tr_standard_reader_product_rules_immutable_v1
  before update or delete on public.standard_reader_product_approved_rules_v1
  for each row execute function public.tr_standard_reader_product_policy_immutable_v1();

create trigger tr_standard_reader_product_withdrawals_immutable_v1
  before update or delete on public.standard_reader_product_rule_withdrawals_v1
  for each row execute function public.tr_standard_reader_product_policy_immutable_v1();

-- Private and read-only. The caller supplies the exact PostgreSQL Product
-- scope time (1720); the function also rejects stale/future time and independently
-- rechecks Product enabled/spec/domain. Ambiguous overlapping rules return 0 rows.
-- Administrative approval insertion is deliberately NOT exposed to API execution.
create function public.qry_standard_reader_approved_rule_v1(
  p_product_id uuid,
  p_product_spec_version text,
  p_saju_domain text,
  p_effective_at timestamptz
)
returns table (
  product_id uuid,
  product_spec_version text,
  saju_domain text,
  rule_version text,
  approved_policy_revision text,
  policy_kind text,
  target_reader_id text
)
language sql volatile security definer
set search_path = pg_catalog, public
as $$
  with candidates as (
    select r.product_id, r.product_spec_version, r.saju_domain,
           r.rule_version, r.approved_policy_revision,
           r.policy_kind, r.target_reader_id
    from public.standard_reader_product_approved_rules_v1 r
    join public.standard_reading_product_specs spec
      on spec.product_id = r.product_id
     and spec.spec_version = r.product_spec_version
     and spec.saju_domain = r.saju_domain
     and spec.retired_at is null
     and spec.reader_selection_mode = 'required'
     and spec.purchase_unit_mode = 'topic_reader_reading'
    join public.products product
      on product.id = spec.product_id
     and product.enabled = true
     and product.retired_at is null
     and product.product_type = 'reading'
    where r.product_id = p_product_id
      and r.product_spec_version = p_product_spec_version
      and r.saju_domain = p_saju_domain
      and p_effective_at is not null
      and p_effective_at >= pg_catalog.clock_timestamp() - interval '30 seconds'
      and p_effective_at <= pg_catalog.clock_timestamp() + interval '1 second'
      and r.effective_from <= p_effective_at
      and (r.effective_until is null or p_effective_at < r.effective_until)
      and not exists (
        select 1 from public.standard_reader_product_rule_withdrawals_v1 w
        where w.product_id = r.product_id
          and w.approved_policy_revision = r.approved_policy_revision
      )
  ),
  counted as (
    select c.*, count(*) over () as matched_rules from candidates c
  )
  select c.product_id, c.product_spec_version, c.saju_domain,
         c.rule_version, c.approved_policy_revision,
         c.policy_kind, c.target_reader_id
  from counted c
  where c.matched_rules = 1;
$$;

comment on function public.qry_standard_reader_approved_rule_v1(uuid,text,text,timestamptz) is
'Private candidate: zero unseeded approval; exact Product/spec/domain/DB-time; one active non-withdrawn rule only. No Reader access or purchase authority.';

revoke all on table public.standard_reader_product_approved_rules_v1 from public;
revoke all on table public.standard_reader_product_rule_withdrawals_v1 from public;
revoke all on function public.qry_standard_reader_approved_rule_v1(uuid,text,text,timestamptz) from public;

do $$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon', 'authenticated', 'service_role', 'myeongha_api_executor')
  loop
    execute pg_catalog.format('revoke all on public.standard_reader_product_approved_rules_v1 from %I', v_role);
    execute pg_catalog.format('revoke all on public.standard_reader_product_rule_withdrawals_v1 from %I', v_role);
    execute pg_catalog.format(
      'revoke all on function public.qry_standard_reader_approved_rule_v1(uuid,text,text,timestamptz) from %I',
      v_role
    );
  end loop;
end
$$;

grant execute on function public.qry_standard_reader_approved_rule_v1(uuid,text,text,timestamptz)
  to myeongha_api_executor;

do $$
begin
  if not pg_catalog.has_function_privilege(
      'myeongha_api_executor',
      'public.qry_standard_reader_approved_rule_v1(uuid,text,text,timestamptz)'::pg_catalog.regprocedure,
      'EXECUTE')
    or pg_catalog.has_function_privilege(
      'public',
      'public.qry_standard_reader_approved_rule_v1(uuid,text,text,timestamptz)'::pg_catalog.regprocedure,
      'EXECUTE')
    or pg_catalog.has_table_privilege(
      'myeongha_api_executor', 'public.standard_reader_product_approved_rules_v1', 'SELECT')
    or pg_catalog.has_table_privilege(
      'myeongha_api_executor', 'public.standard_reader_product_approved_rules_v1', 'INSERT')
  then
    raise exception 'D-01 private Product rule source ACL mismatch';
  end if;
end
$$;
