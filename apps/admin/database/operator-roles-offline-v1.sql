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

-- Fail before granting if an existing same-named principal has drifted.
do $$
begin
  if (select count(*) from pg_catalog.pg_roles r
      where r.rolname in ('myeongha_admin_reader','myeongha_admin_audit_writer')
        and r.rolcanlogin and not r.rolsuper and not r.rolbypassrls
        and not r.rolcreatedb and not r.rolcreaterole and not r.rolreplication and not r.rolinherit
        and not exists (select 1 from pg_catalog.pg_auth_members m where m.member=r.oid)) <> 2 then
    raise exception 'Administrator principal privileges or memberships drifted';
  end if;
end $$;

-- These standalone roles are separate from the ordinary user API executor.
-- Their secrets are provisioned outside the repository and NEVER in Vite.
grant usage on schema public to myeongha_admin_reader;

-- Column-level SELECT only. No auth.users, raw Birth, chat body, Reading
-- payload, payment receipt JSON, AI prompt/output or guest session material.
grant select (id, kind, status, created_at) on public.subjects to myeongha_admin_reader;
grant select (subject_id, updated_at, status) on public.conversation_threads to myeongha_admin_reader;
grant select (id, subject_id, execution_status, saju_domain, request_contract_version, committed_execution_attempt_id, created_at, completed_at)
  on public.readings to myeongha_admin_reader;
grant select (id, reading_id, subject_id, execution_attempt_no, state, error_code, saju_engine_key,
  requested_engine_version, resolved_engine_version, started_at, finished_at)
  on public.reading_execution_attempts to myeongha_admin_reader;
grant select (reading_id, subject_id, saju_engine_key, saju_engine_version, reading_contract_version, product_response_state)
  on public.reading_refs to myeongha_admin_reader;
grant select (id, subject_id, purchase_intent_id, provider, platform, product_offer_id, verification_status, verified_at, verified_amount_minor, verified_currency, created_at)
  on public.commerce_receipts to myeongha_admin_reader;
grant select (id, resolved_subject_id, resolved_receipt_id, provider, event_type, status, resolution_source_type, provider_occurred_at, received_at, processed_at)
  on public.commerce_provider_events to myeongha_admin_reader;

grant select (id, status) on public.purchase_intents to myeongha_admin_reader;
grant select (id, product_id, currency, enabled, retired_at) on public.product_offers to myeongha_admin_reader;
grant select (id, product_key, product_type, enabled, retired_at, created_at)
  on public.products to myeongha_admin_reader;
grant select (id, subject_id, entitlement_key, status, active_grant_count, effective_valid_until, updated_at) on public.entitlements to myeongha_admin_reader;
grant select (id, subject_id, entitlement_key, scope_key_norm, status) on public.entitlement_grants to myeongha_admin_reader;
grant select (id, subject_id, grant_id, entitlement_key, source_receipt_id, source_type, event_type, effective_at, created_at) on public.entitlement_events to myeongha_admin_reader;
grant select (id, subject_id, source_kind, source_ref, credits_issued, credits_remaining, issued_at, expires_at)
  on public.chat_credit_lots_v1 to myeongha_admin_reader;
grant select (reservation_id, lot_id, credits) on public.chat_credit_turn_allocations_v1 to myeongha_admin_reader;
grant select (id, subject_id, thread_id, client_turn_id, required_credits, state, delivered_turn_id, created_at, finalized_at)
  on public.chat_credit_turn_reservations_v1 to myeongha_admin_reader;
grant select (id, created_at, subject_id, turn_id, stage, model, status, error_code, input_tokens, output_tokens, latency_ms)
  on public.ai_execution_logs to myeongha_admin_reader;
-- Exact Reading-grounding linkage only, never source prose or AI input/output JSON.
grant select (id, reading_id, subject_id) on public.reading_groundings to myeongha_admin_reader;
grant select (ai_execution_log_id, grounding_id, subject_id) on public.ai_execution_groundings to myeongha_admin_reader;
grant select (created_at, subject_id, phase, model_key, outcome, cost_status, estimated_cost_micro_usd)
  on public.seyeon_ai_call_cost_events to myeongha_admin_reader;
grant select (id, event_type, status, last_error_code, attempt_count, available_at, lease_expires_at, created_at) on public.outbox_events to myeongha_admin_reader;
grant select (id, subject_id, scope, status, requested_at, started_at, completed_at, error_code)
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
create policy admin_read_recent_thread_update_v1 on public.conversation_threads
  for select to myeongha_admin_reader using (true);
create policy admin_read_reading_metadata_v1 on public.readings
  for select to myeongha_admin_reader using (true);
create policy admin_read_reading_attempt_metadata_v1 on public.reading_execution_attempts
  for select to myeongha_admin_reader using (true);
create policy admin_read_reading_provenance_version_v1 on public.reading_refs
  for select to myeongha_admin_reader using (true);
create policy admin_read_receipt_metadata_v1 on public.commerce_receipts
  for select to myeongha_admin_reader using (true);
create policy admin_read_purchase_intent_status_v1 on public.purchase_intents
  for select to myeongha_admin_reader using (true);
create policy admin_read_provider_event_metadata_v1 on public.commerce_provider_events
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
create policy admin_read_credit_allocations_v1 on public.chat_credit_turn_allocations_v1
  for select to myeongha_admin_reader using (true);
create policy admin_read_credit_reservations_v1 on public.chat_credit_turn_reservations_v1
  for select to myeongha_admin_reader using (true);
create policy admin_read_ai_execution_metadata_v1 on public.ai_execution_logs
  for select to myeongha_admin_reader using (true);
create policy admin_read_reading_grounding_links_v1 on public.reading_groundings
  for select to myeongha_admin_reader using (true);
create policy admin_read_ai_grounding_links_v1 on public.ai_execution_groundings
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

-- Operator reader can inspect minimal audit metadata via its read-only transaction.
-- Audit writer remains INSERT-only and has NO SELECT permission.
grant usage on schema myeongha_admin_ops to myeongha_admin_reader;
grant select (request_id,actor_auth_user_id,target_ref,action,outcome,occurred_at)
  on myeongha_admin_ops.admin_audit_events_v1 to myeongha_admin_reader;
create policy admin_read_audit_metadata_v1 on myeongha_admin_ops.admin_audit_events_v1
  for select to myeongha_admin_reader using (true);
-- Audit-only INSERT. Never grant read, update or delete for audit events.
grant usage on schema myeongha_admin_ops to myeongha_admin_audit_writer;
grant insert (request_id, actor_auth_user_id, target_ref, action, outcome, occurred_at)
  on myeongha_admin_ops.admin_audit_events_v1 to myeongha_admin_audit_writer;
create policy admin_append_audit_v1 on myeongha_admin_ops.admin_audit_events_v1
  for insert to myeongha_admin_audit_writer with check (true);

commit;
