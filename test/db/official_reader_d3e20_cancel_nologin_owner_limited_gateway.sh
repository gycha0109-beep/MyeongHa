#!/usr/bin/env bash
set -euo pipefail
# D3e20-PREPARATION: disposable CI PostgreSQL ONLY. Never a migration/deploy.
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
  "${PGDATABASE:-}" == myeongha_cancel_d3e20_role_boundary_ci ]] || {
  echo 'DENY: isolated localhost CI database required' >&2; exit 2;
}
db() { psql -X -qAt -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
die() { echo "FAIL isolated cancel role boundary: $*" >&2; exit 1; }
schema=myeongha_cancel_d3e20_ci
owner=myeongha_cancel_d3e20_owner_ci
verifier=myeongha_cancel_d3e20_verifier_ci
executor=myeongha_cancel_d3e20_executor_ci
tmp="$(mktemp -d)"
cleanup() {
  db -c "DROP SCHEMA IF EXISTS $schema CASCADE" >/dev/null 2>&1 || true
  for role in "$verifier" "$executor" "$owner"; do
    db -c "DROP ROLE IF EXISTS $role" >/dev/null 2>&1 || true
  done
  rm -rf "$tmp"
}
trap cleanup EXIT
[[ "$(db -c "SELECT count(*) FROM pg_roles WHERE rolname IN
 ('$owner','$verifier','$executor')")" == 0 ]] || die 'role collision'
[[ "$(db -c "SELECT count(*) FROM pg_namespace WHERE nspname='$schema'")" == 0 ]] ||
  die 'schema collision'

db <<'SQL' >/dev/null
CREATE ROLE myeongha_cancel_d3e20_owner_ci NOLOGIN NOINHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE myeongha_cancel_d3e20_verifier_ci LOGIN NOINHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE myeongha_cancel_d3e20_executor_ci LOGIN NOINHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE SCHEMA myeongha_cancel_d3e20_ci;
CREATE TABLE myeongha_cancel_d3e20_ci.epoch (
  id integer PRIMARY KEY CHECK(id=1), seq bigint NOT NULL,
  status text NOT NULL CHECK(status IN ('active','halted'))
);
CREATE TABLE myeongha_cancel_d3e20_ci.approvals (
  token text PRIMARY KEY CHECK(token ~ '^proof_[a-z0-9_]{5,32}$'),
  seq bigint NOT NULL, used boolean NOT NULL DEFAULT false
);
CREATE TABLE myeongha_cancel_d3e20_ci.synthetic_review (
  token text PRIMARY KEY, observed_seq bigint NOT NULL
);
INSERT INTO myeongha_cancel_d3e20_ci.epoch VALUES (1,1,'active');
-- Only executor may call. Only verifier may INSERT one-time synthetic proof.
-- The function is SECURITY DEFINER owned by a NOLOGIN SQL owner.
-- A separate trusted signature verifier is still required in real operations.
CREATE FUNCTION myeongha_cancel_d3e20_ci.execute_synthetic_review(
  p_token text,p_seq bigint
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $body$
DECLARE n bigint; state text; consumed text;
BEGIN
  IF session_user <> 'myeongha_cancel_d3e20_executor_ci' THEN
    RAISE EXCEPTION 'dedicated executor login required' USING errcode='42501';
  END IF;
  SELECT seq,status INTO n,state FROM myeongha_cancel_d3e20_ci.epoch
    WHERE id=1 FOR UPDATE;
  IF NOT FOUND OR n IS DISTINCT FROM p_seq OR state <> 'active' THEN
    RAISE EXCEPTION 'epoch outdated or halted' USING errcode='42501';
  END IF;
  UPDATE myeongha_cancel_d3e20_ci.approvals SET used=true
    WHERE token=p_token AND seq=n AND used=false RETURNING token INTO consumed;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no single-use pre-verification' USING errcode='42501';
  END IF;
  INSERT INTO myeongha_cancel_d3e20_ci.synthetic_review VALUES(consumed,n);
  RETURN true;
END
$body$;
ALTER TABLE myeongha_cancel_d3e20_ci.epoch OWNER TO myeongha_cancel_d3e20_owner_ci;
ALTER TABLE myeongha_cancel_d3e20_ci.approvals OWNER TO myeongha_cancel_d3e20_owner_ci;
ALTER TABLE myeongha_cancel_d3e20_ci.synthetic_review
  OWNER TO myeongha_cancel_d3e20_owner_ci;
ALTER FUNCTION myeongha_cancel_d3e20_ci.execute_synthetic_review(text,bigint)
  OWNER TO myeongha_cancel_d3e20_owner_ci;
ALTER SCHEMA myeongha_cancel_d3e20_ci OWNER TO myeongha_cancel_d3e20_owner_ci;
REVOKE ALL ON SCHEMA myeongha_cancel_d3e20_ci FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA myeongha_cancel_d3e20_ci FROM PUBLIC;
REVOKE ALL ON FUNCTION myeongha_cancel_d3e20_ci.execute_synthetic_review(text,bigint)
  FROM PUBLIC;
GRANT USAGE ON SCHEMA myeongha_cancel_d3e20_ci
  TO myeongha_cancel_d3e20_verifier_ci,myeongha_cancel_d3e20_executor_ci;
GRANT INSERT ON myeongha_cancel_d3e20_ci.approvals
  TO myeongha_cancel_d3e20_verifier_ci;
GRANT EXECUTE ON FUNCTION
  myeongha_cancel_d3e20_ci.execute_synthetic_review(text,bigint)
  TO myeongha_cancel_d3e20_executor_ci;
SQL
db <<'SQL' >/dev/null
DO $check$
DECLARE r text;
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles
      WHERE rolname='myeongha_cancel_d3e20_owner_ci' AND rolcanlogin)
    OR (SELECT count(*) FROM pg_roles WHERE rolname IN (
      'myeongha_cancel_d3e20_owner_ci',
      'myeongha_cancel_d3e20_verifier_ci',
      'myeongha_cancel_d3e20_executor_ci'
    ) AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolinherit))<>0
    OR NOT has_function_privilege('myeongha_cancel_d3e20_executor_ci',
        'myeongha_cancel_d3e20_ci.execute_synthetic_review(text,bigint)','EXECUTE')
    OR has_function_privilege('myeongha_cancel_d3e20_verifier_ci',
        'myeongha_cancel_d3e20_ci.execute_synthetic_review(text,bigint)','EXECUTE')
    OR has_function_privilege('anon',
        'myeongha_cancel_d3e20_ci.execute_synthetic_review(text,bigint)','EXECUTE')
    OR has_function_privilege('authenticated',
        'myeongha_cancel_d3e20_ci.execute_synthetic_review(text,bigint)','EXECUTE')
    OR has_function_privilege('service_role',
        'myeongha_cancel_d3e20_ci.execute_synthetic_review(text,bigint)','EXECUTE')
    OR NOT has_table_privilege('myeongha_cancel_d3e20_verifier_ci',
        'myeongha_cancel_d3e20_ci.approvals','INSERT')
    OR has_table_privilege('myeongha_cancel_d3e20_executor_ci',
        'myeongha_cancel_d3e20_ci.approvals','INSERT')
    OR has_table_privilege('myeongha_cancel_d3e20_verifier_ci',
        'myeongha_cancel_d3e20_ci.synthetic_review','INSERT')
    OR has_table_privilege('myeongha_cancel_d3e20_executor_ci',
        'myeongha_cancel_d3e20_ci.synthetic_review','INSERT')
  THEN RAISE EXCEPTION 'NOLOGIN owner or effective permission matrix invalid'; END IF;
  FOR r IN SELECT unnest(ARRAY[
    'myeongha_cancel_d3e20_verifier_ci','myeongha_cancel_d3e20_executor_ci',
    'anon','authenticated','service_role','myeongha_api_executor'
  ]) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r)
      OR pg_has_role((SELECT oid FROM pg_roles WHERE rolname=r),
                     (SELECT oid FROM pg_roles
                      WHERE rolname='myeongha_cancel_d3e20_owner_ci'),'MEMBER')
    THEN RAISE EXCEPTION 'owner impersonation or missing role %',r; END IF;
  END LOOP;
END $check$;
SQL
deny() {
  local identity="$1" statement="$2" label="$3"
  if db >"$tmp/refused.log" 2>&1 <<SQL
SET SESSION AUTHORIZATION "$identity";
$statement
SQL
  then die "$label allowed as $identity"; fi
  grep -Fq '42501' "$tmp/refused.log" || {
    cat "$tmp/refused.log" >&2; die "$label not denied by SQL permission";
  }
}
for actor in "$verifier" anon authenticated service_role myeongha_api_executor; do
  deny "$actor" "SELECT $schema.execute_synthetic_review('proof_allow_00001',1);" \
    'direct protected execution'
done
for actor in "$executor" anon authenticated service_role; do
  deny "$actor" "INSERT INTO $schema.approvals VALUES('proof_forge_00001',1,false);" \
    'forging approval'
done
for actor in "$executor" "$verifier" anon authenticated service_role; do
  deny "$actor" "INSERT INTO $schema.synthetic_review VALUES('proof_forge_00002',1);" \
    'direct synthetic effect'
  deny "$actor" "SET ROLE $owner;" 'owner impersonation'
done
echo 'PASS D3e20 isolated PostgreSQL: non-owner SQL entry/forgery/impersonation denied'

[[ "$(db -c "SET SESSION AUTHORIZATION \"$verifier\";
  INSERT INTO $schema.approvals(token,seq) VALUES('proof_allow_00001',1)")" == '' ]] ||
  die 'verifier cannot submit isolated proof'
[[ "$(db -c "SET SESSION AUTHORIZATION \"$executor\";
  SELECT $schema.execute_synthetic_review('proof_allow_00001',1)")" == t ]] ||
  die 'executor refused valid, fresh single-use synthetic review'
deny "$executor" "SELECT $schema.execute_synthetic_review('proof_allow_00001',1);" \
  'replayed proof'
db -c "SET SESSION AUTHORIZATION \"$verifier\";
  INSERT INTO $schema.approvals(token,seq) VALUES('proof_old_00001',1)" >/dev/null
db -c "UPDATE $schema.epoch SET seq=2 WHERE id=1" >/dev/null
deny "$executor" "SELECT $schema.execute_synthetic_review('proof_old_00001',1);" \
  'outdated proof'
db -c "SET SESSION AUTHORIZATION \"$verifier\";
  INSERT INTO $schema.approvals(token,seq) VALUES('proof_active_00002',2)" >/dev/null
[[ "$(db -c "SET SESSION AUTHORIZATION \"$executor\";
  SELECT $schema.execute_synthetic_review('proof_active_00002',2)")" == t ]] ||
  die 'new current proof unexpectedly denied'
db -c "UPDATE $schema.epoch SET status='halted' WHERE id=1" >/dev/null
db -c "SET SESSION AUTHORIZATION \"$verifier\";
  INSERT INTO $schema.approvals(token,seq) VALUES('proof_halt_00002',2)" >/dev/null
deny "$executor" "SELECT $schema.execute_synthetic_review('proof_halt_00002',2);" \
  'emergency HALT'
[[ "$(db -c "SELECT count(*) FROM $schema.synthetic_review")" == 2 ]] ||
  die 'stale/HALT/replay wrote synthetic effects'
[[ "$(db -c "SELECT count(*) FROM public.entitlement_events")" == 0 ]] ||
  die 'test mutated entitlement data'
echo 'PASS D3e20 isolated PostgreSQL: approved-only, one-use, epoch and HALT, zero financial effects'

# Crucial limitation: DBA/superuser CAN impersonate a NOLOGIN owner.
# This must be controlled OUTSIDE database privileges, not falsely claimed solved.
[[ "$(db -c "SET ROLE $owner; SELECT current_user")" == "$owner" ]] ||
  die 'superuser bypass check inconclusive'
echo 'HOLD: PostgreSQL superuser can become NOLOGIN owner: credential/DBA control required'
