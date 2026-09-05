-- Commerce trigger execution-context hardening.
--
-- Supabase advisor remediation for provider-neutral Commerce trigger functions.
-- Pin each trigger/constraint function search_path so execution does not depend on
-- caller/session role configuration. This migration does not widen any privilege,
-- expose a new Data API surface, activate a PSP, or authorize payment fulfillment.
--
-- Also add a covering index for the source Receipt FK introduced by 0930 so
-- purchase-Grant lineage validation/reconciliation does not require avoidable scans.

alter function public.tr_product_offer_mapping_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_commerce_account_link_identity_immutable()
  set search_path = pg_catalog, public;

alter function public.ct_validate_purchase_intent_authority()
  set search_path = pg_catalog, public;

alter function public.tr_purchase_intent_identity_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_commerce_receipt_identity_immutable()
  set search_path = pg_catalog, public;

alter function public.ct_validate_commerce_receipt_authority()
  set search_path = pg_catalog, public;

alter function public.ct_validate_provider_event_resolution()
  set search_path = pg_catalog, public;

alter function public.tr_provider_event_identity_immutable()
  set search_path = pg_catalog, public;

alter function public.tr_entitlement_grant_identity_immutable()
  set search_path = pg_catalog, public;

alter function public.ct_validate_entitlement_event_source()
  set search_path = pg_catalog, public;

alter function public.tr_entitlement_event_append_only()
  set search_path = pg_catalog, public;

alter function public.tr_entitlement_identity_immutable()
  set search_path = pg_catalog, public;

create index entitlement_grants_source_receipt_subject_idx
  on public.entitlement_grants(source_receipt_id, subject_id);
