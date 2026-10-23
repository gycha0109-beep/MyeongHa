-- R2-H 1540 disposable PG17: synthetic shape/uniqueness constraints only.
-- Every write is inside the outer ROLLBACK, no Production data.
-- Watchtower-Track: ops
DO $saju_r2_h_1540$
DECLARE
  digest text:=repeat('a',64);
  violation_seen boolean;
BEGIN
  INSERT INTO public.saju_source_proof_nonce_claims(replay_key_digest,retained_until)
  VALUES(digest, clock_timestamp()+interval '60 seconds');
  IF (SELECT count(*) FROM public.saju_source_proof_nonce_claims WHERE replay_key_digest=digest) <> 1 THEN
    RAISE EXCEPTION 'HOLD_R2_H_1540_SYNTHETIC_INSERT_FAILED';
  END IF;

  violation_seen:=false;
  BEGIN
    INSERT INTO public.saju_source_proof_nonce_claims(replay_key_digest,retained_until)
    VALUES('raw-nonce-not-digest',clock_timestamp()+interval '60 seconds');
  EXCEPTION WHEN check_violation THEN violation_seen:=true;
  END;
  IF NOT violation_seen THEN RAISE EXCEPTION 'HOLD_R2_H_1540_RAW_NONCE_ACCEPTED'; END IF;

  violation_seen:=false;
  BEGIN
    INSERT INTO public.saju_source_proof_nonce_claims(replay_key_digest,retained_until)
    VALUES(repeat('b',64),clock_timestamp()-interval '60 seconds');
  EXCEPTION WHEN check_violation THEN violation_seen:=true;
  END;
  IF NOT violation_seen THEN RAISE EXCEPTION 'HOLD_R2_H_1540_EXPIRED_ON_INSERT_ACCEPTED'; END IF;

  violation_seen:=false;
  BEGIN
    INSERT INTO public.saju_source_proof_nonce_claims(replay_key_digest,retained_until)
    VALUES(digest,clock_timestamp()+interval '60 seconds');
  EXCEPTION WHEN unique_violation THEN violation_seen:=true;
  END;
  IF NOT violation_seen THEN RAISE EXCEPTION 'HOLD_R2_H_1540_REPLAY_ACCEPTED'; END IF;
END
$saju_r2_h_1540$;
