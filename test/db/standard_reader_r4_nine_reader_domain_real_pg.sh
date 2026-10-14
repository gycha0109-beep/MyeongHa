#!/usr/bin/env bash
set -euo pipefail
reader="${1:?canonical Reader required}"
case "$reader" in
  seyeon|baekheon|yeoul|seorin|rahyeon|mira|taegyeom|yunho|doyun) ;;
  *) echo "FAIL R4/BIND-07 unknown Reader" >&2; exit 1 ;;
esac
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGDATABASE:-}" == "myeongha_b2_r4_domain_$reader" ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-07 $reader: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# Exactly the proven official Birth/Product/Purchase/Receipt/Grant fixture.
# Replace only the test's selected *official Reader*, never a production ID.
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
awk '/^create temp table _s4_initial_result as/{exit} {print}' \
 test/db/standard_reader_initial_policy_locked_positive.sql |
 sed "s/seyeon/$reader/g" >>"$tmp/setup.sql"
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 45 "$tmp/setup.err" >&2; fail 'synthetic verified purchase'; }
product=11392000-0000-0000-0000-000000000001
bundle=11391000-0000-0000-0000-000000000001
# Current test Product is APPROVED FOR RELATIONSHIP ONLY. The eight
# other Saju domains have no approved rule on this Product, even though
# they are known domains. Do not invent saleable Products for them.
cat >"$tmp/domains.sql" <<SQL
do \$check\$
declare
  domain text;
  matched integer;
  expected_domains text[] := array[
    'general','family','relationship','compatibility','career',
    'business','wealth','life_stage','question_specific'
  ]::text[];
begin
  if (select count(*) from public.saju_domains
      where saju_domain=any(expected_domains)) <> 9 then
    raise exception 'BIND-07 official Saju domain seed mismatch';
  end if;
  for domain in select unnest(expected_domains) loop
    select count(*)::int into matched from
      public.qry_standard_reader_approved_rule_v1(
        '$product'::uuid,'v1',domain,clock_timestamp()
      ) policy;
    if matched <> (case when domain='relationship' then 1 else 0 end) then
      raise exception 'BIND-07 domain authorization mismatch %, %',domain,matched;
    end if;
  end loop;
end
\$check\$;
SQL
p -f "$tmp/domains.sql" >"$tmp/domains.out" 2>"$tmp/domains.err" ||
 { cat "$tmp/domains.err" >&2; fail 'approved revision / domain mismatch'; }
[[ "$(p -c "select count(*) from public.qry_standard_reading_reader_catalog_v4('$product'::uuid,'$reader') c where c.catalog_enabled=true and c.catalog_availability='available' and c.reader_content_bundle_id='$bundle'::uuid")" == 1 ]] ||
 fail 'Reader is not a single published Product catalog candidate'
sed "s/seyeon/$reader/g" test/db/standard_reader_r4_initial_bind_call.sql >"$tmp/bind.sql"
p -f "$tmp/bind.sql" >"$tmp/bind.out" 2>"$tmp/bind.err" ||
 { cat "$tmp/bind.err" >&2; fail 'private Standard initial bind'; }
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 1 ]] || fail 'one official Reading required'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants where reader_character_id='$reader' and purchase_intent_id='b4220000-0000-4000-8000-000000000001'::uuid")" == 1 ]] || fail 'exact Reader Access required'
[[ "$(p -c "select count(*) from public.character_capabilities where character_id='$reader' and content_bundle_id='$bundle'::uuid and saju_domain='relationship'")" == 0 ]] || fail 'specialist Capability was silently created'
echo "PASS R4/BIND-07/$reader nine-domain Product exact-rule parity (relationship-only), Standard binder 1 Reading/Access, specialist 0"
