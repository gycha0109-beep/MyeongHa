-- Disposable local GoTrue DB only. Never apply to a non-synthetic database.
DO $$
BEGIN
  IF current_database() <> 'myeongha_saju_gotrue_verify' THEN
    RAISE EXCEPTION 'Refusing auth init outside disposable GoTrue database';
  END IF;
END
$$;
CREATE SCHEMA IF NOT EXISTS auth;
ALTER ROLE postgres IN DATABASE myeongha_saju_gotrue_verify SET search_path TO auth, public;
