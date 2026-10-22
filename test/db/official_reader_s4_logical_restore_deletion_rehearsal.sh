#!/usr/bin/env bash
set -euo pipefail
# S4 synthetic logical protected-data snapshot -> delete -> restore rehearsal.
# The fixture ledger is outside the backed-up schema, as a privacy-recovery
# service would be. This is NOT a physical PITR/P30D/KMS or Production drill.
# No actual payment/refund/model call, no real user bytes, no policy mutation.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
die() { echo "FAIL S4 restore: $*" >&2; exit 1; }
check() {
  local label="$1" query="$2" actual
  actual="$(p -c "$query")" || die "$label query failed"
  [[ "$actual" == t ]] || die "$label (actual=$actual)"
  echo "PASS S4 restore: $label"
}
# Both negative paths call the S4 fixture wrapper, which delegates to the
# actual native 1190 ACK only AFTER protected cleanup is complete.
s4_guarded_ack="select * from official_reader_s4_ledger_fixture.attempt_guarded_completion_ack_v1(
 '11390000-0000-0000-0000-000000000001'::uuid,
 'fc800000-0000-0000-0000-000000000002'::uuid,
 'synthetic-no-active-worker-lease');"
check_ack_denied() {
 local label="$1" reason="$2" result
 if result="$(p -c "$s4_guarded_ack" 2>&1)"; then
  die "$label: unproven completion was accepted"
 fi
 [[ "$result" == *"$reason"* ]] || {
  echo "$result" >&2
  die "$label: wrong completion denial"
 }
 echo "PASS S4 restore: $label"
}
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
snapshot="$tmpdir/synthetic-protected-body.csv"
subject="11390000-0000-0000-0000-000000000001"
reading="12103100-0000-0000-0000-000000000001"
bundle="11391000-0000-0000-0000-000000000001"
body="d4000000-0000-4000-8000-000000000001"
marker="d4500000-0000-4000-8000-000000000001"
thread="d4300000-0000-4000-8000-000000000001"
b2="12192300-0000-0000-0000-000000000002"
read_count="official_reader_s4_fixture.count_current('$subject'::uuid,'$reading'::uuid,'test-unlockable-reader','$bundle'::uuid)"
cleanup_ready="official_reader_s4_ledger_fixture.protected_cleanup_ready_for_completion_v1('$subject'::uuid)"

# Existing disposable S4 fixture has read tested but has not yet finalized
# its synthetic Chat graph in this separate rehearsal.
p -v s4_restore_rehearsal=1 -f test/db/official_reader_s4_protected_storage_design.sql >"$tmpdir/setup.log" 2>&1 || {
  tail -60 "$tmpdir/setup.log" >&2
  die "fixture failed"
}
# Privacy #2318: evaluate all four 2230 derived-source categories against
# synthetic OLD-backup rows, bypassing only the new-write trigger INSIDE the
# disposable superuser transaction. Each injection is rolled back, and normal
# 2190 triggers are re-enabled before the actual restore check.
p -f test/db/official_reader_s4_restored_derived_quarantine.sql >"$tmpdir/derived-quarantine.log" 2>&1 || {
  tail -75 "$tmpdir/derived-quarantine.log" >&2
  die "restore derived-data quarantine E2E failed"
}
echo "PASS S4 restore: actual 2230 categorical Memory/Proposal/Life Fact/Outbox quarantine"
p -f test/db/official_reader_s4_finalizer_forward_contract.sql >"$tmpdir/forward-contract.log" 2>&1 || {
 tail -65 "$tmpdir/forward-contract.log" >&2
 die "forward-only finalizer ordering contract failed"
}
p -c "update public.entitlement_grants g set status='active',revision=revision+1,
 last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
 from public.standard_reading_reader_access_grants a
 where a.entitlement_grant_id=g.id and a.purchase_intent_id='$b2'::uuid;" >/dev/null
check "before snapshot exact entitlement and safe marker can resolve the candidate" "select ($read_count)=1;"
check "protected cleanup cannot ACK before independent deletion tombstone" "select not ($cleanup_ready);"
check_ack_denied "guarded native completion blocks before tombstone" "Protected Reader deletion ledger or recovered bytes are not reconciled"
check "other Subject without tombstone cannot ACK this deletion" "select not official_reader_s4_ledger_fixture.protected_cleanup_ready_for_completion_v1('11390000-0000-0000-0000-000000000002'::uuid);"
# PostgreSQL client \copy exports real DB bytea rows into an isolated logical
# snapshot, then imports those same rows after deletion. Works on PG15/PG17.
p -c "\\copy official_reader_s4_fixture.protected_bodies TO '$snapshot' WITH (FORMAT csv)" >"$tmpdir/export.log" || die "snapshot export failed"
[[ -s "$snapshot" ]] || die "snapshot must contain synthetic protected row"
check "snapshot source has one synthetic ciphertext row" "select count(*)=1 from official_reader_s4_fixture.protected_bodies where id='$body'::uuid;"

# Simulate a deletion accepted by an external ledger AFTER the old snapshot.
# Make restoration serviceability OFF before physical cleanup.
p -c "begin;
 insert into official_reader_s4_ledger_fixture.deletion_events(body_id,subject_id,event_epoch)
 values('$body'::uuid,'$subject'::uuid,2);
 update official_reader_s4_ledger_fixture.recovery_fence
 set serving_allowed=false,required_epoch=2,reconciled_epoch=1 where singleton;
 delete from official_reader_s4_fixture.protected_bodies where id='$body'::uuid;
 commit;" >/dev/null
check "primary row physically deleted with external tombstone retained" "select not exists(select 1 from official_reader_s4_fixture.protected_bodies) and exists(select 1 from official_reader_s4_ledger_fixture.deletion_events where body_id='$body'::uuid);"
check "protected cleanup ACK blocked while ledger reconciliation is behind" "select not ($cleanup_ready);"
check_ack_denied "guarded native completion blocks stale epoch" "Protected Reader deletion ledger or recovered bytes are not reconciled"

# Restore the *old* protected row bytes. Parent Chat and Commerce tables are
# intentionally still present: FKs alone therefore cannot save this scenario.
p -c "\\copy official_reader_s4_fixture.protected_bodies FROM '$snapshot' WITH (FORMAT csv)" >"$tmpdir/import.log" || die "old snapshot import failed"
check "old snapshot really resurrected encrypted-shaped candidate bytes" "select count(*)=1 and min(encode(synthetic_ciphertext,'hex'))='d00df00d' from official_reader_s4_fixture.protected_bodies;"
check "restored old body cannot be read while recovery fence OFF" "select ($read_count)=0;"
check "old backup protected body blocks completion readiness" "select not ($cleanup_ready);"

# Absence and stale reconciliation are both hard DENY even though the restored
# Receipt+Grant remain valid in the old branch snapshot.
p -c "delete from official_reader_s4_ledger_fixture.recovery_fence where singleton;" >/dev/null
check "missing external recovery status fails closed" "select ($read_count)=0;"
check "missing external ledger prevents protected cleanup ACK" "select not ($cleanup_ready);"
p -c "insert into official_reader_s4_ledger_fixture.recovery_fence(singleton,serving_allowed,required_epoch,reconciled_epoch)
 values(true,true,2,1);" >/dev/null
check "stale recovery ledger epoch fails closed" "select ($read_count)=0;"
check "stale reconciliation prevents protected cleanup ACK" "select not ($cleanup_ready);"
p -c "update official_reader_s4_ledger_fixture.recovery_fence set reconciled_epoch=2 where singleton;" >/dev/null
check "even reconciled rights cannot override independent subject deletion tombstone" "select ($read_count)=0;"
check "reconciled epoch still cannot ACK with resurrected protected bytes" "select not ($cleanup_ready);"
check_ack_denied "guarded native completion blocks resurrected bytes" "Protected Reader deletion ledger or recovered bytes are not reconciled"

# 1520 starts with Reader-access removal BEFORE it removes Chat markers.
# Its first parent DELETE must fail on a restored protected child.
p >"$tmpdir/reader-first.out" 2>&1 <<SQL || die "Reader-access parent-first negative fixture failed"
do \$reader_first\$
begin
 begin
  delete from public.standard_reading_reader_access_grants
   where purchase_intent_id='$b2'::uuid;
 exception when foreign_key_violation then
  raise notice 'PASS S4 restored paid child blocks old finalizer Reader-access DELETE';
  return;
 end;
 raise exception 'FAIL S4 restored Reader access removed before paid child';
end;
\$reader_first\$;
SQL
check "restored paid child preserves parent Reader-access row" "select
 (select count(*) from official_reader_s4_fixture.protected_bodies)=1
 and exists(select 1 from public.standard_reading_reader_access_grants
  where purchase_intent_id='$b2'::uuid);"

# Child-first deletion: the original Chat message cannot disappear before
# the resurrected protected child is scrubbed.
p >"$tmpdir/parent-first.out" 2>&1 <<SQL || die "parent-first negative fixture failed"
do \$blocked_parent\$
begin
 begin
  delete from public.conversation_messages where id='$marker'::uuid;
 exception when foreign_key_violation then
  raise notice 'PASS S4 restore protected child blocks parent deletion';
  return;
 end;
 raise exception 'FAIL S4 restored protected row allowed orphan marker';
end;
\$blocked_parent\$;
SQL
check "failed parent-first operation did not destroy protected or Chat row" "select (select count(*) from official_reader_s4_fixture.protected_bodies)=1 and (select count(*) from public.conversation_messages where id='$marker'::uuid)=1;"
p -c "delete from official_reader_s4_fixture.protected_bodies b
 using official_reader_s4_ledger_fixture.deletion_events d
 where b.id=d.body_id and b.subject_id=d.subject_id;" >/dev/null
check "replayed external tombstone physically scrubs old restored bytes" "select not exists(select 1 from official_reader_s4_fixture.protected_bodies);"
check "reconciled tombstone and zero protected rows pass protected-only cleanup gate" "select ($cleanup_ready);"

# Reverse the previously proven ACK-FIRST overlap: the off-backup recovery
# service changes the epoch FIRST and owns its DB-mirror recovery fence,
# while a completion Worker tries to ACK and waits behind the writer.
# The Worker must re-read the COMMITTED epoch after the lock wait, DENY, and
# must never reach the native 1190 Job/lease error with a stale ledger.
p >"$tmpdir/recovery-first-holder.out" 2>&1 <<SQL &
set application_name='rr_s4_recovery_first_epoch_owner';
set statement_timeout='20s';
begin;
update official_reader_s4_ledger_fixture.recovery_fence
 set required_epoch=3,reconciled_epoch=2,serving_allowed=false
 where singleton;
select pg_sleep(4);
commit;
SQL
recovery_pid=$!
recovery_ready=0
for ((try=0;try<150;try++)); do
 if [[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity
    where application_name='rr_s4_recovery_first_epoch_owner'
    and state='active' and wait_event_type='Timeout';")" == 1 ]]; then
  recovery_ready=1
  break
 fi
 if ! kill -0 "$recovery_pid" 2>/dev/null; then
  cat "$tmpdir/recovery-first-holder.out" >&2
  die "external-ledger candidate did not hold recovery-fence transaction"
 fi
 sleep 0.1
done
[[ "$recovery_ready" == 1 ]] || die "recovery owner never held the epoch transaction"
p -c "$s4_guarded_ack" >"$tmpdir/recovery-first-ack-waiter.out" 2>&1 &
recovery_ack_pid=$!
recovery_ack_waiting=0
for ((try=0;try<80;try++)); do
 if [[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity
  where query like '%official_reader_s4_ledger_fixture.attempt_guarded_completion_ack_v1%'
   and pid<>pg_backend_pid() and state='active' and wait_event_type='Lock';")" == 1 ]]; then
  recovery_ack_waiting=1
  break
 fi
 if ! kill -0 "$recovery_ack_pid" 2>/dev/null; then
  cat "$tmpdir/recovery-first-ack-waiter.out" >&2
  die "native completion ACK did not block behind restoration epoch"
 fi
 sleep 0.05
done
[[ "$recovery_ack_waiting" == 1 ]] || die "completion ACK did not wait for external recovery epoch owner"
wait "$recovery_pid" || {
 cat "$tmpdir/recovery-first-holder.out" >&2
 die "external epoch owner failed"
}
if wait "$recovery_ack_pid"; then
 die "completion ACK accepted new unreconciled epoch after waiting"
fi
grep -q 'Protected Reader deletion ledger or recovered bytes are not reconciled' \
 "$tmpdir/recovery-first-ack-waiter.out" || {
 cat "$tmpdir/recovery-first-ack-waiter.out" >&2
 die "completion ACK failed for wrong reason after recovery epoch changed"
}
check "external recovery epoch blocks completion after lock wait" "select not ($cleanup_ready)"
check "deleted protected bytes still absent after first-epoch overlap" "select not exists(select 1 from official_reader_s4_fixture.protected_bodies)"
# Owner acknowledges reconciliation in a separate transaction. The ACK
# precondition can then be true but the real 1190 Job/lease still must fail.
p -c "update official_reader_s4_ledger_fixture.recovery_fence
 set reconciled_epoch=3,serving_allowed=false where singleton;" >/dev/null
check "external recovery reconciliation restores only protected cleanup readiness" "select ($cleanup_ready)"
check_ack_denied "real native 1190 still rejects missing Worker/Job after epoch reconciliation" "account deletion completion requires the exact account deletion job"
# Return the fixture to its preexisting independent-backup baseline.
p -c "update official_reader_s4_ledger_fixture.recovery_fence
 set required_epoch=2,reconciled_epoch=2,serving_allowed=true where singleton;" >/dev/null
check "external recovery-first test leaves canonical fixture epoch unchanged" "select
 (select required_epoch=2 and reconciled_epoch=2 and serving_allowed
  from official_reader_s4_ledger_fixture.recovery_fence where singleton)
 and ($cleanup_ready)"
echo "PASS S4 restore: recovery-first epoch update blocks and invalidates completion ACK"


check_ack_denied "native completion still requires real deletion job after scrub" "account deletion completion requires the exact account deletion job"
# Once the child is physically deleted the finalizer's Reader-access ordering
# becomes valid. ROLLBACK to retain this fixture for the second restore.
p -c "begin;
 delete from public.standard_reading_reader_access_grants
  where purchase_intent_id='$b2'::uuid;
 do \$ordered\$ begin
  if exists(select 1 from public.standard_reading_reader_access_grants
    where purchase_intent_id='$b2'::uuid)
  then raise exception 'FAIL S4 child-first Reader-access cleanup'; end if;
 end \$ordered\$;
 rollback;" >/dev/null
echo "PASS S4 restore: child-first scrub unblocks Reader-access finalizer ordering"

# A second replay/restore cannot resurrect an accessible row either.
p -c "\\copy official_reader_s4_fixture.protected_bodies FROM '$snapshot' WITH (FORMAT csv)" >"$tmpdir/replay-import.log" || die "second old snapshot import failed"
# Reproduce an ACTUAL two-connection time-of-check/time-of-use overlap:
# completed native 1190 replay has already passed the protected cleanup gate
# but is still in its own transaction holding the recovery-fence FOR UPDATE.
# Both another epoch writer and restored-byte INSERT must wait on that fence.
p -v s4_race_rehearsal=1 -f test/db/official_reader_s4_completed_replay_restore_contract.sql >"$tmpdir/ack-fence-holder.out" 2>&1 &
ack_fence_pid=$!
fence_ready=0
for ((try=0;try<150;try++)); do
 if [[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity
    where application_name='rr_s4_native_ack_fence_owner'
    and state='active' and wait_event_type='Timeout';")" == 1 ]]; then
  fence_ready=1
  break
 fi
 if ! kill -0 "$ack_fence_pid" 2>/dev/null; then
  cat "$tmpdir/ack-fence-holder.out" >&2
  die "synthetic completed ACK finished before shared recovery-fence overlap"
 fi
 sleep 0.1
done
[[ "$fence_ready" == 1 ]] || die "native completed ACK did not reach recovery-fence hold"
if p >"$tmpdir/recovery-epoch-lock-loser.out" 2>&1 <<SQL
begin;
set local lock_timeout='150ms';
update official_reader_s4_ledger_fixture.recovery_fence
 set required_epoch=3 where singleton;
commit;
SQL
then
 die "recovery required epoch changed concurrently during guarded native ACK"
fi
grep -q 'canceling statement due to lock timeout' "$tmpdir/recovery-epoch-lock-loser.out" || {
 cat "$tmpdir/recovery-epoch-lock-loser.out" >&2
 die "competing ledger epoch update failed for unexpected reason"
}
# The BEFORE INSERT trigger takes exactly the same lock, so a restored
# snapshot cannot slip into the interval after gate check and before ACK.
if p -c "set lock_timeout='150ms';" -c "\\copy official_reader_s4_fixture.protected_bodies FROM '$snapshot' WITH (FORMAT csv)" >"$tmpdir/recovery-import-lock-loser.out" 2>&1; then
 die "old backup import bypassed guarded native ACK recovery-fence lock"
fi
grep -q 'canceling statement due to lock timeout' "$tmpdir/recovery-import-lock-loser.out" || {
 cat "$tmpdir/recovery-import-lock-loser.out" >&2
 die "competing restored-byte writer failed for unexpected reason"
}
wait "$ack_fence_pid" || {
 cat "$tmpdir/ack-fence-holder.out" >&2
 die "guarded native ACK and rollback failed while owning recovery fence"
}
ack_fence_pid=""
grep -q 'PASS S4 scrubbed bytes delegate native completed replay' "$tmpdir/ack-fence-holder.out" ||
 die "native completed ACK was not reached in the two-connection overlap"
check "concurrent epoch and snapshot writers did not commit during guarded ACK" "select
 (select required_epoch=2 and reconciled_epoch=2
  from official_reader_s4_ledger_fixture.recovery_fence where singleton)
 and (select count(*)=1 from official_reader_s4_fixture.protected_bodies)
 and not exists(select 1 from public.data_deletion_jobs
  where id='d4800000-0000-4000-8000-000000000001'::uuid);"
# After the ACK's transaction has rolled back, an independent epoch change
# can proceed but the guard must DENY until reconciliation is complete.
p -c "update official_reader_s4_ledger_fixture.recovery_fence
 set required_epoch=3 where singleton;" >/dev/null
check "post-ACK epoch advancement independently blocks completion readiness" "select not ($cleanup_ready);"
check_ack_denied "native completion wrapper denies new unreconciled recovery epoch" "Protected Reader deletion ledger or recovered bytes are not reconciled"
p -c "update official_reader_s4_ledger_fixture.recovery_fence
 set required_epoch=2,reconciled_epoch=2 where singleton;" >/dev/null
check "recovery fence reset after lock-overlap rehearsal" "select
 (select required_epoch=2 and reconciled_epoch=2 from official_reader_s4_ledger_fixture.recovery_fence where singleton)
 and (select count(*)=1 from official_reader_s4_fixture.protected_bodies);"
echo "PASS S4 restore: guarded native ACK serializes recovery ledger epoch and old backup import"

# A separate transaction supplies completed Job/Outbox metadata to the
# ACTUAL native 1190 completed-replay path without committing a fake deletion.
# It denies the old bytes, delegates after an in-transaction scrub, and then
# ROLLBACK restores this snapshot for the existing second tombstone replay.
p -f test/db/official_reader_s4_completed_replay_restore_contract.sql >"$tmpdir/completed-replay.log" 2>&1 || {
 tail -85 "$tmpdir/completed-replay.log" >&2
 die "native completed-state old-backup replay contract failed"
}
grep -q 'PASS S4 scrubbed bytes delegate native completed replay' "$tmpdir/completed-replay.log" ||
 die "native completed-state delegation was not exercised"
grep -q 'PASS S4 completed-state rehearsal rolled back' "$tmpdir/completed-replay.log" ||
 die "completed-state rehearsal did not restore the prior backup state"
echo "PASS S4 restore: already-completed native ACK replay gated by old protected bytes"

check "second old backup import remains unreadable" "select ($read_count)=0;"
check_ack_denied "second restore reblocks native completion" "Protected Reader deletion ledger or recovered bytes are not reconciled"
check "second restore immediately revokes protected completion readiness" "select not ($cleanup_ready);"
p -c "delete from official_reader_s4_fixture.protected_bodies b
 using official_reader_s4_ledger_fixture.deletion_events d
 where b.id=d.body_id and b.subject_id=d.subject_id;" >/dev/null

check "second scrub restores protected-only completion readiness" "select ($cleanup_ready);"
check_ack_denied "second scrub still cannot bypass native worker/job requirements" "account deletion completion requires the exact account deletion job"

# AccountDeletion child-first scope rehearsal. Commerce P5Y is intentionally
# retained; this does not claim current AccountDeletion worker integration.
p -c "begin;
 delete from public.conversation_messages where id='$marker'::uuid;
 delete from public.chat_turn_attempts where id='d4200000-0000-4000-8000-000000000001'::uuid;
 delete from public.chat_turns where id='d4100000-0000-4000-8000-000000000001'::uuid;
 delete from public.conversation_thread_characters where thread_id='$thread'::uuid;
 delete from public.conversation_threads where id='$thread'::uuid;
 commit;" >/dev/null
check "deletion finalization removes synthetic protected, marker, attempt, turn and thread" "select
 (select count(*) from official_reader_s4_fixture.protected_bodies)=0
 and not exists(select 1 from public.conversation_messages where id='$marker'::uuid)
 and not exists(select 1 from public.chat_turn_attempts where id='d4200000-0000-4000-8000-000000000001'::uuid)
 and not exists(select 1 from public.chat_turns where id='d4100000-0000-4000-8000-000000000001'::uuid)
 and not exists(select 1 from public.conversation_threads where id='$thread'::uuid)
 and exists(select 1 from official_reader_s4_ledger_fixture.deletion_events where body_id='$body'::uuid)
 and exists(select 1 from public.commerce_receipts cr join public.entitlement_grants g on g.source_receipt_id=cr.id join public.standard_reading_reader_access_grants a on a.entitlement_grant_id=g.id where a.purchase_intent_id='$b2'::uuid);"
echo "PASS S4 logical restore and account-deletion graph: external tombstone + epoch fence, no restored reread"
