-- #1526: approved Production-capable Saju admission authority, gated by server release switch.
-- User authorized remaining Production policy, DB application and activation in this chat on 2026-10-24. Policy registration is a separate migration.
-- Identity evidence is transient; only canonical HMAC fingerprints enter buckets.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid='public.subjects'::regclass AND relrowsecurity)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid='public.guest_sessions'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Saju admission requires existing Subject/Guest RLS foundations (0790/0870)';
  END IF;
END $$;
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM pg_catalog.pg_roles WHERE rolname = 'myeongha_saju_admission_owner';
  IF NOT FOUND THEN
    CREATE ROLE myeongha_saju_admission_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
    COMMENT ON ROLE myeongha_saju_admission_owner IS 'myeongha:saju-admission-owner:v1';
  ELSIF pg_catalog.shobj_description(r.oid, 'pg_authid') IS DISTINCT FROM 'myeongha:saju-admission-owner:v1'
    OR r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolinherit OR r.rolreplication OR r.rolbypassrls THEN
    RAISE EXCEPTION 'Saju admission owner role conflicts with its managed authority';
  END IF;
END $$;

CREATE TABLE public.saju_abuse_admission_policies_v1 (
  route_id text NOT NULL CHECK (route_id IN ('api.me.saju.calculation', 'api.me.saju.preview-reading')),
  policy_version text NOT NULL CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  window_seconds integer NOT NULL CHECK (window_seconds > 0),
  request_limit integer NOT NULL CHECK (request_limit BETWEEN 1 AND 2147483646),
  blocked_count_saturation integer NOT NULL CHECK (blocked_count_saturation > request_limit),
  retry_after_maximum_seconds integer NOT NULL CHECK (retry_after_maximum_seconds > 0),
  cleanup_retention_seconds integer NOT NULL CHECK (cleanup_retention_seconds >= window_seconds),
  approval_ref text NOT NULL CHECK (length(btrim(approval_ref)) BETWEEN 1 AND 256),
  approved_at timestamptz NOT NULL,
  policy_hash bytea NOT NULL CHECK (octet_length(policy_hash) = 32),
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (route_id, policy_version)
);
CREATE UNIQUE INDEX saju_abuse_admission_one_enabled_policy_v1
  ON public.saju_abuse_admission_policies_v1(route_id) WHERE enabled;

CREATE UNLOGGED TABLE public.saju_abuse_admission_buckets_v1 (
  route_id text NOT NULL,
  policy_version text NOT NULL,
  client_fingerprint bytea NOT NULL CHECK (octet_length(client_fingerprint) = 32),
  window_started_at timestamptz NOT NULL,
  reset_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  updated_at timestamptz NOT NULL,
  CONSTRAINT saju_abuse_admission_buckets_v1_pkey PRIMARY KEY (route_id, policy_version, client_fingerprint),
  FOREIGN KEY (route_id, policy_version) REFERENCES public.saju_abuse_admission_policies_v1(route_id, policy_version),
  CHECK (reset_at > window_started_at)
);
CREATE INDEX saju_abuse_admission_buckets_expiry_v1 ON public.saju_abuse_admission_buckets_v1(reset_at);

CREATE FUNCTION public.guard_saju_abuse_admission_policy_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
    (pg_catalog.to_jsonb(NEW) - 'enabled') IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'enabled') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Saju admission policies are immutable; register a new version';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.policy_hash := pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
      NEW.route_id, NEW.policy_version, NEW.window_seconds, NEW.request_limit,
      NEW.blocked_count_saturation, NEW.retry_after_maximum_seconds,
      NEW.cleanup_retention_seconds, NEW.approval_ref,
      pg_catalog.date_part('epoch', NEW.approved_at)
    )::text, 'UTF8'));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_saju_abuse_admission_policy_v1 BEFORE INSERT OR UPDATE
  ON public.saju_abuse_admission_policies_v1 FOR EACH ROW
  EXECUTE FUNCTION public.guard_saju_abuse_admission_policy_v1();

GRANT myeongha_saju_admission_owner TO current_user;
GRANT USAGE, CREATE ON SCHEMA public TO myeongha_saju_admission_owner;
ALTER TABLE public.saju_abuse_admission_policies_v1 OWNER TO myeongha_saju_admission_owner;
ALTER TABLE public.saju_abuse_admission_buckets_v1 OWNER TO myeongha_saju_admission_owner;
ALTER FUNCTION public.guard_saju_abuse_admission_policy_v1() OWNER TO myeongha_saju_admission_owner;

ALTER TABLE public.saju_abuse_admission_policies_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saju_abuse_admission_policies_v1 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.saju_abuse_admission_buckets_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saju_abuse_admission_buckets_v1 FORCE ROW LEVEL SECURITY;
CREATE POLICY saju_admission_policy_owner_v1 ON public.saju_abuse_admission_policies_v1
  TO myeongha_saju_admission_owner USING (true) WITH CHECK (true);
CREATE POLICY saju_admission_bucket_owner_v1 ON public.saju_abuse_admission_buckets_v1
  TO myeongha_saju_admission_owner USING (true) WITH CHECK (true);

-- Read only credential/lifecycle columns. No new authority over identity writers.
GRANT SELECT (id, kind, status, auth_user_id, merged_into_subject_id)
  ON public.subjects TO myeongha_saju_admission_owner;
GRANT SELECT (subject_id, token_hash, expires_at, consumed_at, claimed_by_subject_id)
  ON public.guest_sessions TO myeongha_saju_admission_owner;
CREATE POLICY subjects_saju_admission_owner_select_v1 ON public.subjects
  FOR SELECT TO myeongha_saju_admission_owner USING (true);
CREATE POLICY guest_sessions_saju_admission_owner_select_v1 ON public.guest_sessions
  FOR SELECT TO myeongha_saju_admission_owner USING (true);

CREATE FUNCTION public.cmd_admit_saju_request_v1(
  p_route_id text, p_client_fingerprint bytea, p_subject_kind text,
  p_auth_user_id uuid, p_guest_token_hash text
) RETURNS TABLE (
  allowed boolean, request_count integer, reset_at timestamptz, evaluated_at timestamptz,
  policy_version text, policy_hash text, window_seconds integer, request_limit integer,
  blocked_count_saturation integer, retry_after_maximum_seconds integer, cleanup_retention_seconds integer
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_policy public.saju_abuse_admission_policies_v1%ROWTYPE;
  v_now timestamptz;
  v_count integer;
  v_reset timestamptz;
BEGIN
  IF p_route_id IS NULL OR p_route_id NOT IN ('api.me.saju.calculation', 'api.me.saju.preview-reading')
    OR p_client_fingerprint IS NULL OR pg_catalog.octet_length(p_client_fingerprint) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid Saju admission route or fingerprint';
  END IF;
  IF p_subject_kind = 'member' AND p_auth_user_id IS NOT NULL AND p_guest_token_hash IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.subjects s WHERE s.auth_user_id = p_auth_user_id
      AND s.kind = 'member' AND s.status IN ('active', 'deletion_pending') AND s.merged_into_subject_id IS NULL) THEN
      RETURN;
    END IF;
  ELSIF p_subject_kind = 'guest' AND p_auth_user_id IS NULL
    AND p_guest_token_hash IS NOT NULL AND length(p_guest_token_hash) BETWEEN 1 AND 512 THEN
    IF NOT EXISTS (SELECT 1 FROM public.guest_sessions g JOIN public.subjects s ON s.id = g.subject_id
      WHERE g.token_hash = p_guest_token_hash AND g.expires_at > pg_catalog.clock_timestamp()
        AND g.consumed_at IS NULL AND g.claimed_by_subject_id IS NULL
        AND s.kind = 'guest' AND s.status = 'active' AND s.merged_into_subject_id IS NULL) THEN
      RETURN;
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid Saju admission identity shape';
  END IF;

  SELECT p.* INTO v_policy FROM public.saju_abuse_admission_policies_v1 p
    WHERE p.route_id = p_route_id AND p.enabled FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'No approved enabled Saju admission policy';
  END IF;
  v_now := pg_catalog.clock_timestamp();
  -- Same bounded opportunistic maintenance pattern as the existing Auth limiter.
  DELETE FROM public.saju_abuse_admission_buckets_v1 b WHERE b.ctid IN (
    SELECT stale.ctid FROM public.saju_abuse_admission_buckets_v1 stale
    JOIN public.saju_abuse_admission_policies_v1 p
      ON p.route_id = stale.route_id AND p.policy_version = stale.policy_version
    WHERE stale.reset_at < v_now - pg_catalog.make_interval(secs => p.cleanup_retention_seconds)
    ORDER BY stale.reset_at LIMIT 8 FOR UPDATE OF stale SKIP LOCKED
  );
  INSERT INTO public.saju_abuse_admission_buckets_v1 AS b
    (route_id, policy_version, client_fingerprint, window_started_at, reset_at, request_count, updated_at)
  VALUES (p_route_id, v_policy.policy_version, p_client_fingerprint, v_now,
    v_now + pg_catalog.make_interval(secs => v_policy.window_seconds), 1, v_now)
  ON CONFLICT ON CONSTRAINT saju_abuse_admission_buckets_v1_pkey DO UPDATE SET
    window_started_at = CASE WHEN b.reset_at <= v_now THEN v_now ELSE b.window_started_at END,
    reset_at = CASE WHEN b.reset_at <= v_now THEN v_now + pg_catalog.make_interval(secs => v_policy.window_seconds) ELSE b.reset_at END,
    request_count = CASE WHEN b.reset_at <= v_now THEN 1
      ELSE least(b.request_count::bigint + 1, v_policy.blocked_count_saturation)::integer END,
    updated_at = v_now
  RETURNING b.request_count, b.reset_at INTO v_count, v_reset;
  RETURN QUERY SELECT v_count <= v_policy.request_limit, v_count, v_reset, pg_catalog.clock_timestamp(),
    v_policy.policy_version, pg_catalog.encode(v_policy.policy_hash, 'hex'),
    v_policy.window_seconds, v_policy.request_limit, v_policy.blocked_count_saturation,
    v_policy.retry_after_maximum_seconds, v_policy.cleanup_retention_seconds;
END $$;
ALTER FUNCTION public.cmd_admit_saju_request_v1(text, bytea, text, uuid, text)
  OWNER TO myeongha_saju_admission_owner;

REVOKE ALL ON TABLE public.saju_abuse_admission_policies_v1, public.saju_abuse_admission_buckets_v1 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_saju_abuse_admission_policy_v1(),
  public.cmd_admit_saju_request_v1(text, bytea, text, uuid, text) FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname IN
    ('anon','authenticated','service_role','myeongha_runtime','myeongha_worker_runtime','myeongha_system_executor','myeongha_api_executor')
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON TABLE public.saju_abuse_admission_policies_v1, public.saju_abuse_admission_buckets_v1 FROM %I', r);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION public.cmd_admit_saju_request_v1(text,bytea,text,uuid,text), public.guard_saju_abuse_admission_policy_v1() FROM %I', r);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.cmd_admit_saju_request_v1(text, bytea, text, uuid, text) TO myeongha_api_executor;


COMMENT ON TABLE public.saju_abuse_admission_policies_v1 IS 'Immutable versioned approval authority. Intentionally empty until a separately approved policy registration.';
COMMENT ON TABLE public.saju_abuse_admission_buckets_v1 IS 'Ephemeral UNLOGGED counters. Only route, policy and canonical HMAC fingerprint; no raw identity or payload.';
-- Existing managed migration principal may enroll approved immutable policy versions.
-- Keep admission ownership and identity-column access out of that principal's memberships.
GRANT SELECT, INSERT ON public.saju_abuse_admission_policies_v1 TO postgres;
GRANT UPDATE (enabled) ON public.saju_abuse_admission_policies_v1 TO postgres;
CREATE POLICY saju_admission_policy_operator_v1 ON public.saju_abuse_admission_policies_v1
  TO postgres USING (true) WITH CHECK (true);

CREATE FUNCTION public.cmd_cleanup_saju_abuse_admission_buckets_v1() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM public.saju_abuse_admission_buckets_v1 b WHERE b.ctid IN (
    SELECT stale.ctid FROM public.saju_abuse_admission_buckets_v1 stale
    JOIN public.saju_abuse_admission_policies_v1 p
      ON p.route_id = stale.route_id AND p.policy_version = stale.policy_version
    WHERE stale.reset_at < pg_catalog.clock_timestamp()
      - pg_catalog.make_interval(secs => p.cleanup_retention_seconds)
    ORDER BY stale.reset_at LIMIT 5000 FOR UPDATE OF stale SKIP LOCKED
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END $$;
ALTER FUNCTION public.cmd_cleanup_saju_abuse_admission_buckets_v1()
  OWNER TO myeongha_saju_admission_owner;
REVOKE ALL ON FUNCTION public.cmd_cleanup_saju_abuse_admission_buckets_v1()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cmd_cleanup_saju_abuse_admission_buckets_v1()
  TO myeongha_api_executor;
REVOKE CREATE ON SCHEMA public FROM myeongha_saju_admission_owner;
REVOKE myeongha_saju_admission_owner FROM current_user;
