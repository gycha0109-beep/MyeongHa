#!/usr/bin/env bash
set -euo pipefail
# Watchtower-Track: character-memory
# Disposable PostgreSQL G2/G3 *preflight* against REAL memory/grant tables
# and real public.cmd_revoke_memory_character_grant_v1. The SQL probe lives
# ONLY in this test DB; it is NOT a production RPC, RLS/ACL or HTTP authority.
[[ "${PGDATABASE:-}" == "myeongha_seyeon_positive_grant_race_test" ]] || {
  echo 'FAIL refusing non-disposable PostgreSQL target' >&2
  exit 2
}

db() { psql -X -qAt -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }
tmp="$(mktemp -d)"
pid_a='' pid_b=''
cleanup() {
  for pid in "$pid_a" "$pid_b"; do
    if [[ -n "$pid" ]]; then kill "$pid" >/dev/null 2>&1 || true; wait "$pid" >/dev/null 2>&1 || true; fi
  done
  rm -rf "$tmp"
}
trap cleanup EXIT

subject='b2000000-0000-4000-8000-000000000001'
memory_a='b3000000-0000-4000-8000-000000000001'
memory_b='b3000000-0000-4000-8000-000000000002'
grant_a='b4000000-0000-4000-8000-000000000001'
grant_b='b4000000-0000-4000-8000-000000000002'
turn_a='b5000000-0000-4000-8000-000000000001'
turn_b='b5000000-0000-4000-8000-000000000002'

db <<SQL >/dev/null
insert into auth.users(id) values ('b1000000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at)
values ('$subject','member','b1000000-0000-4000-8000-000000000001','active',clock_timestamp(),clock_timestamp());
insert into public.characters(character_id,created_at)
values ('seyeon',clock_timestamp()) on conflict do nothing;
insert into public.memory_items(
  id,subject_id,memory_type,schema_version,content_jsonb,source_kind,
  created_by_character_id,revoked_at,created_at
) values
  ('$memory_a','$subject','shared_detail','memory-v1','{"v":"synthetic-A"}',
   'user_approved','seyeon',null,clock_timestamp()),
  ('$memory_b','$subject','shared_detail','memory-v1','{"v":"synthetic-B"}',
   'user_approved','seyeon',null,clock_timestamp());
insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,
  grant_reason,granted_at,revoked_at
) values
  ('$grant_a','$subject',null,'$memory_a','seyeon','user_choice',clock_timestamp(),null),
  ('$grant_b','$subject',null,'$memory_b','seyeon','user_choice',clock_timestamp(),null);
create schema seyeon_offline_probe;
create table seyeon_offline_probe.attempt_pins (
  attempt_id uuid primary key,
  subject_id uuid not null,
  memory_id uuid not null,
  original_grant_id uuid not null,
  memory_jsonb jsonb not null,
  state text not null default 'pinned' check (state in ('pinned','committed')),
  assistant_text text null
);
SQL

# The probe intentionally uses owner-owned, test-only functions rather than
# granting new EXECUTE privileges or touching any production migrations.
db <<'SQL' >/dev/null
create function seyeon_offline_probe.pin(
  p_subject uuid,p_attempt uuid,p_memory uuid,p_grant uuid
) returns boolean language plpgsql as $$
declare v_memory public.memory_items%rowtype;
begin
  select * into v_memory from public.memory_items
    where id=p_memory and subject_id=p_subject and revoked_at is null;
  if not found or not exists (
    select 1 from public.subjects where id=p_subject and status='active'
  ) or not exists (
    select 1 from public.record_access_grants
    where id=p_grant and subject_id=p_subject and memory_item_id=p_memory
      and grantee_character_id='seyeon' and revoked_at is null
  ) then return false; end if;
  insert into seyeon_offline_probe.attempt_pins(
    attempt_id,subject_id,memory_id,original_grant_id,memory_jsonb
  ) values (p_attempt,p_subject,p_memory,p_grant,v_memory.content_jsonb);
  return true;
end $$;

create function seyeon_offline_probe.commit(
  p_subject uuid,p_attempt uuid,p_text text
) returns boolean language plpgsql as $$
declare v_pin seyeon_offline_probe.attempt_pins%rowtype;
declare v_current jsonb;
begin
  select * into v_pin from seyeon_offline_probe.attempt_pins
    where attempt_id=p_attempt and subject_id=p_subject for update;
  if not found or v_pin.state<>'pinned' or p_text is null or p_text='' then
    return false;
  end if;
  -- Test proxy for the required same-transaction owner Grant+Record lock.
  -- The production Commit RPC still needs an owner-approved implementation.
  perform 1 from public.subjects where id=p_subject and status='active' for share;
  if not found then return false; end if;
  select content_jsonb into v_current from public.memory_items
    where id=v_pin.memory_id and subject_id=p_subject and revoked_at is null
    for share;
  if not found or v_current is distinct from v_pin.memory_jsonb then return false; end if;
  perform 1 from public.record_access_grants
    where id=v_pin.original_grant_id and subject_id=p_subject
      and memory_item_id=v_pin.memory_id
      and grantee_character_id='seyeon' and revoked_at is null for share;
  if not found then return false; end if;
  update seyeon_offline_probe.attempt_pins
    set state='committed', assistant_text=p_text
    where attempt_id=p_attempt and subject_id=p_subject;
  return true;
end $$;

create function seyeon_offline_probe.reveal(
  p_subject uuid,p_attempt uuid
) returns text language plpgsql as $$
declare v_pin seyeon_offline_probe.attempt_pins%rowtype;
declare v_payload jsonb;
begin
  select * into v_pin from seyeon_offline_probe.attempt_pins
    where attempt_id=p_attempt and subject_id=p_subject and state='committed'
    for share;
  if not found then return null; end if;
  perform 1 from public.subjects where id=p_subject and status='active' for share;
  if not found then return null; end if;
  select content_jsonb into v_payload from public.memory_items
    where id=v_pin.memory_id and subject_id=p_subject and revoked_at is null
    for share;
  if not found or v_payload is distinct from v_pin.memory_jsonb then return null; end if;
  perform 1 from public.record_access_grants
    where id=v_pin.original_grant_id and subject_id=p_subject
      and memory_item_id=v_pin.memory_id
      and grantee_character_id='seyeon' and revoked_at is null for share;
  if not found then return null; end if;
  return v_pin.assistant_text;
end $$;
SQL

[[ "$(db -c "select seyeon_offline_probe.pin('$subject','$turn_a','$memory_a','$grant_a')")" == t ]] || fail 'initial exact A pin'
[[ "$(db -c "select seyeon_offline_probe.pin('$subject','$turn_b','$memory_b','$grant_b')")" == t ]] || fail 'initial exact B pin'
[[ "$(db -c "select count(*) from seyeon_offline_probe.attempt_pins")" == 2 ]] || fail 'positive pins missing'
pass 'positive original Grant identifiers pinned before synthetic generation'

await_file() {
  local file="$1" pid="$2"
  for _ in $(seq 1 160); do
    [[ -f "$file" ]] && return 0
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.05
  done
  fail "lock-holder did not reach synchronization point: $file"
}
await_lock_wait() {
  local label="$1" pid="$2" result
  for _ in $(seq 1 160); do
    result="$(db -c "select count(*) from pg_catalog.pg_stat_activity
      where application_name='$label' and wait_event_type='Lock'")"
    [[ "$result" == 1 ]] && return 0
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.05
  done
  fail "independent PostgreSQL session did not actually block: $label"
}
finish() {
  local pid="$1" log="$2"
  if ! wait "$pid"; then cat "$log" >&2; fail "session failed: $log"; fi
}

# CASE A: revoke locks the real Grant/Memory FIRST; the candidate commit
# must wait and reject after it sees the committed revocation.
mkfifo "$tmp/revoke-release"
db >"$tmp/revoke-a.log" 2>&1 <<SQL &
set application_name='seyeon_g2_revoke_first';
set statement_timeout='15s';
begin;
select revoked_grant_count from public.cmd_revoke_memory_character_grant_v1(
  '$subject','$memory_a','seyeon');
\! touch "$tmp/revoke-locked"
\! cat "$tmp/revoke-release" > /dev/null
commit;
SQL
pid_a=$!
await_file "$tmp/revoke-locked" "$pid_a"

db >"$tmp/commit-a.log" 2>&1 <<SQL &
set application_name='seyeon_g2_commit_after_revoke';
set statement_timeout='15s';
select seyeon_offline_probe.commit('$subject','$turn_a','SYNTHETIC-A');
SQL
pid_b=$!
await_lock_wait 'seyeon_g2_commit_after_revoke' "$pid_b"
printf 'release\n' >"$tmp/revoke-release"
finish "$pid_a" "$tmp/revoke-a.log"; pid_a=''
finish "$pid_b" "$tmp/commit-a.log"; pid_b=''
grep -Fxq 'f' "$tmp/commit-a.log" || { cat "$tmp/commit-a.log" >&2; fail 'revoke-first commit not denied'; }
[[ "$(db -c "select state from seyeon_offline_probe.attempt_pins where attempt_id='$turn_a'")" == pinned ]] ||
  fail 'revoke-first wrote unauthorized assistant'
pass 'two-session revoke-first forces waiting Commit to HOLD'

# CASE B: Commit first holds the exact Grant row through its database
# transaction. Revoke must wait until Commit completes; afterward current
# rights check must suppress BOTH first reveal and replay.
mkfifo "$tmp/commit-release"
db >"$tmp/commit-b.log" 2>&1 <<SQL &
set application_name='seyeon_g2_commit_first';
set statement_timeout='15s';
begin;
select seyeon_offline_probe.commit('$subject','$turn_b','SYNTHETIC-B');
\! touch "$tmp/commit-locked"
\! cat "$tmp/commit-release" > /dev/null
commit;
SQL
pid_a=$!
await_file "$tmp/commit-locked" "$pid_a"

db >"$tmp/revoke-b.log" 2>&1 <<SQL &
set application_name='seyeon_g2_revoke_after_commit';
set statement_timeout='15s';
select revoked_grant_count from public.cmd_revoke_memory_character_grant_v1(
  '$subject','$memory_b','seyeon');
SQL
pid_b=$!
await_lock_wait 'seyeon_g2_revoke_after_commit' "$pid_b"
printf 'release\n' >"$tmp/commit-release"
finish "$pid_a" "$tmp/commit-b.log"; pid_a=''
finish "$pid_b" "$tmp/revoke-b.log"; pid_b=''
grep -Fxq 't' "$tmp/commit-b.log" || { cat "$tmp/commit-b.log" >&2; fail 'commit-first did not commit'; }
[[ "$(db -c "select state from seyeon_offline_probe.attempt_pins where attempt_id='$turn_b'")" == committed ]] ||
  fail 'commit-first did not persist'
[[ "$(db -c "select coalesce(seyeon_offline_probe.reveal('$subject','$turn_b'),'HOLD')")" == HOLD ]] ||
  fail 'committed text was revealed after revocation'
pass 'two-session commit-first blocks Revoke, later reveal/replay sees HOLD'

# CASE C: issuing a new Grant for exactly the same Memory must NOT revive
# old Attempt evidence. Neither old Commit nor replay can swap Grant IDs.
db <<SQL >/dev/null
insert into public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,
  grant_reason,granted_at,revoked_at
) values (
  'b4000000-0000-4000-8000-000000000003','$subject',null,'$memory_b',
  'seyeon','user_choice',clock_timestamp(),null);
SQL
[[ "$(db -c "select coalesce(seyeon_offline_probe.reveal('$subject','$turn_b'),'HOLD')")" == HOLD ]] ||
  fail 'different Grant ID revived old reply'
[[ "$(db -c "select seyeon_offline_probe.commit('$subject','$turn_a','FORBIDDEN')")" == f ]] ||
  fail 'old revoked source became newly commit-authorized'
[[ "$(db -c "select coalesce(seyeon_offline_probe.reveal('b2000000-0000-4000-8000-000000000099','$turn_b'),'HOLD')")" == HOLD ]] ||
  fail 'cross-Subject reveal exposed original text'
pass 'new Grant ID cannot launder old pin; cross-Subject replay is held'

# A live positive personal record remains forbidden by the existing
# production zero-only Pin; this disposable schema never touches that RPC.
[[ "$(db -c "select count(*) from pg_catalog.pg_proc
 where pronamespace='public'::regnamespace
   and proname='cmd_mark_seyeon_chat_context_ready_pinned_v1'")" == 1 ]] ||
  fail 'existing production zero-only RPC missing'
echo 'PASS: two-session exact-Grant synthetic SQL boundary against real DB revoke; NOT production G1/G2/G3 authorization'
