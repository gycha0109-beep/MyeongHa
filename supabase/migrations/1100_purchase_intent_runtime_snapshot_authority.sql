begin;

create or replace function public.qry_purchase_intent_runtime_snapshot_v3(
  p_product_offer_id uuid
)
returns table (
  product_offer_id uuid,
  product_id uuid,
  platform text,
  provider text,
  external_product_id text,
  capability_set_id uuid,
  capability_definition_version text,
  capability_definition_hash text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    po.id,
    po.product_id,
    po.platform::text,
    po.provider::text,
    po.external_product_id,
    po.capability_set_id,
    pcs.definition_version::text,
    pcs.definition_hash
  from public.product_offers po
  left join public.product_capability_sets pcs
    on pcs.id = po.capability_set_id
  where po.id = p_product_offer_id;
$$;

comment on function public.qry_purchase_intent_runtime_snapshot_v3(uuid) is
  'Executor-only immutable Offer + pinned Capability snapshot resolver for Purchase Intent v3 runtime composition. It intentionally does not filter enabled/retired state so cmd_create_purchase_intent_v3 remains the final new-request/replay availability authority.';

revoke all on function public.qry_purchase_intent_runtime_snapshot_v3(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.qry_purchase_intent_runtime_snapshot_v3(uuid)
  to myeongha_api_executor;

commit;
