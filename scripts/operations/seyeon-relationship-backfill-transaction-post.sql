-- Must be last SQL file in the same psql --single-transaction invocation.
-- Never mark historical SQL versions applied without successfully installing them.
-- Watchtower-Track: ops
do $seyeon_assert_before_markers$
declare
  v_before text;
  v_after text;
begin
  select sha into strict v_before from pg_temp.seyeon_before_backfill_fingerprint;
  select md5(string_agg(
    p.oid::regprocedure::text || ':' || pg_get_functiondef(p.oid) || ':' ||
    pg_get_userbyid(p.proowner) || ':' || coalesce(p.proacl::text,'') || ':' ||
    p.prosecdef::text, E'\n' order by p.oid::regprocedure::text
  )) into v_after
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('qry_production_relationship_runtime_v1',
        'cmd_enqueue_seyeon_relationship_sync_v1',
        'cmd_claim_seyeon_relationship_sync_v1',
        'cmd_complete_seyeon_relationship_sync_v1',
        'qry_production_relationship_history_runtime_v1',
        'cmd_receive_seyeon_chat_turn_runtime_v1',
        'cmd_allocate_seyeon_chat_attempt_runtime_v1',
        'cmd_mark_seyeon_chat_context_ready_runtime_v1',
        'cmd_fail_seyeon_chat_attempt_runtime_v1',
        'cmd_persist_seyeon_chat_generated_runtime_v1',
        'cmd_persist_seyeon_chat_validated_runtime_v1',
        'cmd_commit_seyeon_chat_turn_runtime_v1',
        'cmd_commit_seyeon_chat_turn_runtime_v2',
        'qry_seyeon_post_turn_analysis_job_v1',
        'cmd_claim_seyeon_post_turn_analysis_v1',
        'cmd_checkpoint_seyeon_post_turn_analysis_v1',
        'cmd_complete_seyeon_post_turn_analysis_v1',
        'qry_content_bundle_manifest_v1');
  if v_before is null or v_before is distinct from v_after then
    raise exception 'HOLD_SEYEON_BACKFILL: later runtime definition/Owner/ACL fingerprint changed';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('relationship_event_json_v1',
        'cmd_lock_relationship_apply_context_v1',
        'cmd_apply_relationship_event_runtime_v1',
        'cmd_lock_relationship_history_context_v1',
        'relationship_assert_adjustment_slot_v1',
        'cmd_append_relationship_retraction_runtime_v1',
        'cmd_append_relationship_correction_runtime_v1',
        'cmd_commit_relationship_replay_projection_v1',
        'cmd_rebuild_relationship_projection_runtime_v1',
        'cmd_write_relationship_snapshot_runtime_v1',
        'qry_latest_valid_relationship_snapshot_v1')) <> 11 then
    raise exception 'HOLD_SEYEON_BACKFILL: 11 early functions not installed';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('relationship_event_json_v1',
        'cmd_lock_relationship_apply_context_v1',
        'cmd_apply_relationship_event_runtime_v1',
        'cmd_lock_relationship_history_context_v1',
        'relationship_assert_adjustment_slot_v1',
        'cmd_append_relationship_retraction_runtime_v1',
        'cmd_append_relationship_correction_runtime_v1',
        'cmd_commit_relationship_replay_projection_v1',
        'cmd_rebuild_relationship_projection_runtime_v1',
        'cmd_write_relationship_snapshot_runtime_v1',
        'qry_latest_valid_relationship_snapshot_v1')
        and (has_function_privilege('anon',p.oid,'EXECUTE')
          or has_function_privilege('authenticated',p.oid,'EXECUTE'))) <> 0 then
    raise exception 'HOLD_SEYEON_BACKFILL: early RPC unexpectedly exposed to public roles';
  end if;
  if (select count(*) from public.relationship_event_records) <> 0
     or (select count(*) from public.relationship_state_snapshots) <> 0 then
    raise exception 'HOLD_SEYEON_BACKFILL: unexpected relationship row creation';
  end if;
end $seyeon_assert_before_markers$;

insert into supabase_migrations.schema_migrations(version,name)
values
('1400','relationship_apply_context_v1'),
('1410','relationship_event_apply_command_v1'),
('1420','relationship_reliability_context_v1'),
('1430','relationship_adjustment_commands_v1'),
('1440','relationship_projection_rebuild_v1'),
('1450','relationship_snapshot_runtime_v1');

do $seyeon_verify_history$
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version in ('1400','1410','1420','1430','1440','1450')) <> 6 then
    raise exception 'HOLD_SEYEON_BACKFILL: scoped history registration incomplete';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
      where version in ('1460','1470','1480','1490','1500','1510')) <> 6 then
    raise exception 'HOLD_SEYEON_BACKFILL: unrelated later history changed';
  end if;
end $seyeon_verify_history$;

select 'PASS_SEYEON_SCOPED_1400_1450_TRANSACTION' as verdict;
