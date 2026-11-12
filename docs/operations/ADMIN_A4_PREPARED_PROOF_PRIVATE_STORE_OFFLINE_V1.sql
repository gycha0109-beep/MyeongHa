-- OFFLINE / disposable-only A4 authorized prepared-proof handoff candidate.
-- This DDL MUST NOT run against Production without a dedicated role/retention review.
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

CREATE FUNCTION myeongha_a4_source_ops.deny_prepared_proof_mutation_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'A4 signed prepared proof cannot be changed or deleted';
END;
$$;

CREATE TRIGGER deny_a4_prepared_proof_update_delete_v1
  BEFORE UPDATE OR DELETE ON myeongha_a4_source_ops.prepared_attempt_proofs_v1
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
  SELECT (execution_attempt_id, proof)
  ON myeongha_a4_source_ops.prepared_attempt_proofs_v1
  TO myeongha_a4_prepared_proof_writer_v1;
GRANT SELECT (execution_attempt_id, proof)
  ON myeongha_a4_source_ops.prepared_attempt_proofs_v1
  TO myeongha_a4_prepared_proof_reader_v1;
-- No passwords, UPDATE, DELETE, TRUNCATE, service login, HTTP installation,
-- key, payment, customer data, commerce or cost ledger privileges.
-- Privacy lifecycle/purge policy needs governing approval before Production.
COMMIT;
