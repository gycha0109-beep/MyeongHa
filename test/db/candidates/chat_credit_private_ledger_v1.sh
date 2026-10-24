#!/usr/bin/env bash
set -euo pipefail
: "${PGDATABASE:?Disposable PostgreSQL database is required}"
psql -v ON_ERROR_STOP=1 -f test/db/chat_credit_signup_wallet_production_v1_test.sql >/dev/null
# The disposable template now contains the signup-only Production schema.
# Drop it only in this isolated candidate DB before replaying the broader
# paid/Reading/ACK candidate DDL; never drop Production objects or privileges.
psql -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
drop trigger if exists tr_chat_credit_member_signup_v1 on public.subjects;
drop trigger if exists tr_chat_credit_subject_erasure_v1 on public.subjects;
drop function if exists public.internal_tr_chat_credit_member_signup_v1();
drop function if exists public.internal_tr_chat_credit_subject_erasure_v1();
drop function if exists public.internal_cmd_chat_credit_finalize_v1(uuid,uuid,boolean,uuid);
drop function if exists public.internal_cmd_chat_credit_reserve_v1(uuid,uuid,uuid);
drop function if exists public.internal_cmd_chat_signup_credit_v1(uuid);
drop function if exists public.internal_qry_chat_credit_balance_v1(uuid);
drop table if exists public.chat_credit_turn_allocations_v1 cascade;
drop table if exists public.chat_credit_turn_reservations_v1 cascade;
drop table if exists public.chat_credit_lots_v1 cascade;
SQL
psql -v ON_ERROR_STOP=1 -f test/db/candidates/chat_credit_private_ledger_v1.sql >/dev/null
psql -v ON_ERROR_STOP=1 -f test/db/candidates/chat_credit_private_ledger_v1_test.sql >/dev/null
echo 'PASS commerce chat credit private ledger candidate: signup/replay/reserve/settle/release/shortage/ACL'
