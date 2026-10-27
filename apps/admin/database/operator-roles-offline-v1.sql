-- OFFLINE ADMIN PRINCIPAL SCHEMA CANDIDATE ONLY.
-- This file MUST NOT be run by existing production automation or ordinary
-- application credentials. Owner must approve private hosting, role custody,
-- audit retention, migration authority and recovery policy first.
-- NO passwords, keys, automatic privileges for API executor or service_role.

begin;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'myeongha_admin_reader') then
    create role myeongha_admin_reader
      login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'myeongha_admin_audit_writer') then
    create role myeongha_admin_audit_writer
      login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end $$;

-- These standalone roles are separate from the ordinary user API executor.
-- Their secrets are provisioned outside the repository and NEVER in Vite.
grant usage on schema public to myeongha_admin_reader;

-- Column-level SELECT only. No auth.users, raw Birth, chat body, Reading
-- payload, payment receipt JSON, AI prompt/output or guest session material.
grant select (id, kind, status, created_at) on public.subjects to myeongha_admin_reader;
grant select (id, subject_id, execution_status, saju_domain, created_at)
  on public.readings to myeongha_admin_reader;
grant select (id, subject_id, purchase_intent_id, provider, platform, product_offer_id, verification_status, verified_at, created_at)
  on public.commerce_receipts to myeongha_admin_reader;
grant select (id, status) on public.purchase_intents to myeongha_admin_reader;
grant select (id, product_id, currency) on public.product_offers to myeongha_admin_reader;
grant select (id, product_key, product_type, enabled, created_at)
  on public.products to myeongha_admin_reader;
grant select (subject_id, status) on public.entitlements to myeongha_admin_reader;
grant select (id, status) on public.entitlement_grants to myeongha_admin_reader;
grant select (grant_id, source_receipt_id, event_type) on public.entitlement_events to myeongha_admin_reader;
grant select (id, subject_id, source_kind, source_ref, credits_issued, credits_remaining, issued_at, expires_at)
  on public.chat_credit_lots_v1 to myeongha_admin_reader;
grant select (id, subject_id, required_credits, state, delivered_turn_id, created_at, finalized_at)
  on public.chat_credit_turn_reservations_v1 to myeongha_admin_reader;
grant select (id, created_at, subject_id, stage, model, status, error_code, input_tokens, output_tokens, latency_ms)
  on public.ai_execution_logs to myeongha_admin_reader;
grant select (created_at, subject_id, phase, model_key, outcome, cost_status, estimated_cost_micro_usd)
  on public.seyeon_ai_call_cost_events to myeongha_admin_reader;
grant select (id, event_type, status, created_at) on public.outbox_events to myeongha_admin_reader;
grant select (id, subject_id, scope, status, requested_at, completed_at, error_code)
  on public.data_deletion_jobs to myeongha_admin_reader;
grant select (id, content_version) on public.content_bundles to myeongha_admin_reader;
grant select (release_key, content_bundle_id, status, is_default, activated_at, created_at, id)
  on public.content_releases to myeongha_admin_reader;
grant select (character_id, content_bundle_id, availability, enabled, release_at, published_at)
  on public.character_runtime_catalog to myeongha_admin_reader;

-- The read role receives policies on EXACT known tables and no extra
-- table/column privileges. Each CREATE POLICY is an offline gated change.
create policy admin_read_subject_metadata_v1 on public.subjects
  for select to myeongha_admin_reader using (true);
create policy admin_read_reading_metadata_v1 on public.readings
  for select to myeongha_admin_reader using (true);
create policy admin_read_receipt_metadata_v1 on public.commerce_receipts
  for select to myeongha_admin_reader using (true);
create policy admin_read_purchase_intent_status_v1 on public.purchase_intents
  for select to myeongha_admin_reader using (true);
create policy admin_read_offer_metadata_v1 on public.product_offers
  for select to myeongha_admin_reader using (true);
create policy admin_read_product_metadata_v1 on public.products
  for select to myeongha_admin_reader using (true);
create policy admin_read_entitlements_metadata_v1 on public.entitlements
  for select to myeongha_admin_reader using (true);
create policy admin_read_entitlement_grant_status_v1 on public.entitlement_grants
  for select to myeongha_admin_reader using (true);
create policy admin_read_entitlement_receipt_link_v1 on public.entitlement_events
  for select to myeongha_admin_reader using (true);
create policy admin_read_credit_lot_metadata_v1 on public.chat_credit_lots_v1
  for select to myeongha_admin_reader using (true);
create policy admin_read_credit_reservations_v1 on public.chat_credit_turn_reservations_v1
  for select to myeongha_admin_reader using (true);
create policy admin_read_ai_execution_metadata_v1 on public.ai_execution_logs
  for select to myeongha_admin_reader using (true);
create policy admin_read_ai_cost_metadata_v1 on public.seyeon_ai_call_cost_events
  for select to myeongha_admin_reader using (true);
create policy admin_read_outbox_metadata_v1 on public.outbox_events
  for select to myeongha_admin_reader using (true);
create policy admin_read_deletion_job_metadata_v1 on public.data_deletion_jobs
  for select to myeongha_admin_reader using (true);
create policy admin_read_content_bundle_metadata_v1 on public.content_bundles
  for select to myeongha_admin_reader using (true);
create policy admin_read_content_release_metadata_v1 on public.content_releases
  for select to myeongha_admin_reader using (true);
create policy admin_read_character_catalog_metadata_v1 on public.character_runtime_catalog
  for select to myeongha_admin_reader using (true);

-- Audit-only INSERT. Never grant read, update or delete for audit events.
grant usage on schema myeongha_admin_ops to myeongha_admin_audit_writer;
grant insert (request_id, actor_auth_user_id, target_ref, action, outcome, occurred_at)
  on myeongha_admin_ops.admin_audit_events_v1 to myeongha_admin_audit_writer;
create policy admin_append_audit_v1 on myeongha_admin_ops.admin_audit_events_v1
  for insert to myeongha_admin_audit_writer with check (true);

commit;
