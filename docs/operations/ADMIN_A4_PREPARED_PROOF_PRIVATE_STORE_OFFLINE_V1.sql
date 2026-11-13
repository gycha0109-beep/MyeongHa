-- A4 private proof storage with Owner-approved 30-day maximum retention (2026-11-13).
-- Production installation requires exact-head CI and privilege/maintenance readiness.
BEGIN;

DO $preflight$
BEGIN
  IF to_regnamespace('myeongha_a4_source_ops') IS NOT NULL
    OR to_regrole('myeongha_a4_prepared_proof_writer_v1') IS NOT NULL
    OR to_regrole('myeongha_a4_prepared_proof_reader_v1') IS NOT NULL
    OR to_regclass('myeongha_a4_source_ops.prepared_attempt_proofs_v1') IS NOT NULL THEN
    RAISE EXCEPTION 'A4 proof handoff storage already exists; do not reinstall';
  END IF;
END $preflight$;

CREATE SCHEMA myeongha_a4_source_ops;
REVOKE ALL ON SCHEMA myeongha_a4_source_ops FROM PUBLIC;

CREATE ROLE myeongha_a4_prepared_proof_writer_v1
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
  NOBYPASSRLS PASSWORD NULL;
CREATE ROLE myeongha_a4_prepared_proof_reader_v1
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
  NOBYPASSRLS PASSWORD NULL;

CREATE TABLE myeongha_a4_source_ops.prepared_attempt_proofs_v1 (
  execution_attempt_id uuid PRIMARY KEY,
  proof jsonb NOT NULL,
  stored_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT a4_prepared_proof_v1_envelope CHECK (
    jsonb_typeof(proof) = 'object'
    AND proof ?& ARRAY['payload','signatureHex']
    AND proof - ARRAY['payload','signatureHex']::text[] = '{}'::jsonb
    AND jsonb_typeof(proof -> 'payload') = 'object'
    AND proof -> 'payload' ?& ARRAY[
      'version','issuer','audience','keyId','issuedAtMs','expiresAtMs',
      'executionAttemptId','readingId','subjectId'
    ]
    AND (proof -> 'payload') - ARRAY[
      'version','issuer','audience','keyId','issuedAtMs','expiresAtMs',
      'executionAttemptId','readingId','subjectId'
    ]::text[] = '{}'::jsonb
    AND proof #>> '{payload,version}' = 'myeongha-a4-prepared-attempt-proof-v1'
    AND proof #>> '{payload,executionAttemptId}' = execution_attempt_id::text
    AND proof ->> 'signatureHex' ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(proof #> '{payload,issuedAtMs}') = 'number'
    AND jsonb_typeof(proof #> '{payload,expiresAtMs}') = 'number'
    AND length(proof::text) < 4096
  )
);

CREATE INDEX a4_prepared_proof_stored_at_v1 ON myeongha_a4_source_ops.prepared_attempt_proofs_v1(stored_at, execution_attempt_id);

CREATE FUNCTION myeongha_a4_source_ops.deny_prepared_proof_mutation_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'A4 signed prepared proof cannot be changed';
END;
$$;

CREATE TRIGGER deny_a4_prepared_proof_update_v1
  BEFORE UPDATE ON myeongha_a4_source_ops.prepared_attempt_proofs_v1
  FOR EACH ROW EXECUTE FUNCTION myeongha_a4_source_ops.deny_prepared_proof_mutation_v1();

ALTER TABLE myeongha_a4_source_ops.prepared_attempt_proofs_v1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY prepared_proof_writer_insert_v1
  ON myeongha_a4_source_ops.prepared_attempt_proofs_v1
  FOR INSERT TO myeongha_a4_prepared_proof_writer_v1 WITH CHECK (true);
CREATE POLICY prepared_proof_writer_select_v1
  ON myeongha_a4_source_ops.prepared_attempt_proofs_v1
  FOR SELECT TO myeongha_a4_prepared_proof_writer_v1 USING (true);
CREATE POLICY prepared_proof_reader_select_v1
  ON myeongha_a4_source_ops.prepared_attempt_proofs_v1
  FOR SELECT TO myeongha_a4_prepared_proof_reader_v1 USING (true);

GRANT USAGE ON SCHEMA myeongha_a4_source_ops
  TO myeongha_a4_prepared_proof_writer_v1, myeongha_a4_prepared_proof_reader_v1;
REVOKE ALL ON myeongha_a4_source_ops.prepared_attempt_proofs_v1 FROM PUBLIC;
GRANT INSERT (execution_attempt_id, proof),
  SELECT (execution_attempt_id, proof, stored_at)
  ON myeongha_a4_source_ops.prepared_attempt_proofs_v1
  TO myeongha_a4_prepared_proof_writer_v1;
GRANT SELECT (execution_attempt_id, proof, stored_at)
  ON myeongha_a4_source_ops.prepared_attempt_proofs_v1
  TO myeongha_a4_prepared_proof_reader_v1;

-- A newly stored proof is forbidden once account deletion has begun.
-- The row lock serializes proof storage with the canonical Subject revocation.
CREATE FUNCTION myeongha_a4_source_ops.require_active_subject_for_proof_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $guard$
BEGIN
  PERFORM 1 FROM public.subjects s
    WHERE s.id = (NEW.proof #>> '{payload,subjectId}')::uuid
      AND s.status = 'active'
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A4 proof requires an active Subject';
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION myeongha_a4_source_ops.require_active_subject_for_proof_v1() FROM PUBLIC;
CREATE TRIGGER a4_proof_active_subject_guard_v1
  BEFORE INSERT ON myeongha_a4_source_ops.prepared_attempt_proofs_v1
  FOR EACH ROW EXECUTE FUNCTION myeongha_a4_source_ops.require_active_subject_for_proof_v1();

-- Canonical account deletion changes Subject status to deletion_pending.
-- Delete signed proofs in that same transaction, before the deletion is acknowledged.
CREATE FUNCTION myeongha_a4_source_ops.revoke_proofs_on_subject_deletion_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $revocation$
BEGIN
  DELETE FROM myeongha_a4_source_ops.prepared_attempt_proofs_v1 p
   WHERE p.proof #>> '{payload,subjectId}' = NEW.id::text;
  RETURN NEW;
END;
$revocation$;
REVOKE ALL ON FUNCTION myeongha_a4_source_ops.revoke_proofs_on_subject_deletion_v1() FROM PUBLIC;
CREATE TRIGGER a4_proof_subject_deletion_revocation_v1
  AFTER UPDATE OF status ON public.subjects
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('deletion_pending','deleted'))
  EXECUTE FUNCTION myeongha_a4_source_ops.revoke_proofs_on_subject_deletion_v1();

-- The only runtime retention capability is bounded EXECUTE; no direct DELETE.
-- Purge one day ahead of the 30x24-hour hard upper bound to leave operational buffer
-- for the one-minute scheduler; outages/backlogs still require monitoring.
CREATE ROLE myeongha_a4_prepared_proof_maintenance_v1
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
  NOBYPASSRLS PASSWORD NULL;
GRANT USAGE ON SCHEMA myeongha_a4_source_ops
  TO myeongha_a4_prepared_proof_maintenance_v1;

CREATE FUNCTION myeongha_a4_source_ops.cmd_purge_expired_proofs_v1(p_limit integer)
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
REVOKE ALL ON FUNCTION myeongha_a4_source_ops.cmd_purge_expired_proofs_v1(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION myeongha_a4_source_ops.cmd_purge_expired_proofs_v1(integer)
  TO myeongha_a4_prepared_proof_maintenance_v1;

-- Provider proof, customer tables, and the cost ledger remain untouched by a purge.
-- Do not enable operations until a production purge schedule and private TLS are verified.
COMMIT;
