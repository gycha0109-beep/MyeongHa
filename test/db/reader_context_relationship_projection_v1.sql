-- Real PostgreSQL Subject-bound relationship projection read.
-- Synthetic identities only; all fixture rows are rolled back.
BEGIN;

DO $reader_context_relationship_privilege_check$
DECLARE
  v_owner text;
  v_security_definer boolean;
BEGIN
  IF NOT pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.qry_reader_context_relationship_projection_v1(uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'API executor must have the current relationship projection read';
  END IF;
  IF pg_catalog.has_function_privilege(
    'anon',
    'public.qry_reader_context_relationship_projection_v1(uuid,text)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'public.qry_reader_context_relationship_projection_v1(uuid,text)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'service_role',
    'public.qry_reader_context_relationship_projection_v1(uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Browser and service roles must not execute the current relationship projection read';
  END IF;

  SELECT pg_catalog.pg_get_userbyid(p.proowner), p.prosecdef
    INTO v_owner, v_security_definer
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'public.qry_reader_context_relationship_projection_v1(uuid,text)'::pg_catalog.regprocedure;

  IF v_owner IS DISTINCT FROM 'myeongha_relationship_apply_owner'
     OR v_security_definer IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Relationship projection must use the least-privilege relationship owner';
  END IF;
END
$reader_context_relationship_privilege_check$;

INSERT INTO auth.users(id) VALUES
  ('a8100000-0000-4000-8000-000000000001'),
  ('a8100000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) VALUES
  ('a8200000-0000-4000-8000-000000000001','member','a8100000-0000-4000-8000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('a8200000-0000-4000-8000-000000000002','member','a8100000-0000-4000-8000-000000000002','active',null,clock_timestamp(),clock_timestamp());

INSERT INTO public.characters(character_id,created_at,retired_at) VALUES
  ('working-memory-reader-a',clock_timestamp(),null),
  ('working-memory-reader-b',clock_timestamp(),null)
ON CONFLICT DO NOTHING;

INSERT INTO public.user_character_states(
  id,subject_id,character_id,closeness,trust,friction,
  relationship_stage,policy_version,revision,last_interaction_at,
  created_at,updated_at
) VALUES
  ('a8300000-0000-4000-8000-000000000001','a8200000-0000-4000-8000-000000000001',
   'working-memory-reader-a',21,34,2,'familiar','relationship-policy-v1',2,
   null,clock_timestamp(),clock_timestamp()),
  ('a8300000-0000-4000-8000-000000000002','a8200000-0000-4000-8000-000000000002',
   'working-memory-reader-a',65,71,1,'close','relationship-policy-v1',4,
   null,clock_timestamp(),clock_timestamp());

SET LOCAL ROLE myeongha_api_executor;
SELECT pg_catalog.set_config(
  'myeongha.subject_id',
  'a8200000-0000-4000-8000-000000000001',
  true
);

DO $reader_context_relationship_owner_a$
DECLARE
  v_count bigint;
  v_revision bigint;
  v_closeness integer;
  v_constraint text;
BEGIN
  SELECT count(*), max(revision), max(closeness)
    INTO v_count, v_revision, v_closeness
  FROM public.qry_reader_context_relationship_projection_v1(
    'a8200000-0000-4000-8000-000000000001'::uuid,
    'working-memory-reader-a'
  );
  IF v_count <> 1 OR v_revision <> 2 OR v_closeness <> 21 THEN
    RAISE EXCEPTION 'Owner A current relationship projection was not returned exactly';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.qry_reader_context_relationship_projection_v1(
    'a8200000-0000-4000-8000-000000000001'::uuid,
    'working-memory-reader-b'
  );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'A missing relationship baseline must not be invented';
  END IF;

  BEGIN
    PERFORM 1 FROM public.qry_reader_context_relationship_projection_v1(
      'a8200000-0000-4000-8000-000000000002'::uuid,
      'working-memory-reader-a'
    );
    RAISE EXCEPTION 'CROSS_SUBJECT_RELATIONSHIP_PROJECTION_LEAK';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'myeongha_subject_context_mismatch' THEN
      RAISE EXCEPTION 'Unexpected cross-Subject relationship failure %', v_constraint;
    END IF;
  END;
END
$reader_context_relationship_owner_a$;

SELECT pg_catalog.set_config(
  'myeongha.subject_id',
  'a8200000-0000-4000-8000-000000000002',
  true
);

DO $reader_context_relationship_owner_b$
DECLARE
  v_count bigint;
  v_revision bigint;
  v_closeness integer;
BEGIN
  SELECT count(*), max(revision), max(closeness)
    INTO v_count, v_revision, v_closeness
  FROM public.qry_reader_context_relationship_projection_v1(
    'a8200000-0000-4000-8000-000000000002'::uuid,
    'working-memory-reader-a'
  );
  IF v_count <> 1 OR v_revision <> 4 OR v_closeness <> 65 THEN
    RAISE EXCEPTION 'Owner B current relationship projection was not returned exactly';
  END IF;
END
$reader_context_relationship_owner_b$;

RESET ROLE;
ROLLBACK;
