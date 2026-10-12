-- D-01 / #1828: inactive, read-only Standard Reader Product source bridge.
--
-- This is NOT a Product-approved Reader rule, saleable Offer, purchase/Grant
-- authority or specialist can_initiate override. It only resolves an active
-- server-owned Product spec + database timestamp for a later approved rule
-- lookup. No Product policy rows, public routes or checkout activation.
--
-- Function EXECUTE is limited to the existing server executor. No direct
-- table grants, no security-sensitive policy output, no mutable content.
create or replace function public.qry_standard_reading_product_scope_v1(
  p_product_id uuid,
  p_product_spec_version text
)
returns table (
  product_id uuid,
  product_spec_version text,
  saju_domain text,
  effective_at text
)
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select
    spec.product_id,
    spec.spec_version,
    spec.saju_domain,
    pg_catalog.to_char(
      pg_catalog.clock_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ) as effective_at
  from public.standard_reading_product_specs spec
  join public.products product on product.id = spec.product_id
  where p_product_id is not null
    and p_product_spec_version is not null
    and pg_catalog.btrim(p_product_spec_version) <> ''
    and p_product_spec_version = pg_catalog.btrim(p_product_spec_version)
    and spec.product_id = p_product_id
    and spec.spec_version = p_product_spec_version
    and spec.retired_at is null
    and spec.reader_selection_mode = 'required'
    and spec.purchase_unit_mode = 'topic_reader_reading'
    and product.product_type = 'reading'
    and product.enabled = true
    and product.retired_at is null;
$$;

comment on function public.qry_standard_reading_product_scope_v1(uuid,text) is
'Server-only D-01 Product identity/domain/current DB time, not an approved Reader rule or sale/Grant/admission authority. No rules are seeded.';

revoke all on function public.qry_standard_reading_product_scope_v1(uuid,text)
  from public;

do $$
declare
  v_role text;
begin
  for v_role in
    select r.rolname from pg_catalog.pg_roles r
    where r.rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_standard_reading_product_scope_v1(uuid,text) from %I',
      v_role
    );
  end loop;
end
$$;

grant execute on function public.qry_standard_reading_product_scope_v1(uuid,text)
  to myeongha_api_executor;

do $$
begin
  if not pg_catalog.has_function_privilege(
      'myeongha_api_executor',
      'public.qry_standard_reading_product_scope_v1(uuid,text)'::pg_catalog.regprocedure,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'public',
      'public.qry_standard_reading_product_scope_v1(uuid,text)'::pg_catalog.regprocedure,
      'EXECUTE'
    )
    or not (select p.prosecdef from pg_catalog.pg_proc p
            where p.oid='public.qry_standard_reading_product_scope_v1(uuid,text)'::pg_catalog.regprocedure)
  then
    raise exception 'D-01 Product scope bridge EXECUTE or owner ACL mismatch';
  end if;
end
$$;
