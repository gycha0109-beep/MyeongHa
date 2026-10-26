#!/usr/bin/env bash
set -euo pipefail
# #1887: SINGLE reviewed Production ACL reduction, not a generic migration push.
# Watchtower-Track: db-authority-core
hold() { echo "HOLD_SEYEON_HELPER_ACL_ONCE: $1" >&2; exit 1; }
readonly repo='gycha0109-beep/MyeongHa'
readonly project='cnsfpcdiyofqvhpcegfc'
readonly version='20261026025332'
readonly migration='supabase/migrations/20261026025332_seyeon_chat_helper_service_role_least_privilege.sql'
readonly expected_blob='462cf970f362550fbcfc4f6168ee6b1e0b5cf078'
readonly marker='.github/ops/seyeon-helper-acl-prod-20261026.once'
readonly expected_subject='ops(db): one-shot Se-yeon helper ACL 40232489516 40266252936'
readonly backup_run='40232489516'
readonly restore_run='40266252936'
readonly restore_artifact='12626875235'

[[ "$GITHUB_REPOSITORY" == "$repo" && "$GITHUB_EVENT_NAME" == push &&
   "$GITHUB_REF" == refs/heads/main && "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ &&
   "$(git rev-parse HEAD)" == "$GITHUB_SHA" &&
   "$(git show -s --format=%s HEAD)" == "$expected_subject" ]] || hold SCOPE_OR_COMMIT
[[ "$(cat "$marker")" == 'SEYEON-HELPER-ACL-PROD-20261026-40232489516-40266252936-V1' ]] || hold MARKER
[[ -z "$(git status --porcelain)" ]] || hold WORKTREE_DRIFT
[[ "$(git hash-object "$migration")" == "$expected_blob" ]] || hold SQL_BLOB_DRIFT
[[ "$GITHUB_SHA" != "$(git rev-parse HEAD^)" ]] || hold NOT_NEW_COMMIT

# The squash merge must touch ONLY these reviewed paths. No unrelated SQL.
actual="$(git diff --name-only HEAD^ HEAD)"
expected="$(printf '%s\n'   '.github/ops/seyeon-helper-acl-prod-20261026.once'   '.github/workflows/production-seyeon-helper-acl-one-shot.yml'   '.github/workflows/supabase-production.yml'   'docs/ci/workflow-responsibility-map.json'   'scripts/ci/db-pr-router.mjs'   'scripts/ci/db-suites.json'   'scripts/operations/apply-seyeon-helper-acl-prod-once.sh'   'supabase/migrations/20261026025332_seyeon_chat_helper_service_role_least_privilege.sql'   'test/db/run_ci_case.sh'   'test/db/seyeon_r2_helper_service_role_least_privilege.sh')"
[[ "$actual" == "$expected" ]] || hold CHANGED_PATHS
now="$(date -u +%s)"
point="$(date -u -d '2026-10-26T00:00:00Z' +%s)"
(( now >= point && now - point <= 86400 )) || hold EXPIRED
[[ "$SUPABASE_PROJECT_ID" == "$project" && -n "$SUPABASE_DB_PASSWORD" &&
   "$SUPABASE_PRODUCTION_SESSION_POOLER_HOST" =~ ^[a-z0-9-]+([.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$ &&
   -n "$GH_TOKEN" ]] || hold ENVIRONMENT

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
api="https://api.github.com/repos/$repo"
get_json() {
  curl -fsSL --retry 2 --max-time 40     -H "Authorization: Bearer $GH_TOKEN"     -H 'Accept: application/vnd.github+json' "$api/$1" -o "$2"
}
get_json "actions/runs/$backup_run" "$work/backup-run.json"
jq -e '.conclusion=="success" and .path==".github/workflows/production-postgres-backup.yml" and .head_branch=="main" and .head_sha=="02cfa8144fd103b38670f5966963696903f04e10"' "$work/backup-run.json" >/dev/null || hold BACKUP_RUN
get_json "actions/runs/$restore_run" "$work/restore-run.json"
jq -e '.conclusion=="success" and .path==".github/workflows/postgres-isolated-restore-drill.yml" and .event=="push" and .head_sha=="7d7f0d424009960d696d049a9bf08e2b11263601"' "$work/restore-run.json" >/dev/null || hold RESTORE_RUN
get_json "actions/runs/$restore_run/artifacts?per_page=100" "$work/restore-artifacts.json"
jq -e --argjson id "$restore_artifact"   '[.artifacts[]|select(.id==$id and (.expired==false) and (.name=="postgres-isolated-restore-drill-40266252936"))]|length==1'   "$work/restore-artifacts.json" >/dev/null || hold RESTORE_ARTIFACT

curl -fsSL --retry 2 --max-time 60   -H "Authorization: Bearer $GH_TOKEN" -H 'Accept: application/vnd.github+json'   "$api/actions/artifacts/$restore_artifact/zip" -o "$work/restore.zip"
entry="$(unzip -Z -1 "$work/restore.zip" | grep -E '(^|/)restore-evidence[.]json$')"
[[ -n "$entry" && "$(printf '%s\n' "$entry"|wc -l)" -eq 1 ]] || hold RESTORE_ENVELOPE_MISSING
unzip -p "$work/restore.zip" "$entry" > "$work/restore.json"
jq -e --arg b "$backup_run" '
  .evidence_envelope_version=="myeongha-postgres-isolated-restore-evidence-envelope-v1" and
  .backup_workflow_run_id==$b and
  .source_sha=="02cfa8144fd103b38670f5966963696903f04e10" and
  (.backup_migration_frontier|tostring)=="20261025203519" and
  .restore_target=="github-actions-loopback-supabase-postgres" and
  .seyeon_early_history_restore_proof=="restored_scoped_version_name_snapshot_6_pass" and
  .seyeon_early_functions_restore_proof=="restored_public_function_catalog_11_and_rls_6_pass" and
  .dr_ready==false
' "$work/restore.json" >/dev/null || hold SAME_BACKUP_RESTORE_EVIDENCE

export PGHOST="$SUPABASE_PRODUCTION_SESSION_POOLER_HOST" PGPORT=5432 PGDATABASE=postgres
export PGUSER="postgres.$project" PGPASSWORD="$SUPABASE_DB_PASSWORD" PGSSLMODE=require
preflight="$(PGOPTIONS='-c default_transaction_read_only=on' psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
select case when
  current_user='postgres'
  and (select max(version)='20261025203519' from supabase_migrations.schema_migrations)
  and not exists(select 1 from supabase_migrations.schema_migrations where version='20261026025332')
  and exists(select 1 from supabase_migrations.schema_migrations
    where version='20261008090417'
      and name='seyeon_runtime_1460_1510_acl_before_owner_recovery'
      and cardinality(statements)=1
      and octet_length(convert_to(statements[1],'UTF8'))=104021
      and encode(sha256(convert_to(statements[1],'UTF8')),'hex')=
        '4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894')
  and has_function_privilege('service_role','public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)','EXECUTE')
  and not has_function_privilege('myeongha_api_executor','public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)','EXECUTE')
  and (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname<>'assert_seyeon_chat_thread_runtime_v1'
         and p.prosrc like '%assert_seyeon_chat_thread_runtime_v1%' and p.prosecdef)=10
  and (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname<>'assert_seyeon_chat_thread_runtime_v1'
         and p.prosrc like '%assert_seyeon_chat_thread_runtime_v1%' and not p.prosecdef)=0
then 'EXACT_SCOPE_OK' else 'HOLD' end;
SQL
)"
[[ "$preflight" == EXACT_SCOPE_OK ]] || hold LIVE_PREFLIGHT

# This is the single reviewed forward migration; it has its own transaction
# and checks pre/post function owner, SECURITY mode and effective rights.
psql -X -v ON_ERROR_STOP=1 -f "$migration" >/dev/null || hold SQL_REVOKE
db_password_urlencoded="$(python3 -c 'import os,urllib.parse;print(urllib.parse.quote(os.environ["SUPABASE_DB_PASSWORD"],safe=""))')"
db_url="postgresql://postgres.$project:$db_password_urlencoded@$PGHOST:5432/postgres?sslmode=require"
echo "::add-mask::$db_url"
supabase migration repair "$version" --status applied --db-url "$db_url" >/dev/null || hold LEDGER_REGISTER
unset db_password_urlencoded db_url
postflight="$(PGOPTIONS='-c default_transaction_read_only=on' psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
select case when
  (select count(*) from supabase_migrations.schema_migrations where version='20261026025332')=1
  and not has_function_privilege('service_role','public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)','EXECUTE')
  and not has_function_privilege('myeongha_api_executor','public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)','EXECUTE')
  and has_function_privilege('myeongha_seyeon_chat_runtime_owner','public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)','EXECUTE')
then 'SCOPED_ACL_AND_MIGRATION_REGISTERED' else 'HOLD' end;
SQL
)"
[[ "$postflight" == SCOPED_ACL_AND_MIGRATION_REGISTERED ]] || hold POSTCONDITION
echo "PASS_PROD_HELPER_ACL_ONE_SHOT backup=$backup_run restore=$restore_run migration=$version"
echo 'DR_READY=false; privacy_canary=not_executed; remote_only_history=untouched'
