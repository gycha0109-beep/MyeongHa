-- R2-H/1640 temp-table trigger execution only; no real chat attempts or personal records.
-- A malformed Pin missing zeroProof.records exercises the independent SQL Commit safety net.
-- Watchtower-Track: ops
CREATE TEMP TABLE _seyeon_g1_pin_synthetic (
 id integer PRIMARY KEY,
 state text NOT NULL,
 planner_version text,
 seyeon_personal_source_pin_jsonb jsonb,
 seyeon_personal_source_pinned_at timestamptz,
 validation_result_jsonb jsonb
) ON COMMIT DROP;
CREATE TRIGGER _g1_zero_pin_guard
 BEFORE UPDATE ON _seyeon_g1_pin_synthetic
 FOR EACH ROW EXECUTE FUNCTION public.tr_seyeon_zero_source_pin_immutable_v1();
DO $g1_temp$
DECLARE blocked boolean;
DECLARE good_pin jsonb:='{"zeroProof":{"records":[]}}'::jsonb;
BEGIN
 INSERT INTO _seyeon_g1_pin_synthetic(id,state,planner_version)
 VALUES(1,'running','seyeon-production-chat-planner-v1');
 UPDATE _seyeon_g1_pin_synthetic
 SET seyeon_personal_source_pin_jsonb=good_pin,
     seyeon_personal_source_pinned_at=clock_timestamp() WHERE id=1;
 IF NOT EXISTS(SELECT 1 FROM _seyeon_g1_pin_synthetic WHERE id=1
   AND seyeon_personal_source_pin_jsonb=good_pin)
 THEN RAISE EXCEPTION 'HOLD_G1_VALID_RUNNING_PIN_FAILED'; END IF;
 blocked:=false;
 BEGIN
  UPDATE _seyeon_g1_pin_synthetic
   SET seyeon_personal_source_pin_jsonb='{"zeroProof":{"records":[1]}}'::jsonb WHERE id=1;
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLD_G1_PIN_MUTATION_ACCEPTED'; END IF;
 INSERT INTO _seyeon_g1_pin_synthetic(id,state,planner_version)
 VALUES(2,'validated','seyeon-production-chat-planner-v1');
 blocked:=false;
 BEGIN
  UPDATE _seyeon_g1_pin_synthetic SET state='committed' WHERE id=2;
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLD_G1_UNPINNED_COMMIT_ACCEPTED'; END IF;
 INSERT INTO _seyeon_g1_pin_synthetic(id,state,planner_version)
 VALUES(3,'planned','seyeon-production-chat-planner-v1');
 blocked:=false;
 BEGIN
  UPDATE _seyeon_g1_pin_synthetic
   SET seyeon_personal_source_pin_jsonb=good_pin,
       seyeon_personal_source_pinned_at=clock_timestamp()
   WHERE id=3;
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLD_G1_PLANNED_PIN_ACCEPTED'; END IF;
 INSERT INTO _seyeon_g1_pin_synthetic
  (id,state,planner_version,seyeon_personal_source_pin_jsonb,seyeon_personal_source_pinned_at,validation_result_jsonb)
 VALUES(4,'validated','seyeon-production-chat-planner-v1',good_pin,clock_timestamp(),
 '{"personalRecordProvenance":{"records":[1]}}'::jsonb);
 blocked:=false;
 BEGIN
  UPDATE _seyeon_g1_pin_synthetic SET state='committed' WHERE id=4;
 EXCEPTION WHEN check_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'HOLD_G1_PROVENANCE_DRIFT_ACCEPTED'; END IF;
 INSERT INTO _seyeon_g1_pin_synthetic
  (id,state,planner_version,seyeon_personal_source_pin_jsonb,seyeon_personal_source_pinned_at,validation_result_jsonb)
 VALUES(5,'validated','seyeon-production-chat-planner-v1',good_pin,clock_timestamp(),
 '{"personalRecordProvenance":{"records":[]}}'::jsonb);
 UPDATE _seyeon_g1_pin_synthetic SET state='committed' WHERE id=5;
 IF NOT EXISTS(SELECT 1 FROM _seyeon_g1_pin_synthetic WHERE id=5 AND state='committed')
 THEN RAISE EXCEPTION 'HOLD_G1_VALID_ZERO_COMMIT_FAILED'; END IF;
 -- Negative-path diagnostic: actual trigger may treat NULL <> [] as SQL UNKNOWN.
 INSERT INTO _seyeon_g1_pin_synthetic
  (id,state,planner_version,seyeon_personal_source_pin_jsonb,seyeon_personal_source_pinned_at,validation_result_jsonb)
 VALUES(6,'validated','seyeon-production-chat-planner-v1','{"zeroProof":{}}'::jsonb,
 clock_timestamp(),'{"personalRecordProvenance":{}}'::jsonb);
 BEGIN
  UPDATE _seyeon_g1_pin_synthetic SET state='committed' WHERE id=6;
 EXCEPTION WHEN check_violation THEN
  -- Leave at validated to record that malformed zeroProof was blocked.
  NULL;
 END;
END
$g1_temp$;
SELECT jsonb_build_object(
 'schemaVersion','seyeon-r2-h-1640-trigger-synthetic-v1',
 'runningPinAccepted',(SELECT seyeon_personal_source_pin_jsonb IS NOT NULL FROM _seyeon_g1_pin_synthetic WHERE id=1),
 'unPinnedCommitBlocked',(SELECT state='validated' FROM _seyeon_g1_pin_synthetic WHERE id=2),
 'nonRunningPinBlocked',(SELECT seyeon_personal_source_pin_jsonb IS NULL FROM _seyeon_g1_pin_synthetic WHERE id=3),
 'provenanceMismatchBlocked',(SELECT state='validated' FROM _seyeon_g1_pin_synthetic WHERE id=4),
 'validZeroCommitAccepted',(SELECT state='committed' FROM _seyeon_g1_pin_synthetic WHERE id=5),
 'malformedMissingRecordsCommitAccepted',(SELECT state='committed' FROM _seyeon_g1_pin_synthetic WHERE id=6),
 'productionWrites',0
)::text;
