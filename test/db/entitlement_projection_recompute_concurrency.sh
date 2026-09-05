#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000911'),
  ('00000000-0000-0000-0000-000000000912')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values
  ('91000000-0000-0000-0000-000000000001', 'member', '00000000-0000-0000-0000-000000000911', 'active', now(), now()),
  ('91000000-0000-0000-0000-000000000002', 'member', '00000000-0000-0000-0000-000000000912', 'active', now(), now());

insert into public.entitlement_grants(
  id, subject_id, entitlement_key, scope_key, grant_key, grant_source_type,
  status, valid_from, valid_until, revision, created_at, updated_at
) values
  ('91100000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'race.first-insert', null, 'system:first-a', 'system', 'active', now() - interval '1 day', now() + interval '30 days', 0, now(), now()),
  ('91100000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001', 'race.first-insert', null, 'system:first-b', 'system', 'active', now() - interval '1 day', now() + interval '7 days', 0, now(), now()),
  ('91100000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000002', 'race.material', null, 'system:material-a', 'system', 'active', now() - interval '1 day', now() + interval '30 days', 0, now(), now()),
  ('91100000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000002', 'race.material', null, 'system:material-b', 'system', 'active', now() - interval '1 day', now() + interval '7 days', 0, now(), now());
SQL

# Two first recomputes race on the same absent logical projection. The unique constraint
# must arbitrate one insert and the loser must resolve/re-read the winner successfully.
first_sql="set statement_timeout='5s'; select projection_changed from public.internal_recompute_entitlement_projection_v1('91000000-0000-0000-0000-000000000001','race.first-insert',null);"
"${psql_base[@]}" -Atc "$first_sql" >"$tmpdir/first-a.out" 2>"$tmpdir/first-a.err" &
pid_a=$!
"${psql_base[@]}" -Atc "$first_sql" >"$tmpdir/first-b.out" 2>"$tmpdir/first-b.err" &
pid_b=$!

if ! wait "$pid_a"; then cat "$tmpdir/first-a.err" >&2; fail "concurrent first recompute A failed"; fi
if ! wait "$pid_b"; then cat "$tmpdir/first-b.err" >&2; fail "concurrent first recompute B failed"; fi

first_count="$("${psql_base[@]}" -Atc "select count(*) from public.entitlements where subject_id='91000000-0000-0000-0000-000000000001' and entitlement_key='race.first-insert' and scope_key_norm='__GLOBAL__';")"
[[ "$first_count" == "1" ]] || fail "concurrent first recompute created $first_count projection rows"

first_tuple="$("${psql_base[@]}" -At -F '|' -c "select status,active_grant_count,revision from public.entitlements where subject_id='91000000-0000-0000-0000-000000000001' and entitlement_key='race.first-insert' and scope_key_norm='__GLOBAL__';")"
[[ "$first_tuple" == "active|2|0" ]] || fail "concurrent first projection tuple mismatch: $first_tuple"
pass "concurrent first recompute produces one revision-0 projection"

# Seed a second projection, then mutate different independent Grants concurrently. Each
# transaction locks only its own Grant before recompute; the projection row must serialize
# the aggregate without a cross-Grant deadlock. The second committer must observe both
# committed effects and leave the final projection inactive at revision 2.
"${psql_base[@]}" -Atc "select projection_changed from public.internal_recompute_entitlement_projection_v1('91000000-0000-0000-0000-000000000002','race.material',null);" >/dev/null

cat >"$tmpdir/material-a.sql" <<'SQL'
set statement_timeout='5s';
begin;
update public.entitlement_grants
set status='revoked', revision=revision+1, updated_at=transaction_timestamp()
where id='91100000-0000-0000-0000-000000000003';
select projection_changed
from public.internal_recompute_entitlement_projection_v1(
  '91000000-0000-0000-0000-000000000002','race.material',null
);
select pg_sleep(1);
commit;
SQL

cat >"$tmpdir/material-b.sql" <<'SQL'
set statement_timeout='5s';
begin;
update public.entitlement_grants
set status='revoked', revision=revision+1, updated_at=transaction_timestamp()
where id='91100000-0000-0000-0000-000000000004';
select projection_changed
from public.internal_recompute_entitlement_projection_v1(
  '91000000-0000-0000-0000-000000000002','race.material',null
);
commit;
SQL

"${psql_base[@]}" -f "$tmpdir/material-a.sql" >"$tmpdir/material-a.out" 2>"$tmpdir/material-a.err" &
pid_a=$!
sleep 0.2
"${psql_base[@]}" -f "$tmpdir/material-b.sql" >"$tmpdir/material-b.out" 2>"$tmpdir/material-b.err" &
pid_b=$!

if ! wait "$pid_a"; then cat "$tmpdir/material-a.err" >&2; fail "serialized material recompute A failed"; fi
if ! wait "$pid_b"; then cat "$tmpdir/material-b.err" >&2; fail "serialized material recompute B failed"; fi

material_tuple="$("${psql_base[@]}" -At -F '|' -c "select status,active_grant_count,effective_valid_until is null,revision from public.entitlements where subject_id='91000000-0000-0000-0000-000000000002' and entitlement_key='race.material' and scope_key_norm='__GLOBAL__';")"
[[ "$material_tuple" == "inactive|0|t|2" ]] || fail "serialized material projection tuple mismatch: $material_tuple"
pass "different-Grant concurrent mutations serialize through projection without stale final aggregate"

echo "entitlement projection recompute concurrency tests passed"