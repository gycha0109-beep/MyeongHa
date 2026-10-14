-- Synthetic-only missing subject must never be authorized for AI budget admission.
-- No Subject row, provider dispatch, actual data, or Production write.
-- Watchtower-Track: ops
DO $r2h1650$
DECLARE v_subject uuid:='fab00000-0000-4000-8000-000000001650';
DECLARE v_constraint text;
DECLARE v_blocked boolean:=false;
BEGIN
 PERFORM pg_catalog.set_config('myeongha.subject_id',v_subject::text,true);
 BEGIN
  PERFORM public.seyeon_ai_lock_active_subject_for_cost_v1(v_subject);
 EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
  v_blocked:=(v_constraint='seyeon_ai_governor_subject_inactive');
 END;
 IF NOT v_blocked THEN
  RAISE EXCEPTION 'HOLD_R2_H_1650_INACTIVE_SUBJECT_WAS_NOT_BLOCKED';
 END IF;
END
$r2h1650$;
