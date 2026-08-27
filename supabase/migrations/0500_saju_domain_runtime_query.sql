-- Source-bounded read projection for API capability assembly.
-- This exposes only the Product DB's current operational Saju-domain runtime state.
-- It does not create Saju semantics, infer availability for missing rows, or resolve Character capability.

create or replace function public.qry_saju_domain_runtime_v1()
returns table (
  saju_domain text,
  availability text,
  capability_version text,
  required_engine_version text,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    runtime.saju_domain,
    runtime.availability,
    runtime.capability_version,
    runtime.required_engine_version,
    runtime.updated_at
  from public.saju_domain_runtime runtime
  order by runtime.saju_domain;
$$;

revoke all on function public.qry_saju_domain_runtime_v1() from public;
