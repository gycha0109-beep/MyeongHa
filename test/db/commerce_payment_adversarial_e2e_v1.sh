#!/usr/bin/env bash
set -euo pipefail
# Security boundary: synthetic identity/payment fixtures may ONLY be inserted
# into the throwaway GitHub PostgreSQL CI case database, never into Production.
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true && "${PGHOST:-}" == localhost && "${PGPORT:-}" == 5432 && "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
  echo HOLD_PAYMENT_ATTACK_E2E_REQUIRES_DISPOSABLE_CI_DATABASE >&2
  exit 1
}
psql_base=(psql -X -q -v ON_ERROR_STOP=1)
alice='cda20000-0000-4000-8000-000000000001'
bob='cda20000-0000-4000-8000-000000000002'
carol='cda20000-0000-4000-8000-000000000003'

expect_denied() {
  local label="$1" expected="$2" sql="$3" output rc
  set +e
  output=$("${psql_base[@]}" -Atqc "$sql" 2>&1)
  rc=$?
  set -e
  [[ $rc -ne 0 && "$output" == *"$expected"* ]] || {
    echo "FAIL_PAYMENT_ATTACK_${label} unexpected SQL result rc=$rc" >&2
    echo "$output" >&2
    exit 1
  }
  echo "PASS_PAYMENT_ATTACK_${label}"
}

expect_balance() {
  local label="$1" subject="$2" expected="$3" output
  output=$("${psql_base[@]}" -Atqc "begin; set local role myeongha_api_executor; set local myeongha.subject_id='${subject}'; select available_credits||'|'||total_credits from public.internal_qry_chat_credit_balance_v1('${subject}'); rollback;")
  [[ "$output" == "$expected" ]] || {
    echo "FAIL_PAYMENT_ATTACK_${label} expected=$expected actual=$output" >&2
    exit 1
  }
  echo "PASS_PAYMENT_ATTACK_${label}"
}

"${psql_base[@]}" -f test/db/commerce_payment_adversarial_e2e_v1.sql
expect_balance "MEMBER_A_BALANCE" "$alice" '50|50'
expect_balance "GUEST_PROMOTION_EXPIRED" "$carol" '0|50'
expect_denied "CROSS_TENANT_BALANCE" 'subject execution context mismatch' "begin; set local role myeongha_api_executor; set local myeongha.subject_id='$alice'; select * from public.internal_qry_chat_credit_balance_v1('$carol'); rollback;"
expect_denied "NO_TRUSTED_SUBJECT_CONTEXT" 'trusted MyeongHa subject execution context is required' "begin; set local role myeongha_api_executor; select * from public.internal_qry_chat_credit_balance_v1('$alice'); rollback;"
expect_denied "DELETED_MEMBER_WALLET_READ" 'Credit owner is not an active Subject' "begin; set local role myeongha_api_executor; set local myeongha.subject_id='$bob'; select * from public.internal_qry_chat_credit_balance_v1('$bob'); rollback;"
expect_denied "ANONYMOUS_DIRECT_LEDGER" 'permission denied for table chat_credit_lots_v1' 'begin; set local role anon; select * from public.chat_credit_lots_v1 limit 1; rollback;'
expect_denied "AUTHENTICATED_DIRECT_LEDGER" 'permission denied for table chat_credit_lots_v1' 'begin; set local role authenticated; select * from public.chat_credit_lots_v1 limit 1; rollback;'
expect_denied "SERVICE_ROLE_DIRECT_LEDGER" 'permission denied for table chat_credit_lots_v1' 'begin; set local role service_role; select * from public.chat_credit_lots_v1 limit 1; rollback;'
expect_denied "API_EXECUTOR_FORGED_TOPUP" 'permission denied for function internal_cmd_chat_signup_credit_v1' "begin; set local role myeongha_api_executor; set local myeongha.subject_id='$alice'; select public.internal_cmd_chat_signup_credit_v1('$alice'); rollback;"
expect_denied "API_EXECUTOR_FORGED_DEBIT" 'permission denied for function internal_cmd_chat_credit_reserve_v1' "begin; set local role myeongha_api_executor; set local myeongha.subject_id='$alice'; select * from public.internal_cmd_chat_credit_reserve_v1('$alice','cda30000-0000-4000-8000-000000000001','cda40000-0000-4000-8000-000000000001'); rollback;"
expect_denied "API_EXECUTOR_FORGED_FINALIZE" 'permission denied for function internal_cmd_chat_credit_finalize_v1' "begin; set local role myeongha_api_executor; set local myeongha.subject_id='$alice'; select public.internal_cmd_chat_credit_finalize_v1('$alice','cda50000-0000-4000-8000-000000000001',true,null); rollback;"

# Use the real sandbox TESTPAY SQL commerce entrypoints, not mocked success.
# Existing suites assert pinned price/terms, idempotency, forged status,
# cross-subject ownership, provider evidence and replay/timestamp conflicts.
bash test/db/commerce_payment_attempt_authority.sh
bash test/db/commerce_verified_payment_evidence_persistence.sh
bash test/db/commerce_verified_payment_replay_timestamp.sh
echo 'PASS_COMMERCE_PAYMENT_ATTACK_E2E_SANDBOX_ONLY_NO_REAL_CHARGES'
