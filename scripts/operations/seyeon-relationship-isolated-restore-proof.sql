-- Validates the six exact scoped migration-history rows rehydrated from a
-- protected Production backup snapshot AND the eleven real restored functions.
-- This is an isolated PostgreSQL check only. The provider-managed full
-- supabase_migrations ledger remains outside the portable logical dump.
-- Watchtower-Track: ops
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '15s';
CREATE TEMP TABLE seyeon_restored_early_history (
  version text PRIMARY KEY,
  name text NOT NULL
) ON COMMIT DROP;

-- The backup producer captured ONLY version/name from the source, without
-- historical SQL statements, credentials, or user data.
INSERT INTO pg_temp.seyeon_restored_early_history (version, name)
SELECT version, name
FROM jsonb_to_recordset(:'seyeon_history_json'::jsonb)
  AS captured(version text, name text);

DO $seyeon_restore_proof$
DECLARE
  expected_count integer;
  actual_count integer;
  early_function_count integer;
  early_rls_count integer;
BEGIN
  WITH expected(version, name) AS (
    VALUES
      ('1400','relationship_apply_context_v1'),
      ('1410','relationship_event_apply_command_v1'),
      ('1420','relationship_reliability_context_v1'),
      ('1430','relationship_adjustment_commands_v1'),
      ('1440','relationship_projection_rebuild_v1'),
      ('1450','relationship_snapshot_runtime_v1')
  )
  SELECT count(*) INTO expected_count FROM expected;

  SELECT count(*) INTO actual_count FROM pg_temp.seyeon_restored_early_history;
  IF actual_count IS DISTINCT FROM expected_count OR EXISTS (
    WITH expected(version, name) AS (
      VALUES
        ('1400','relationship_apply_context_v1'),
        ('1410','relationship_event_apply_command_v1'),
        ('1420','relationship_reliability_context_v1'),
        ('1430','relationship_adjustment_commands_v1'),
        ('1440','relationship_projection_rebuild_v1'),
        ('1450','relationship_snapshot_runtime_v1')
    )
    SELECT version, name FROM expected
    EXCEPT
    SELECT version, name FROM pg_temp.seyeon_restored_early_history
  ) THEN
    RAISE EXCEPTION 'HOLD_SEYEON_RESTORE: backup migration history subset mismatch';
  END IF;

  SELECT count(*) INTO early_function_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname IN (
      'relationship_event_json_v1',
      'cmd_lock_relationship_apply_context_v1',
      'cmd_apply_relationship_event_runtime_v1',
      'cmd_lock_relationship_history_context_v1',
      'relationship_assert_adjustment_slot_v1',
      'cmd_append_relationship_retraction_runtime_v1',
      'cmd_append_relationship_correction_runtime_v1',
      'cmd_commit_relationship_replay_projection_v1',
      'cmd_rebuild_relationship_projection_runtime_v1',
      'cmd_write_relationship_snapshot_runtime_v1',
      'qry_latest_valid_relationship_snapshot_v1'
    );
  IF early_function_count IS DISTINCT FROM 11 THEN
    RAISE EXCEPTION 'HOLD_SEYEON_RESTORE: restored function catalog missing or overloaded';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'relationship_event_json_v1',
        'cmd_lock_relationship_apply_context_v1',
        'cmd_apply_relationship_event_runtime_v1',
        'cmd_lock_relationship_history_context_v1',
        'relationship_assert_adjustment_slot_v1',
        'cmd_append_relationship_retraction_runtime_v1',
        'cmd_append_relationship_correction_runtime_v1',
        'cmd_commit_relationship_replay_projection_v1',
        'cmd_rebuild_relationship_projection_runtime_v1',
        'cmd_write_relationship_snapshot_runtime_v1',
        'qry_latest_valid_relationship_snapshot_v1'
      )
      AND (
        pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        OR pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'HOLD_SEYEON_RESTORE: restored early function publicly executable';
  END IF;

  SELECT count(*) INTO early_rls_count
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN (
      'relationship_history_entries',
      'relationship_event_records',
      'relationship_event_adjustments',
      'relationship_event_links',
      'relationship_event_provenance_refs',
      'relationship_state_snapshots'
    )
    AND c.relrowsecurity
    AND NOT pg_catalog.has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE');
  IF early_rls_count IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'HOLD_SEYEON_RESTORE: relationship RLS or browser table ACL mismatch';
  END IF;
END
$seyeon_restore_proof$;

SELECT 'PASS_SEYEON_RESTORED_EARLY_HISTORY_SNAPSHOT_6_FUNCTIONS_11_RLS_6' AS verdict;
ROLLBACK;
