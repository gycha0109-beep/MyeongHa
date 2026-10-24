#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "${SUPABASE_PROJECT_ID:-}" == cnsfpcdiyofqvhpcegfc ]]
[[ "${PGUSER:-}" == postgres.cnsfpcdiyofqvhpcegfc && "${PGDATABASE:-}" == postgres && "${PGPORT:-}" == 5432 ]]
[[ "${PGHOST:-}" =~ ^[a-z0-9.-]+\.pooler\.supabase\.com$ ]]
[[ "${PGSSLMODE:-}" == verify-full && -s "${PGSSLROOTCERT:-}" ]]
evidence_dir="$(mktemp -d "${RUNNER_TEMP:?}/saju-admission-history.XXXXXX")"
trap 'rm -f "$evidence_dir/expected" "$evidence_dir/query" "$evidence_dir/actual"; rmdir "$evidence_dir"' EXIT
python3 - "$evidence_dir" <<'PY'
import hashlib,json,pathlib,re,sys
output=pathlib.Path(sys.argv[1])
p=json.loads(pathlib.Path('config/operations/saju-abuse-admission-production-migrations-v1.json').read_text())
assert p['projectId']=='cnsfpcdiyofqvhpcegfc' and p['productionMutationAuthorized'] is True
assert p['schemaVersion']=='myeongha-saju-admission-production-migrations-v1'
assert len(p['migrations'])==4
expected=[]; versions=[]
for m in p['migrations']:
    assert re.fullmatch(r'20261024\d{6}',m['version']) and re.fullmatch(r'saju_abuse_admission_[a-z0-9_]+',m['name'])
    assert m['path']==f"supabase/migrations/{m['version']}_{m['name']}.sql"
    assert re.fullmatch(r'[a-f0-9]{64}',m['sqlSha256'])
    assert hashlib.sha256(pathlib.Path(m['path']).read_bytes().replace(b'\r\n',b'\n')).hexdigest()==m['sqlSha256']
    expected.append(m['version']+'|'+m['sqlSha256']); versions.append("'"+m['version']+"'")
(output/'expected').write_text('\n'.join(sorted(expected))+'\n')
(output/'query').write_text("BEGIN READ ONLY; SET LOCAL statement_timeout='30s'; SELECT version,encode(sha256(convert_to(array_to_string(statements,E'\\n'),'UTF8')),'hex') FROM supabase_migrations.schema_migrations WHERE version IN ("+','.join(versions)+") ORDER BY version; COMMIT;\n")
PY
psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -f "$evidence_dir/query" > "$evidence_dir/actual"
diff -u "$evidence_dir/expected" "$evidence_dir/actual"
state="$(psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SELECT CASE WHEN
  (SELECT count(*) FROM pg_class WHERE oid IN ('public.saju_abuse_admission_policies_v1'::regclass,'public.saju_abuse_admission_buckets_v1'::regclass) AND relrowsecurity AND relforcerowsecurity)=2
  AND has_function_privilege('myeongha_api_executor','public.cmd_admit_saju_request_v1(text,bytea,text,uuid,text)','EXECUTE')
  AND has_function_privilege('myeongha_system_executor','public.cmd_cleanup_saju_abuse_admission_buckets_v1()','EXECUTE')
  AND NOT has_table_privilege('myeongha_api_executor','public.saju_abuse_admission_buckets_v1','SELECT')
  AND NOT has_table_privilege('anon','public.saju_abuse_admission_buckets_v1','SELECT')
  AND NOT has_table_privilege('authenticated','public.saju_abuse_admission_buckets_v1','SELECT')
  AND NOT pg_has_role('myeongha_api_executor','myeongha_saju_admission_owner','MEMBER')
  THEN 'PASS' ELSE 'HOLD_SAJU_ADMISSION_CATALOG_DRIFT' END;
COMMIT;
SQL
)"
[[ "$state" == PASS ]]
echo 'Saju admission: exact four applied SQL digests and restricted runtime/worker authority PASS; no SQL replay or unrelated migration repair.'
