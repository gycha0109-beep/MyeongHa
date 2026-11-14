-- Run only on a disposable PostgreSQL 17 database, immediately AFTER
-- ADMIN_A4_PREPARED_PROOF_PRIVATE_STORE_OFFLINE_V1.sql.
-- This test never calls a provider, Production DB, or payment/credit path.
BEGIN;
CREATE TABLE IF NOT EXISTS public.subjects(id uuid PRIMARY KEY, status text NOT NULL);

INSERT INTO public.subjects(id,status) VALUES
  ('123e4567-e89b-42d3-a456-426614174000','active'),
  ('123e4567-e89b-42d3-a456-426614174010','active');

-- The actual private Reader/Writer need the stored_at comparison column
-- even though the application never exposes or returns stored_at.
DO $$
BEGIN
  IF NOT has_column_privilege('myeongha_a4_prepared_proof_reader_v1',
     'myeongha_a4_source_ops.prepared_attempt_proofs_v1','stored_at','SELECT')
    OR NOT has_column_privilege('myeongha_a4_prepared_proof_writer_v1',
     'myeongha_a4_source_ops.prepared_attempt_proofs_v1','stored_at','SELECT')
  THEN RAISE EXCEPTION 'A4 proof 30-day read filter has missing privileges'; END IF;
  IF has_table_privilege('myeongha_a4_prepared_proof_writer_v1',
     'myeongha_a4_source_ops.prepared_attempt_proofs_v1','DELETE')
    OR has_table_privilege('myeongha_a4_prepared_proof_reader_v1',
     'myeongha_a4_source_ops.prepared_attempt_proofs_v1','DELETE')
    OR has_table_privilege('myeongha_a4_prepared_proof_maintenance_v1',
     'myeongha_a4_source_ops.prepared_attempt_proofs_v1','DELETE')
  THEN RAISE EXCEPTION 'A4 proof roles unexpectedly gained direct DELETE'; END IF;
END $$;

SET ROLE myeongha_a4_prepared_proof_writer_v1;
INSERT INTO myeongha_a4_source_ops.prepared_attempt_proofs_v1(execution_attempt_id,proof)
VALUES (
'123e4567-e89b-42d3-a456-426614174002',
jsonb_build_object(
 'payload',jsonb_build_object('version','myeongha-a4-prepared-attempt-proof-v1',
  'issuer','myeongha-production','audience','saju-production-a4',
  'keyId','mh-a4-prepared-v1','issuedAtMs',1794500000000::bigint,
  'expiresAtMs',1794500090000::bigint,
  'executionAttemptId','123e4567-e89b-42d3-a456-426614174002',
  'readingId','123e4567-e89b-42d3-a456-426614174001',
  'subjectId','123e4567-e89b-42d3-a456-426614174000'),
 'signatureHex',repeat('a',64))
);
RESET ROLE;
SET ROLE myeongha_a4_prepared_proof_reader_v1;
DO $$
BEGIN
  IF (SELECT count(*) FROM myeongha_a4_source_ops.prepared_attempt_proofs_v1
      WHERE execution_attempt_id = '123e4567-e89b-42d3-a456-426614174002'
        AND stored_at > clock_timestamp() - INTERVAL '30 days') <> 1
  THEN RAISE EXCEPTION 'A4 private reader cannot read a fresh proof'; END IF;
END $$;
RESET ROLE;

-- Existing account deletion begins by changing the Subject to deletion_pending.
UPDATE public.subjects SET status='deletion_pending'
 WHERE id='123e4567-e89b-42d3-a456-426614174000';
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM myeongha_a4_source_ops.prepared_attempt_proofs_v1
            WHERE execution_attempt_id='123e4567-e89b-42d3-a456-426614174002')
  THEN RAISE EXCEPTION 'A4 revoked proof remains after account deletion'; END IF;
END $$;

-- A deleted/deletion_pending Subject must never reacquire a proof.
SET ROLE myeongha_a4_prepared_proof_writer_v1;
DO $$
BEGIN
  BEGIN
    INSERT INTO myeongha_a4_source_ops.prepared_attempt_proofs_v1(execution_attempt_id,proof)
    VALUES ('123e4567-e89b-42d3-a456-426614174003',
      jsonb_build_object('payload',jsonb_build_object(
        'version','myeongha-a4-prepared-attempt-proof-v1',
        'executionAttemptId','123e4567-e89b-42d3-a456-426614174003',
        'subjectId','123e4567-e89b-42d3-a456-426614174000',
        'issuedAtMs',1794500000000::bigint,'expiresAtMs',1794500090000::bigint),
        'signatureHex',repeat('b',64)));
    RAISE EXCEPTION 'A4 inactive Subject proof was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'A4 proof requires an active Subject' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

-- A proof older than the 29-day safety cutoff is removed in a bounded purge.
-- A proof 28 days 23 hours old remains below the early cleanup threshold.
-- The proof's original timestamp is supplied in the synthetic fixture only.
INSERT INTO myeongha_a4_source_ops.prepared_attempt_proofs_v1(execution_attempt_id,proof,stored_at)
VALUES ('123e4567-e89b-42d3-a456-426614174012',
 jsonb_build_object('payload',jsonb_build_object(
 'version','myeongha-a4-prepared-attempt-proof-v1',
 'issuer','myeongha-production','audience','saju-production-a4',
 'keyId','mh-a4-prepared-v1','readingId','123e4567-e89b-42d3-a456-426614174011',
 'executionAttemptId','123e4567-e89b-42d3-a456-426614174012',
 'subjectId','123e4567-e89b-42d3-a456-426614174010',
 'issuedAtMs',1794500000000::bigint,'expiresAtMs',1794500090000::bigint),
 'signatureHex',repeat('c',64)),clock_timestamp() - INTERVAL '29 days 1 hour'),
('123e4567-e89b-42d3-a456-426614174013',
 jsonb_build_object('payload',jsonb_build_object(
 'version','myeongha-a4-prepared-attempt-proof-v1',
 'issuer','myeongha-production','audience','saju-production-a4',
 'keyId','mh-a4-prepared-v1','readingId','123e4567-e89b-42d3-a456-426614174011',
 'executionAttemptId','123e4567-e89b-42d3-a456-426614174013',
 'subjectId','123e4567-e89b-42d3-a456-426614174010',
 'issuedAtMs',1794500000000::bigint,'expiresAtMs',1794500090000::bigint),
 'signatureHex',repeat('d',64)),clock_timestamp() - INTERVAL '28 days 23 hours');

SET ROLE myeongha_a4_prepared_proof_maintenance_v1;
DO $$
DECLARE v_count integer;
BEGIN
  SELECT myeongha_a4_source_ops.cmd_purge_expired_proofs_v1(100) INTO v_count;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'A4 expiry purge removed % rows, expected 1',v_count;
  END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM myeongha_a4_source_ops.prepared_attempt_proofs_v1)<>1
    OR NOT EXISTS(SELECT 1 FROM myeongha_a4_source_ops.prepared_attempt_proofs_v1
         WHERE execution_attempt_id='123e4567-e89b-42d3-a456-426614174013')
  THEN RAISE EXCEPTION 'A4 expired cleanup removed fresh record or left expired record'; END IF;
END $$;
ROLLBACK;
