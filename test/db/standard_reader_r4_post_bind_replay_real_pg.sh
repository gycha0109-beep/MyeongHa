#!/usr/bin/env bash
set -euo pipefail
mode="${1:?BIND-17 mode required}"
case "$mode" in expired_grant|offer_disabled) ;; *) exit 1;; esac
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGDATABASE:-}" == "myeongha_b2_r4_b17_$mode" ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-17/$mode $*" >&2; exit 1; }
tmp="$(mktemp -d)";trap 'rm -rf "$tmp"' EXIT
subject=11390000-0000-0000-0000-000000000001
intent=b2020000-0000-4000-8000-000000000001
receipt=b2030000-0000-4000-8000-000000000001
# Existing source-owned, committed Official Reading plus separate verified
# additional Reader Receipt/Grant. Never synthesize a v2 access row directly.
awk '/^create temp table _v2_additional_result as/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
awk '/^create temp table _b2_additional_result as/{exit} {print}' \
 test/db/standard_reader_additional_policy_locked_positive.sql >>"$tmp/setup.sql"
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 50 "$tmp/setup.err" >&2; fail 'verified additional Reader fixture'; }
binder_sql(){
cat <<SQL
begin;
select set_config('myeongha.subject_id','$subject',true);
select * from public.internal_cmd_bind_standard_reader_additional_policy_locked_v1(
 '$subject'::uuid,'$intent'::uuid,
 'b2040000-0000-4000-8000-000000000001'::uuid,
 'b2050000-0000-4000-8000-000000000001'::uuid,
 'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$intent"}'::jsonb);
commit;
SQL
}
binder_sql | p >"$tmp/first.out" 2>"$tmp/first.err" ||
 { cat "$tmp/first.err" >&2; fail 'legitimate private first Binder'; }
current_count(){
 p -c "select set_config('myeongha.subject_id','$subject',false);
 select count(*) from public.internal_qry_character_standard_reading_access_v2(
 '$subject'::uuid,'baekheon',clock_timestamp())" | tail -n 1
}
[[ "$(current_count)" == 1 ]] || fail 'precondition: current Reader access missing'
grant="$(p -c "select entitlement_grant_id from public.standard_reading_reader_access_grants
where purchase_intent_id='$intent'::uuid")"
[[ "$grant" =~ ^[0-9a-f-]{36}$ ]] || fail 'exact independent Grant missing'
case "$mode" in
 expired_grant)
  # Disposable fixture-only entitlement clock advance. Not a production
  # Commerce expiration writer or a substitute for Owner approval.
  p -c "update public.entitlement_grants
    set valid_until=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp()
    where id='$grant'::uuid and status='active'" >/dev/null
  sleep 0.15
  [[ "$(p -c "select count(*) from public.entitlement_grants
     where id='$grant'::uuid and valid_until <= clock_timestamp()")" == 1 ]] ||
   fail 'Grant expiry did not take effect'
  [[ "$(current_count)" == 0 ]] || fail 'expired Grant remained readable as current access'
  ;;
 offer_disabled)
  p -c "update public.product_offers set enabled=false
    where id='12102200-0000-0000-0000-000000000001'::uuid" >/dev/null
  [[ "$(p -c "select count(*) from public.product_offers
    where id='12102200-0000-0000-0000-000000000001'::uuid and enabled=false")" == 1 ]] ||
   fail 'current additional Offer was not disabled'
  ;;
esac
before="$(p -c "select
 (select count(*) from public.standard_reading_official_bindings),
 (select count(*) from public.standard_reading_reader_interpretations),
 (select count(*) from public.standard_reading_reader_access_grants),
 (select count(*) from public.entitlement_events where source_receipt_id='$receipt'::uuid)")"
if binder_sql | p >"$tmp/replay.out" 2>"$tmp/replay.err"; then
 fail 'same Purchase Intent replay became fresh current authorization'
fi
grep -Fq 'Historical Standard Reading replay cannot authorize current access' "$tmp/replay.err" ||
 { cat "$tmp/replay.err" >&2; fail 'historical replay rejected for unrelated cause'; }
after="$(p -c "select
 (select count(*) from public.standard_reading_official_bindings),
 (select count(*) from public.standard_reading_reader_interpretations),
 (select count(*) from public.standard_reading_reader_access_grants),
 (select count(*) from public.entitlement_events where source_receipt_id='$receipt'::uuid)")"
[[ "$before" == "$after" ]] || fail 'replay mutated Reading/Access/Commerce ledger'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
where purchase_intent_id='$intent'::uuid and entitlement_grant_id='$grant'::uuid")" == 1 ]] ||
 fail 'original immutable access provenance overwritten'
echo "PASS R4/BIND-17/$mode historical replay DENY, no current rights minted, immutable provenance retained"
