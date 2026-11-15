-- Apply ONLY after the original A4 proof private store was installed in the
-- intended MyeongHa Production DB and the one-minute retention cron is active.
-- The approved limit is MAXIMUM 30x24 hours, not a minimum. Cleaning at 29 days
-- provides a one-day operational safety window, while retaining the 1000-row bound.
-- An outage longer than the buffer or excess backlog must be detected by monitoring.
-- This changes only the A4 private proof purge function; not customer/cost ledgers.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('myeongha_a4_source_ops.prepared_attempt_proofs_v1') IS NULL
    OR to_regprocedure('myeongha_a4_source_ops.cmd_purge_expired_proofs_v1(integer)') IS NULL
    OR to_regrole('myeongha_a4_prepared_proof_maintenance_v1') IS NULL THEN
    RAISE EXCEPTION 'A4 prepared-proof store is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'myeongha_a4_prepared_proofs_purge_v1'
      AND active
      AND schedule = '* * * * *'
      AND command = 'SELECT myeongha_a4_source_ops.cmd_purge_expired_proofs_v1(1000);'
  ) THEN
    RAISE EXCEPTION 'A4 one-minute purge job not active or configuration differs';
  END IF;
  IF position('INTERVAL ''30 days''' in (
    SELECT prosrc FROM pg_proc
     WHERE oid = 'myeongha_a4_source_ops.cmd_purge_expired_proofs_v1(integer)'::regprocedure
  )) = 0 THEN
    RAISE EXCEPTION 'A4 purge source changed unexpectedly; do not override';
  END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION myeongha_a4_source_ops.cmd_purge_expired_proofs_v1(p_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $purge$
DECLARE v_deleted integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'Invalid A4 proof purge batch bound';
  END IF;
  WITH due AS (
    SELECT execution_attempt_id
    FROM myeongha_a4_source_ops.prepared_attempt_proofs_v1
    WHERE stored_at <= clock_timestamp() - INTERVAL '29 days'
    ORDER BY stored_at, execution_attempt_id
    LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  DELETE FROM myeongha_a4_source_ops.prepared_attempt_proofs_v1 p
  USING due
  WHERE p.execution_attempt_id = due.execution_attempt_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$purge$;
DO $verify$
BEGIN
  IF position('INTERVAL ''29 days''' in (
    SELECT prosrc FROM pg_proc
     WHERE oid = 'myeongha_a4_source_ops.cmd_purge_expired_proofs_v1(integer)'::regprocedure
  )) = 0 THEN
    RAISE EXCEPTION 'A4 early retention cutoff was not applied';
  END IF;
  IF NOT has_function_privilege('myeongha_a4_prepared_proof_maintenance_v1',
    'myeongha_a4_source_ops.cmd_purge_expired_proofs_v1(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A4 maintenance role lost purge execution grant';
  END IF;
END $verify$;
COMMIT;
