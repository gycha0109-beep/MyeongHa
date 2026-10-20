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

# Existing disposable S4 fixture has read tested but has not yet finalized
# its synthetic Chat graph in this separate rehearsal.
p -v s4_restore_rehearsal=1 -f test/db/official_reader_s4_protected_storage_design.sql >"$tmpdir/setup.log" 2>&1 || {
  tail -60 "$tmpdir/setup.log" >&2
  die "fixture failed"
}
p -c "update public.entitlement_grants g set status='active',revision=revision+1,
 last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
 from public.standard_reading_reader_access_grants a
 where a.entitlement_grant_id=g.id and a.purchase_intent_id='$b2'::uuid;" >/dev/null
check "before snapshot exact entitlement and safe marker can resolve the candidate" "select ($read_count)=1;"
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

# Restore the *old* protected row bytes. Parent Chat and Commerce tables are
# intentionally still present: FKs alone therefore cannot save this scenario.
p -c "\\copy official_reader_s4_fixture.protected_bodies FROM '$snapshot' WITH (FORMAT csv)" >"$tmpdir/import.log" || die "old snapshot import failed"
check "old snapshot really resurrected encrypted-shaped candidate bytes" "select count(*)=1 and min(encode(synthetic_ciphertext,'hex'))='d00df00d' from official_reader_s4_fixture.protected_bodies;"
check "restored old body cannot be read while recovery fence OFF" "select ($read_count)=0;"

# Absence and stale reconciliation are both hard DENY even though the restored
# Receipt+Grant remain valid in the old branch snapshot.
p -c "delete from official_reader_s4_ledger_fixture.recovery_fence where singleton;" >/dev/null
check "missing external recovery status fails closed" "select ($read_count)=0;"
p -c "insert into official_reader_s4_ledger_fixture.recovery_fence(singleton,serving_allowed,required_epoch,reconciled_epoch)
 values(true,true,2,1);" >/dev/null
check "stale recovery ledger epoch fails closed" "select ($read_count)=0;"
p -c "update official_reader_s4_ledger_fixture.recovery_fence set reconciled_epoch=2 where singleton;" >/dev/null
check "even reconciled rights cannot override independent subject deletion tombstone" "select ($read_count)=0;"

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
check "second old backup import remains unreadable" "select ($read_count)=0;"
p -c "delete from official_reader_s4_fixture.protected_bodies b
 using official_reader_s4_ledger_fixture.deletion_events d
 where b.id=d.body_id and b.subject_id=d.subject_id;" >/dev/null

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
