-- Phase 8-A / existing ROADMAP: SELECT-ONLY current Production catalog observation.
-- Source-only migrations: 1780 and 20261027054525.
-- No customer rows, raw SQL bodies, role grants or DDL/DML.
-- A currently absent named object does NOT establish historical non-execution.
-- Watchtower-Track: ops
WITH expected(kind,object_name,source_version) AS (
 VALUES
 ('function','cmd_apply_verified_portone_reader_full_cancellation_v1','1780'),
 ('table','digital_reading_checkout_notice_revisions_v1','20261027054525'),
 ('table','digital_reading_checkout_notice_presentations_v1','20261027054525'),
 ('table','digital_reading_checkout_notice_acknowledgments_v1','20261027054525'),
 ('function','ct_validate_digital_checkout_notice_presentation_v1','20261027054525'),
 ('function','ct_validate_digital_checkout_notice_acknowledgment_v1','20261027054525'),
 ('function','tr_digital_checkout_notice_immutable_v1','20261027054525'),
 ('trigger','ct_digital_checkout_notice_presentation_v1','20261027054525'),
 ('trigger','ct_digital_checkout_notice_acknowledgment_v1','20261027054525'),
 ('trigger','tr_digital_checkout_notice_revision_immutable_v1','20261027054525'),
 ('trigger','tr_digital_checkout_notice_presentation_immutable_v1','20261027054525'),
 ('trigger','tr_digital_checkout_notice_ack_immutable_v1','20261027054525')
)
SELECT
 e.source_version,
 e.kind AS object_kind,
 e.object_name,
 EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations m
   WHERE m.version = e.source_version
 ) AS exact_source_version_in_ledger,
 CASE e.kind
  WHEN 'function' THEN (SELECT count(*) FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname=e.object_name)
  WHEN 'table' THEN (SELECT count(*) FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname=e.object_name)
  ELSE (SELECT count(*) FROM pg_catalog.pg_trigger tg
   JOIN pg_catalog.pg_class c ON c.oid=tg.tgrelid
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND NOT tg.tgisinternal AND tg.tgname=e.object_name)
 END AS current_named_object_matches,
 (SELECT max(m.version)::text FROM supabase_migrations.schema_migrations m) AS observed_migration_frontier,
 (SELECT count(*) FROM supabase_migrations.schema_migrations) AS applied_migration_count
FROM expected e ORDER BY e.source_version,e.kind,e.object_name;
