-- ONLY for disposable DB myeongha_reader_product_scope_app_test.
-- The fixture is an enabled synthetic Product; it is never a saleable SKU.
do $$
begin
  if (select count(*) from public.standard_reader_product_approved_rules_v1) <> 0 then
    raise exception 'D-01 unseeded approval source must start empty';
  end if;
  if pg_catalog.has_function_privilege(
      'anon',
      'public.qry_standard_reader_approved_rule_v1(uuid,text,text,timestamptz)'::pg_catalog.regprocedure,
      'EXECUTE')
     or pg_catalog.has_function_privilege(
      'authenticated',
      'public.qry_standard_reader_approved_rule_v1(uuid,text,text,timestamptz)'::pg_catalog.regprocedure,
      'EXECUTE')
     or pg_catalog.has_table_privilege(
      'myeongha_api_executor', 'public.standard_reader_product_approved_rules_v1', 'INSERT')
  then
    raise exception 'D-01 public/ordinary executor privilege violation';
  end if;
end
$$;

-- Rollback-only ambiguity, withdrawal, temporal and immutability probes.
begin;

insert into public.standard_reader_product_approved_rules_v1 (
 product_id,product_spec_version,saju_domain,approved_policy_revision,
 rule_version,policy_kind,allowed_reader_ids,approval_record_ref,
 approved_at,effective_from
) values (
 '11392000-0000-0000-0000-000000000001', 'v1','relationship',
 'synthetic-temporary-revision-A','test-only-v1','standard_all_readers',null,
 'test-only:never-production',clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day'
);

do $$
begin
  if (select count(*) from public.qry_standard_reader_approved_rule_v1(
      '11392000-0000-0000-0000-000000000001', 'v1','relationship',clock_timestamp())) <> 1 then
    raise exception 'D-01 exact synthetic approved rule must be singly readable';
  end if;
  if (select count(*) from public.qry_standard_reader_approved_rule_v1(
      '11392000-0000-0000-0000-000000000001','v0','relationship',clock_timestamp())) <> 0
     or (select count(*) from public.qry_standard_reader_approved_rule_v1(
      '11392000-0000-0000-0000-000000000001','v1','wealth',clock_timestamp())) <> 0
     or (select count(*) from public.qry_standard_reader_approved_rule_v1(
      '11392000-0000-0000-0000-000000000001','v1','relationship',
      clock_timestamp()-interval '1 hour')) <> 0
  then
    raise exception 'D-01 spec/domain/clock spoof must be withheld';
  end if;
  begin
    update public.standard_reader_product_approved_rules_v1
      set rule_version = 'tampered'
      where approved_policy_revision = 'synthetic-temporary-revision-A';
    raise exception 'D-01 immutable approval UPDATE succeeded';
  exception when check_violation then
    if SQLERRM not like '%append-only%' then raise; end if;
  end;
end
$$;

insert into public.standard_reader_product_approved_rules_v1 (
 product_id,product_spec_version,saju_domain,approved_policy_revision,
 rule_version,policy_kind,allowed_reader_ids,approval_record_ref,
 approved_at,effective_from
) values (
 '11392000-0000-0000-0000-000000000001','v1','relationship',
 'synthetic-temporary-revision-B','test-only-v2','premium_restricted',
 array['seyeon'],'test-only:never-production',
 clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day'
);

do $$
begin
  if (select count(*) from public.qry_standard_reader_approved_rule_v1(
      '11392000-0000-0000-0000-000000000001','v1','relationship',clock_timestamp())) <> 0 then
    raise exception 'D-01 overlapping active policies must be ambiguous and denied';
  end if;
end
$$;

insert into public.standard_reader_product_rule_withdrawals_v1(
 product_id,approved_policy_revision,withdrawn_at,withdrawal_record_ref
) values (
 '11392000-0000-0000-0000-000000000001','synthetic-temporary-revision-B',
 clock_timestamp(),'test-only:withdraw-B'
);

do $$
begin
  if (select count(*) from public.qry_standard_reader_approved_rule_v1(
      '11392000-0000-0000-0000-000000000001','v1','relationship',clock_timestamp())) <> 1 then
    raise exception 'D-01 withdrawal must remove only matching revision';
  end if;
end
$$;

insert into public.standard_reader_product_rule_withdrawals_v1(
 product_id,approved_policy_revision,withdrawn_at,withdrawal_record_ref
) values (
 '11392000-0000-0000-0000-000000000001','synthetic-temporary-revision-A',
 clock_timestamp(),'test-only:withdraw-A'
);

do $$
begin
  if (select count(*) from public.qry_standard_reader_approved_rule_v1(
      '11392000-0000-0000-0000-000000000001','v1','relationship',clock_timestamp())) <> 0 then
    raise exception 'D-01 all withdrawn policies must be denied';
  end if;
end
$$;
rollback;

-- Only this synthetic row is retained in the disposable test DB for
-- actual TypeScript + PostgreSQL readback. Never delivered as Product approval.
insert into public.standard_reader_product_approved_rules_v1 (
 product_id,product_spec_version,saju_domain,approved_policy_revision,
 rule_version,policy_kind,allowed_reader_ids,approval_record_ref,
 approved_at,effective_from
) values (
 '11392000-0000-0000-0000-000000000001','v1','relationship',
 'synthetic-d01-real-db-test-only','synthetic-rule-never-production',
 'standard_all_readers',null,'test-only:never-production',
 clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day'
);

do $$
begin
  if (select count(*) from public.qry_standard_reader_approved_rule_v1(
      '11300000-0000-0000-0000-000000000001','v1','relationship',clock_timestamp())) <> 0 then
    raise exception 'D-01 disabled product must never return rule';
  end if;
end
$$;
