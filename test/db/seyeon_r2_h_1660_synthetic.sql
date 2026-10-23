-- R2-H 1660: reject malformed candidate lookup inputs before any row access.
-- No Subject rows, Reader threads, purchase state or Production writes.
-- Watchtower-Track: ops
DO $locator_negative$
DECLARE
 v_subject uuid:='fab00000-0000-4000-8000-000000001660';
 v_blocked boolean;
 v_constraint text;
BEGIN
 v_blocked:=false;
 BEGIN
  PERFORM thread_id FROM public.qry_member_single_character_thread_locator_v1(NULL::uuid,'seyeon');
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
  v_blocked:=(v_constraint='qry_member_single_character_thread_locator_input_required');
 END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'HOLD_R2_H_1660_NULL_SUBJECT_ACCEPTED'; END IF;

 v_blocked:=false;
 BEGIN
  PERFORM thread_id FROM public.qry_member_single_character_thread_locator_v1(v_subject,'');
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
  v_blocked:=(v_constraint='qry_member_single_character_thread_locator_input_required');
 END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'HOLD_R2_H_1660_EMPTY_CHARACTER_ACCEPTED'; END IF;

 v_blocked:=false;
 BEGIN
  PERFORM thread_id FROM public.qry_member_single_character_thread_locator_v1(v_subject,' seyeon');
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
  v_blocked:=(v_constraint='qry_member_single_character_thread_locator_input_required');
 END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'HOLD_R2_H_1660_NONCANONICAL_CHARACTER_ACCEPTED'; END IF;
END
$locator_negative$;
