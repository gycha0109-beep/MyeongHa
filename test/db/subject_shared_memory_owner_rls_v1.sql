-- Member-authored shared memory: real RLS/least-privilege checks on isolated CI PostgreSQL.
-- Only synthetic Subjects and strings; all changes are rolled back.
BEGIN;

DO $shared_memory_privileges$
BEGIN
  IF NOT pg_catalog.has_column_privilege(
    'myeongha_api_executor', 'public.subject_shared_memory_items_v1', 'body_text', 'SELECT'
  ) OR NOT pg_catalog.has_column_privilege(
    'myeongha_api_executor', 'public.subject_shared_memory_items_v1', 'body_text', 'INSERT'
  ) OR NOT pg_catalog.has_column_privilege(
    'myeongha_api_executor', 'public.subject_shared_memory_items_v1', 'body_text', 'UPDATE'
  ) OR NOT pg_catalog.has_table_privilege(
    'myeongha_api_executor', 'public.subject_shared_memory_items_v1', 'DELETE'
  ) THEN
    RAISE EXCEPTION 'Shared memory executor is missing required narrow owner CRUD grants';
  END IF;
  IF pg_catalog.has_column_privilege('anon', 'public.subject_shared_memory_items_v1', 'body_text', 'SELECT')
     OR pg_catalog.has_column_privilege('authenticated', 'public.subject_shared_memory_items_v1', 'body_text', 'SELECT')
     OR pg_catalog.has_column_privilege('service_role', 'public.subject_shared_memory_items_v1', 'body_text', 'SELECT')
     OR pg_catalog.has_table_privilege('anon', 'public.subject_shared_memory_items_v1', 'DELETE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.subject_shared_memory_items_v1', 'DELETE')
     OR pg_catalog.has_table_privilege('service_role', 'public.subject_shared_memory_items_v1', 'DELETE')
  THEN
    RAISE EXCEPTION 'Shared memory cannot be directly accessible to browser/service roles';
  END IF;
END
$shared_memory_privileges$;

INSERT INTO auth.users(id) VALUES
  ('c1100000-0000-4000-8000-000000000001'),
  ('c1100000-0000-4000-8000-000000000002'),
  ('c1100000-0000-4000-8000-000000000004')
ON CONFLICT DO NOTHING;

INSERT INTO public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) VALUES
  ('c1200000-0000-4000-8000-000000000001','member','c1100000-0000-4000-8000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('c1200000-0000-4000-8000-000000000002','member','c1100000-0000-4000-8000-000000000002','active',null,clock_timestamp(),clock_timestamp()),
  ('c1200000-0000-4000-8000-000000000003','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('c1200000-0000-4000-8000-000000000004','member','c1100000-0000-4000-8000-000000000004','deletion_pending',null,clock_timestamp(),clock_timestamp());

INSERT INTO public.subject_shared_memory_items_v1 (id,subject_id,body_text) VALUES
  ('c1300000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000001','OWNER_A_PRIVATE'),
  ('c1300000-0000-4000-8000-000000000002','c1200000-0000-4000-8000-000000000002','OWNER_B_PRIVATE'),
  ('c1300000-0000-4000-8000-000000000003','c1200000-0000-4000-8000-000000000003','GUEST_FIXTURE'),
  ('c1300000-0000-4000-8000-000000000004','c1200000-0000-4000-8000-000000000004','DELETION_PENDING_FIXTURE');

SET LOCAL ROLE myeongha_api_executor;
SELECT pg_catalog.set_config('myeongha.subject_id','c1200000-0000-4000-8000-000000000001',true);

-- An authenticated API query must not manufacture a false recovery deletion.
-- The private writer is executable by the DELETE trigger only.
DO $shared_memory_direct_recovery_event_denied$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.internal_record_shared_memory_note_deletion_v1(
      'c1300000-0000-4000-8000-000000000009',
      'c1200000-0000-4000-8000-000000000001');
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'API executor forged a shared-note deletion recovery record';
  END IF;
END
$shared_memory_direct_recovery_event_denied$;

DO $shared_memory_member_a$
DECLARE v_count bigint; v_text text;
BEGIN
  SELECT count(*), max(body_text) INTO v_count,v_text FROM public.subject_shared_memory_items_v1;
  IF v_count <> 1 OR v_text <> 'OWNER_A_PRIVATE' THEN
    RAISE EXCEPTION 'RLS must show only owner A shared memory';
  END IF;
  UPDATE public.subject_shared_memory_items_v1
    SET body_text = 'OWNER_A_UPDATED',updated_at = clock_timestamp()
    WHERE id = 'c1300000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Owner A update was denied'; END IF;
  UPDATE public.subject_shared_memory_items_v1
    SET body_text = 'FORGED_CROSS_OWNER'
    WHERE id = 'c1300000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Owner A edited B memory'; END IF;
  DELETE FROM public.subject_shared_memory_items_v1
    WHERE id = 'c1300000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Owner A deleted B memory'; END IF;
  DELETE FROM public.subject_shared_memory_items_v1
    WHERE id = 'c1300000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Owner A physical deletion failed'; END IF;
  SELECT count(*) INTO v_count FROM public.subject_shared_memory_items_v1;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Deleted owner text remains visible'; END IF;
END
$shared_memory_member_a$;

SELECT pg_catalog.set_config('myeongha.subject_id','c1200000-0000-4000-8000-000000000002',true);
DO $shared_memory_member_b$
DECLARE v_count bigint; v_text text;
BEGIN
  SELECT count(*),max(body_text) INTO v_count,v_text FROM public.subject_shared_memory_items_v1;
  IF v_count <> 1 OR v_text <> 'OWNER_B_PRIVATE' THEN
    RAISE EXCEPTION 'Owner B record must remain intact after A update/delete';
  END IF;
END
$shared_memory_member_b$;

SELECT pg_catalog.set_config('myeongha.subject_id','c1200000-0000-4000-8000-000000000003',true);
DO $shared_memory_guest$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM public.subject_shared_memory_items_v1;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Guest must not read shared memory'; END IF;
  BEGIN
    INSERT INTO public.subject_shared_memory_items_v1(id,subject_id,body_text) VALUES
      ('c1300000-0000-4000-8000-000000000005','c1200000-0000-4000-8000-000000000003','DENIED');
    RAISE EXCEPTION 'GUEST_INSERT_WAS_NOT_BLOCKED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END
$shared_memory_guest$;

SELECT pg_catalog.set_config('myeongha.subject_id','c1200000-0000-4000-8000-000000000004',true);
DO $shared_memory_deletion_pending$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM public.subject_shared_memory_items_v1;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Deletion-pending member must not read shared memory'; END IF;
  BEGIN
    INSERT INTO public.subject_shared_memory_items_v1(id,subject_id,body_text) VALUES
      ('c1300000-0000-4000-8000-000000000006','c1200000-0000-4000-8000-000000000004','DENIED');
    RAISE EXCEPTION 'PENDING_INSERT_WAS_NOT_BLOCKED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END
$shared_memory_deletion_pending$;

RESET ROLE;
DO $shared_memory_physical_delete$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM public.subject_shared_memory_items_v1
  WHERE id = 'c1300000-0000-4000-8000-000000000001';
  IF v_count <> 0 THEN RAISE EXCEPTION 'Manual DELETE must remove actual text row'; END IF;
  SELECT count(*) INTO v_count FROM public.subject_shared_memory_items_v1
  WHERE id = 'c1300000-0000-4000-8000-000000000002'
    AND body_text = 'OWNER_B_PRIVATE';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Cross-owner row was modified'; END IF;
END
$shared_memory_physical_delete$;
DO $shared_memory_delete_recovery$
DECLARE
  v_initial_at timestamptz;
  v_rejected boolean;
BEGIN
  select deleted_at into v_initial_at from public.subject_shared_memory_delete_events_v1
  where item_id='c1300000-0000-4000-8000-000000000001'
    and subject_id='c1200000-0000-4000-8000-000000000001';
  if v_initial_at is null then
    raise exception 'Manual note DELETE did not atomically create identifier-only recovery evidence';
  end if;
  if pg_catalog.has_table_privilege('myeongha_api_executor',
       'public.subject_shared_memory_delete_events_v1','SELECT')
     or pg_catalog.has_table_privilege('myeongha_api_executor',
       'public.subject_shared_memory_delete_events_v1','INSERT')
     or pg_catalog.has_function_privilege('myeongha_api_executor',
       'public.internal_replay_shared_memory_note_deletion_v1(uuid,uuid,timestamptz)','EXECUTE')
  then
    raise exception 'API executor has unauthorized recovery ledger permissions';
  end if;
  perform public.internal_replay_shared_memory_note_deletion_v1(
    'c1200000-0000-4000-8000-000000000001',
    'c1300000-0000-4000-8000-000000000001',
    pg_catalog.date_trunc('milliseconds',v_initial_at));
  perform public.internal_replay_shared_memory_note_deletion_v1(
    'c1200000-0000-4000-8000-000000000001',
    'c1300000-0000-4000-8000-000000000001',
    pg_catalog.date_trunc('milliseconds',v_initial_at));
  if (select deleted_at from public.subject_shared_memory_delete_events_v1
      where item_id='c1300000-0000-4000-8000-000000000001')
       is distinct from v_initial_at then
    raise exception 'Identical replay changed deletion history';
  end if;
  insert into public.subject_shared_memory_items_v1(id,subject_id,body_text) values
    ('c1300000-0000-4000-8000-000000000007',
     'c1200000-0000-4000-8000-000000000001','SYNTHETIC_RESTORED_TEXT');
  perform public.internal_replay_shared_memory_note_deletion_v1(
    'c1200000-0000-4000-8000-000000000001',
    'c1300000-0000-4000-8000-000000000007',
    '2026-10-01T00:00:00.000Z'::timestamptz);
  if exists(select 1 from public.subject_shared_memory_items_v1
     where id='c1300000-0000-4000-8000-000000000007')
     or not exists(select 1 from public.subject_shared_memory_delete_events_v1
       where item_id='c1300000-0000-4000-8000-000000000007'
         and subject_id='c1200000-0000-4000-8000-000000000001'
         and deleted_at='2026-10-01T00:00:00.000Z'::timestamptz)
  then
    raise exception 'Replay failed to erase restored plaintext and preserve event time';
  end if;
  -- A post-backup creation and deletion should not fabricate a restored note.
  perform public.internal_replay_shared_memory_note_deletion_v1(
    'c1200000-0000-4000-8000-000000000001',
    'c1300000-0000-4000-8000-000000000008',
    '2026-10-01T00:00:01.000Z'::timestamptz);
  perform public.internal_replay_shared_memory_note_deletion_v1(
    'c1200000-0000-4000-8000-000000000001',
    'c1300000-0000-4000-8000-000000000008',
    '2026-10-01T00:00:01.000Z'::timestamptz);
  v_rejected:=false;
  begin
    perform public.internal_replay_shared_memory_note_deletion_v1(
      'c1200000-0000-4000-8000-000000000001',
      'c1300000-0000-4000-8000-000000000002',
      '2026-10-01T00:00:00.000Z'::timestamptz);
  exception when sqlstate '23514' then v_rejected:=true;
  end;
  if not v_rejected then raise exception 'Cross-owner replay bypassed Subject isolation'; end if;
  v_rejected:=false;
  begin
    perform public.internal_replay_shared_memory_note_deletion_v1(
      'c1200000-0000-4000-8000-000000000001',
      'c1300000-0000-4000-8000-000000000007',
      '2026-10-01T00:00:02.000Z'::timestamptz);
  exception when sqlstate '23514' then v_rejected:=true;
  end;
  if not v_rejected then raise exception 'Conflicting replay event was accepted'; end if;
  if not exists(select 1 from public.subject_shared_memory_items_v1
    where id='c1300000-0000-4000-8000-000000000002'
      and subject_id='c1200000-0000-4000-8000-000000000002'
      and body_text='OWNER_B_PRIVATE')
  then raise exception 'Replayed delete modified unrelated owner data'; end if;
END
$shared_memory_delete_recovery$;
ROLLBACK;
