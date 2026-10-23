#!/usr/bin/env bash
set -euo pipefail
# Nondeployable G1/R2-H 1740 proof; CI-owned disposable PostgreSQL 17 only.
# Watchtower-Track: ops
hold() { echo "HOLD_R2_H_1740_$1" >&2; exit 1; }
[[ "$GITHUB_ACTIONS" == true && "$DB_SUITE" == postgres17 ]] || hold NOT_CI
[[ "$PGHOST" == localhost && "$PGPORT" == 5432 && "$PGUSER" == postgres ]] || hold NOT_LOCAL
[[ "$PGDATABASE" =~ ^myeongha_ci_case_[0-9]+$ ]] || hold NOT_DISPOSABLE
[[ "$(psql -X -Atqc 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || hold WRONG_PG
[[ "$(git hash-object supabase/migrations/1640_seyeon_zero_personal_source_pre_model_pin_v1.sql)" == 51862c2b4adcfcf65d76ab08459b1c26a12e0fba ]] || hold ORIGINAL_1640_DRIFT

psql -X -q -1 -v ON_ERROR_STOP=1 -f supabase/migrations/1640_seyeon_zero_personal_source_pre_model_pin_v1.sql > /dev/null || hold ORIGINAL_APPLY
diag() {
 psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
begin;
\i test/db/seyeon_r2_h_1640_synthetic.sql
rollback;
SQL
}
before="$(diag)" || hold ORIGINAL_DIAGNOSTIC
printf '%s\n' "$before" | node -e "
const fs=require('fs');
const rows=fs.readFileSync(0,'utf8').split('\n').filter(x=>x.trim().startsWith('{'));
if(rows.length!==1)process.exit(1);
const p=JSON.parse(rows[0]);
if(p.malformedMissingRecordsCommitAccepted!==true ||
   p.validZeroCommitAccepted!==true ||
   p.provenanceMismatchBlocked!==true ||
   p.unPinnedCommitBlocked!==true)process.exit(1);
" || hold ORIGINAL_GAP_NOT_REPRODUCED
echo PASS_R2_H_1740_ORIGINAL_SQL_NULL_GAP_REPRODUCED

# Only intended function definition may change; role/ACL/RLS/trigger remain intact.
catalog() {
 psql -X -Atqc "select
  (select row(p.proowner,p.proacl,p.prosecdef,p.provolatile,p.proconfig)::text
   from pg_proc p where p.oid='public.tr_seyeon_zero_source_pin_immutable_v1()'::regprocedure)
  || '|' ||
  (select row(t.tgfoid,t.tgenabled,t.tgtype,t.tgqual)::text
   from pg_trigger t where t.tgrelid='public.chat_turn_attempts'::regclass
    and t.tgname='tr_seyeon_zero_source_pin_immutable_v1')
  || '|' ||
  (select row(c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity)::text
   from pg_class c where c.oid='public.chat_turn_attempts'::regclass)"
}
old_catalog="$(catalog)" || hold BEFORE_CATALOG
old_def="$(psql -X -Atqc "select md5(pg_get_functiondef('public.tr_seyeon_zero_source_pin_immutable_v1()'::regprocedure))")"
[[ -n "$old_catalog" && -n "$old_def" ]] || hold BASELINE
psql -X -q -v ON_ERROR_STOP=1 -f test/db/fixtures/1740_seyeon_zero_source_pin_trigger_null_safe_v1.proposed.sql >/dev/null || hold PROPOSAL_APPLY
[[ "$(catalog)" == "$old_catalog" ]] || hold OWNER_ACL_RLS_TRIGGER_CHANGED
[[ "$(psql -X -Atqc "select md5(pg_get_functiondef('public.tr_seyeon_zero_source_pin_immutable_v1()'::regprocedure))")" != "$old_def" ]] || hold FUNCTION_NOT_REPLACED
echo PASS_R2_H_1740_FUNCTION_OWNER_ACL_TRIGGER_PRESERVED

after="$(diag)" || hold HARDENED_DIAGNOSTIC
printf '%s\n' "$after" | node -e "
const fs=require('fs');
const rows=fs.readFileSync(0,'utf8').split('\n').filter(x=>x.trim().startsWith('{'));
if(rows.length!==1)process.exit(1);
const p=JSON.parse(rows[0]);
const truth=['runningPinAccepted','unPinnedCommitBlocked','nonRunningPinBlocked',
 'provenanceMismatchBlocked','validZeroCommitAccepted'];
if(truth.some(k=>p[k]!==true) ||
   p.malformedMissingRecordsCommitAccepted!==false ||
   p.productionWrites!==0)process.exit(1);
" || hold HARDENED_EVIDENCE
echo PASS_R2_H_1740_MISSING_RECORDS_DENIED_VALID_ZERO_PRESERVED

psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
begin;
create temp table _g1_extra(id int primary key, state text, planner_version text,
 seyeon_personal_source_pin_jsonb jsonb, seyeon_personal_source_pinned_at timestamptz,
 validation_result_jsonb jsonb) on commit drop;
create trigger _guard before update on _g1_extra for each row
 execute function public.tr_seyeon_zero_source_pin_immutable_v1();
do $negative$
declare payload jsonb; blocked boolean; i int:=0;
begin
 foreach payload in array array[
 '{"zeroProof":{"records":null}}'::jsonb,
 '{"zeroProof":{"records":[1]}}'::jsonb,
 '{"zeroProof":{}}'::jsonb,
 '{"exactModelSourceSelection":{}}'::jsonb
 ] loop
  i:=i+1;
  insert into _g1_extra values(i,'validated','seyeon-production-chat-planner-v1',
   payload,clock_timestamp(),jsonb_build_object('personalRecordProvenance',payload->'zeroProof'));
  blocked:=false;
  begin
   update _g1_extra set state='committed' where id=i;
  exception when check_violation then blocked:=true;
  end;
  if not blocked then raise exception 'HOLD_R2_H_1740_BAD_PROOF_ACCEPTED_CASE_%',i; end if;
 end loop;
end
$negative$;
rollback;
SQL
echo PASS_R2_H_1740_JSON_NULL_NONEMPTY_MISSING_ZERO_PROOF_DENIED

# Running the forward-only proposal twice must fail without erasing its first repair.
if psql -X -q -v ON_ERROR_STOP=1 -f test/db/fixtures/1740_seyeon_zero_source_pin_trigger_null_safe_v1.proposed.sql >/dev/null 2>&1; then
 hold REPLAY_ALLOWED
fi
[[ "$(catalog)" == "$old_catalog" ]] || hold REPLAY_CATALOG_DRIFT
echo PASS_R2_H_1740_REPLAY_FAIL_CLOSED
echo "HOLD_R2_H_1740_OWNER_APPROVAL_REQUIRED sourceLineageReconciled=false g1PositiveAdmissionAllowed=false productionWrites=0 drReady=false"
