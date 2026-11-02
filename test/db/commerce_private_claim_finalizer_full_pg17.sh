#!/usr/bin/env bash
set -euo pipefail

# Fully migrated disposable PostgreSQL 17 test DB only. NEVER production.
db="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'select current_database()')"
if [[ ! "$db" =~ ^myeongha_[a-z0-9_]+$ ||
      "$db" == *template* ||
      "$db" == *production* ||
      "$db" == *prod ]]; then
  echo 'DENY: only disposable myeongha_* PostgreSQL DBs may run this proof' >&2
  exit 1
fi
pg_version="$(psql -X -v ON_ERROR_STOP=1 -Atqc 'show server_version_num')"
if [[ ! "$pg_version" =~ ^17[0-9]{4}$ ]]; then
  printf 'DENY: this proof requires a real PostgreSQL 17 instance; got %s\\n' "$pg_version" >&2
  exit 1
fi

# Both approved Commerce migrations (2310 and 2320) must already have
# been installed by run_ci_case.sh in this disposable database. Do not
# replay obsolete staged candidates: doing so would overwrite the latest
# S4 account deletion privacy fence and duplicate a live schema table.
psql -X -v ON_ERROR_STOP=1 -At <<'SQL'
do $commerce_authority$
begin
  if to_regclass('public.digital_reading_withdrawal_claims_private_v1') is null
    or to_regclass('public.commerce_reader_full_refund_dispatches_v1') is null
    or to_regprocedure('public.cmd_receive_digital_reading_withdrawal_claim_v1(uuid,uuid,uuid,text,text,text)') is null
    or to_regprocedure('public.qry_received_digital_reading_withdrawal_claim_v1(uuid,uuid)') is null
    or to_regprocedure('public.internal_reserve_reader_full_refund_dispatch_v1(uuid)') is null
    or to_regprocedure('public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)') is null
    or not exists (
      select 1 from pg_class where oid='public.digital_reading_withdrawal_claims_private_v1'::regclass
        and relrowsecurity
    )
    or not exists (
      select 1 from pg_class where oid='public.commerce_reader_full_refund_dispatches_v1'::regclass
        and relrowsecurity
    )
    or has_table_privilege('myeongha_api_executor',
      'public.commerce_reader_full_refund_dispatches_v1','SELECT')
    or has_table_privilege('myeongha_api_executor',
      'public.digital_reading_withdrawal_claims_private_v1','SELECT')
    or has_function_privilege('anon',
      'public.cmd_receive_digital_reading_withdrawal_claim_v1(uuid,uuid,uuid,text,text,text)','EXECUTE')
    or not has_function_privilege('myeongha_api_executor',
      'public.cmd_receive_digital_reading_withdrawal_claim_v1(uuid,uuid,uuid,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated',
      'public.qry_received_digital_reading_withdrawal_claim_v1(uuid,uuid)','EXECUTE')
    or has_function_privilege('myeongha_api_executor',
      'public.internal_reserve_reader_full_refund_dispatch_v1(uuid)','EXECUTE')
  then
    raise exception 'NEW_COMMERCE_CLAIM_REFUND_ACL_OR_SCHEMA_MISMATCH';
  end if;
end;
$commerce_authority$;
SQL

COMMERCE_PRIVATE_CLAIM_FINALIZER_PG17_PROOF=1 \
 bash test/db/account_deletion_db_finalizer.sh

echo 'PASS COMMERCE_PRIVATE_CLAIM_FULL_FINALIZER_REAL_PG17: exact Subject DELETE + full finalizer rollback, replay, other Subject and Commerce P5Y retained'
