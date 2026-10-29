-- Injected only into the disposable PG17 official archive fixture between
-- the prepared attempt and synthetic finalize. This is NOT a Production issuer.
select pg_temp.assert_v2_true(
  'exact initial paid Grant and current SELF Birth admit the prepared official source call',
  public.qry_saju_official_issuance_preflight_v1(
    '11390000-0000-0000-0000-000000000001',
    '12103100-0000-4000-8000-000000000001',
    '12103000-0000-4000-8000-000000000001',
    '12104000-0000-0000-0000-000000000001',
    '12101100-0000-0000-0000-000000000001'
  )
);
select pg_temp.assert_v2_true(
  'a different execution attempt cannot reuse the paid Source preflight',
  not public.qry_saju_official_issuance_preflight_v1(
    '11390000-0000-0000-0000-000000000001',
    '12103100-0000-4000-8000-000000000001',
    '12103000-0000-4000-8000-000000000001',
    '12104000-0000-0000-0000-000000000009',
    '12101100-0000-0000-0000-000000000001'
  )
);
select pg_temp.assert_v2_true(
  'another Birth revision cannot authorize this purchased official Reading',
  not public.qry_saju_official_issuance_preflight_v1(
    '11390000-0000-0000-0000-000000000001',
    '12103100-0000-4000-8000-000000000001',
    '12103000-0000-4000-8000-000000000001',
    '12104000-0000-0000-0000-000000000001',
    '12101100-0000-0000-0000-000000000002'
  )
);

-- The runtime executor must be able to call only the bounded preflight RPC,
-- not the private tables, while the initial purchase and attempt remain current.
begin;
set local role myeongha_api_executor;
do $executor_preflight$
begin
  if not public.qry_saju_official_issuance_preflight_v1(
    '11390000-0000-0000-0000-000000000001',
    '12103100-0000-4000-8000-000000000001',
    '12103000-0000-4000-8000-000000000001',
    '12104000-0000-0000-0000-000000000001',
    '12101100-0000-0000-0000-000000000001'
  ) then
    raise exception 'Ordinary API executor cannot admit the exact prepared official attempt';
  end if;
end
$executor_preflight$;
rollback;
