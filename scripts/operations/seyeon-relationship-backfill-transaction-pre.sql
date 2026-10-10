-- Transactional, scoped Production backfill. Never call standalone.
-- Invoked only between BEGIN/COMMIT by psql --single-transaction.
-- Watchtower-Track: ops
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $seyeon_pre_apply$
declare
  v_bundle int;
  v_late int;
  v_early int;
begin
  if not pg_try_advisory_xact_lock(14001450) then
    raise exception 'HOLD_SEYEON_BACKFILL: concurrent scoped operator';
  end if;
  if current_user <> 'postgres'
     or current_setting('server_version_num')::int < 170000
     or current_setting('server_version_num')::int >= 180000 then
    raise exception 'HOLD_SEYEON_BACKFILL: unexpected DB authority or PG version';
  end if;
  if not (select rolcreaterole from pg_roles where rolname = current_user)
     or not has_schema_privilege(current_user, 'public', 'CREATE') then
    raise exception 'HOLD_SEYEON_BACKFILL: insufficient managed-owner authority';
  end if;
  if (select count(*) from pg_roles where rolname in (
    'myeongha_api_executor','myeongha_relationship_apply_owner',
    'myeongha_seyeon_chat_runtime_owner','myeongha_seyeon_post_turn_owner')) <> 4 then
    raise exception 'HOLD_SEYEON_BACKFILL: expected owner roles missing';
  end if;
  select count(*) into v_late
    from supabase_migrations.schema_migrations
    where version in ('1460','1470','1480','1490','1500','1510');
  select count(*) into v_early
    from supabase_migrations.schema_migrations
    where version in ('1400','1410','1420','1430','1440','1450');
  if v_late <> 6 or v_early <> 0 then
    raise exception 'HOLD_SEYEON_BACKFILL: migration history has changed';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
      where version >= '1520' and version <= '1640') <> 0 then
    raise exception 'HOLD_SEYEON_BACKFILL: later dependent migrations already present';
  end if;
  if (select count(*) from (
      values
      ('1460','seyeon_production_relationship_runtime_read_v1'),
      ('1470','seyeon_relationship_sync_outbox_v1'),
      ('1480','seyeon_production_context_runtime_v1'),
      ('1490','seyeon_production_chat_execution_runtime_v1'),
      ('1500','seyeon_post_turn_analysis_runtime_v1'),
      ('1510','seyeon_production_runtime_composition_v1')
    ) as expected(version,name)
    join supabase_migrations.schema_migrations actual using (version,name)) <> 6 then
    raise exception 'HOLD_SEYEON_BACKFILL: later history marker names have changed';
  end if;
  select count(*) into v_bundle from supabase_migrations.schema_migrations
    where version='20261008090417'
      and name='seyeon_runtime_1460_1510_acl_before_owner_recovery'
      and cardinality(statements)=1
      and octet_length(convert_to(statements[1],'UTF8'))=104021
      and encode(sha256(convert_to(statements[1],'UTF8')),'hex')=
        '4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894';
  if v_bundle <> 1 then
    raise exception 'HOLD_SEYEON_BACKFILL: historical recovery SQL fingerprint changed';
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
    'qry_latest_valid_relationship_snapshot_v1')) <> 0 then
    raise exception 'HOLD_SEYEON_BACKFILL: early functions already installed';
  end if;
  if (select count(*) from public.relationship_event_records) <> 0
     or (select count(*) from public.relationship_state_snapshots) <> 0 then
    raise exception 'HOLD_SEYEON_BACKFILL: relationship records exist; needs dedicated data review';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
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
    'qry_content_bundle_manifest_v1')) <> 18 then
    raise exception 'HOLD_SEYEON_BACKFILL: later RPC catalog has changed';
  end if;
end $seyeon_pre_apply$;

create temporary table pg_temp.seyeon_before_backfill_fingerprint
  on commit drop
  as select
    md5(string_agg(
      p.oid::regprocedure::text || ':' || pg_get_functiondef(p.oid) || ':' ||
      pg_get_userbyid(p.proowner) || ':' || coalesce(p.proacl::text,'') || ':' ||
      p.prosecdef::text, E'\n' order by p.oid::regprocedure::text
    )) as sha
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

create temporary table pg_temp.seyeon_before_owner_membership
  on commit drop
  as select md5(coalesce(string_agg(
    m.roleid::text || ':' || m.member::text || ':' || m.grantor::text || ':' ||
    m.admin_option::text || ':' || m.inherit_option::text || ':' ||
    m.set_option::text, E'\\n' order by m.member::text, m.roleid::text
  ), '')) as sha
  from pg_auth_members m
  join pg_roles r on r.oid=m.roleid
  where r.rolname = 'myeongha_relationship_apply_owner';
