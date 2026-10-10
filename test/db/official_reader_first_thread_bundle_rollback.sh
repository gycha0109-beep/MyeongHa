#!/usr/bin/env bash
set -euo pipefail

# Independent disposable PostgreSQL fixture of the existing production
# Member Chat open command and the D-05 bounded locator. Tests DB transaction
# rollback semantics only: this is NOT a live Product/Grant integrated E2E.
source test/db/member_character_thread_open_concurrency.sh >/dev/null

subject='b2000000-0000-0000-0000-000000000003'
reader='char-alpha'
expected_bundle='b3000000-0000-0000-0000-000000000001'
default_bundle='b3000000-0000-0000-0000-000000000002'

pre=$("${psql_base[@]}" -c "select count(*) from public.conversation_threads where subject_id='$subject' and status='active';")
[[ "$pre" == '0' ]] || fail "D-05 fixture expected no existing Member3 Thread"

# Mimics an exact active purchased Reader Grant pinned to old Bundle A, while
# the Chat open command is pinned to current default Bundle B. A post-command
# mismatch MUST abort the same transaction so the provisional new Thread
# and its participant never survive.
expect_runtime_fail "D-05-C mismatched default bundle rolls back first open" "$subject" \
  'D05_C_BUNDLE_MISMATCH_ROLLBACK' "
  DO \$guard\$ DECLARE
    v_returned_bundle uuid;
  BEGIN
    select active_content_bundle_id
    into strict v_returned_bundle
    from public.cmd_open_member_single_character_thread_v1(
      '$subject','$reader',
      'b5000000-0000-0000-0000-000000000031',
      'b6000000-0000-0000-0000-000000000031'
    );
    if v_returned_bundle is distinct from '$expected_bundle'::uuid then
      raise exception 'D05_C_BUNDLE_MISMATCH_ROLLBACK';
    end if;
  END \$guard\$;"
no_thread=$("${psql_base[@]}" -c "select count(*) from public.conversation_threads where subject_id='$subject' and status='active';")
no_participant=$("${psql_base[@]}" -c "select count(*) from public.conversation_thread_characters where thread_id='b5000000-0000-0000-0000-000000000031';")
[[ "$no_thread" == '0' && "$no_participant" == '0' ]] || fail "D-05-C mismatched open was not atomically rolled back"
pass "D-05-C wrong Bundle cannot persist Thread or Character participant"

# A matching pinned Bundle may use the EXISTING command to create once.
opened=$(runtime_query "$subject" "
  select thread_id::text, created, active_content_bundle_id::text
  from public.cmd_open_member_single_character_thread_v1(
    '$subject','$reader',
    'b5000000-0000-0000-0000-000000000032',
    'b6000000-0000-0000-0000-000000000032'
  );")
[[ "$opened" == "b5000000-0000-0000-0000-000000000032|t|$default_bundle" ]] || fail "D-05-C exact default Thread creation mismatch: $opened"
pass "D-05-C matching current Bundle creates first Thread"

reused=$(runtime_query "$subject" "
  select thread_id::text, created, active_content_bundle_id::text
  from public.cmd_open_member_single_character_thread_v1(
    '$subject','$reader',
    'b5000000-0000-0000-0000-000000000033',
    'b6000000-0000-0000-0000-000000000033'
  );")
[[ "$reused" == "b5000000-0000-0000-0000-000000000032|f|$default_bundle" ]] || fail "D-05-C existing Thread not reused: $reused"
found=$(runtime_query "$subject" "select thread_id::text from public.qry_member_single_character_thread_locator_v1('$subject','$reader');")
[[ "$found" == 'b5000000-0000-0000-0000-000000000032' ]] || fail "D-05-C locator mismatch after create/reuse"
pass "D-05-C repeated entry reuses one canonical Member x Reader Thread"

echo 'PASS D-05-C first-thread Bundle rollback / idempotent reuse PostgreSQL fixture'
