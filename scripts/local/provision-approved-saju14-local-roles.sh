#!/usr/bin/env bash
set -euo pipefail
# Four disposable PostgreSQL 17 roles; no production credentials or grants.
if [[ ! -v MYEONGHA_DISPOSABLE_SAJU14 || "$MYEONGHA_DISPOSABLE_SAJU14" != 'explicit-local-only'
    || ! -v PGHOST || "$PGHOST" != '/var/run/postgresql'
    || ! -f /app/scripts/local/approved-saju14-local-roles.psql ]]; then
  echo 'HOLD_NOT_DISPOSABLE_SAJU14' >&2
  exit 1
fi
for name in SAJU14_LOCAL_MEMBER_PASSWORD SAJU14_LOCAL_COMMERCE_PASSWORD \
            SAJU14_LOCAL_ISSUER_PASSWORD SAJU14_LOCAL_PAIR_READER_PASSWORD; do
  value="$(printenv "$name" || true)"
  length="$(printf '%s' "$value" | wc -c)"
  if (( length < 24 )) || [[ "$value" =~ [[:space:]] ]]; then
    echo "HOLD_MISSING_LOCAL_ROLE_CREDENTIAL: $name" >&2
    exit 1
  fi
done
cd /app
psql -X -U postgres -d myeongha_saju_sandbox_v1 -q \
  -v ON_ERROR_STOP=1 -f scripts/local/approved-saju14-local-roles.psql >/dev/null
result="$(psql -X -U postgres -d myeongha_saju_sandbox_v1 -Atqc "
select case when
  pg_has_role('saju14_local_member_login','myeongha_api_executor','MEMBER')
  and not pg_has_role('saju14_local_member_login','myeongha_commerce_internal_executor','MEMBER')
  and pg_has_role('saju14_local_commerce_login','myeongha_commerce_internal_executor','MEMBER')
  and not pg_has_role('saju14_local_commerce_login','myeongha_api_executor','MEMBER')
  and pg_has_role('saju14_local_issuer_login','myeongha_approved_saju_issuer_executor','MEMBER')
  and not pg_has_role('saju14_local_issuer_login','myeongha_api_executor','MEMBER')
  and pg_has_role('saju14_local_pair_reader_login','myeongha_approved_saju_pair_reader_executor','MEMBER')
  and not pg_has_role('saju14_local_pair_reader_login','myeongha_approved_saju_issuer_executor','MEMBER')
  then 'SAJU14_LOCAL_ROLE_SEPARATION_READY'
  else 'HOLD_SAJU14_LOCAL_ROLE_SEPARATION_FAILED' end;
")"
echo "$result"
[[ "$result" == 'SAJU14_LOCAL_ROLE_SEPARATION_READY' ]]
