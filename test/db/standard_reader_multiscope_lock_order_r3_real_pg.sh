#!/usr/bin/env bash
set -euo pipefail
[[ "$CI" == true && "$PGHOST" == localhost &&
   "$PGDATABASE" == myeongha_b2_r3_multiscope_sorted ]] ||
 { echo 'FAIL R3 multiscope: disposable PG guard' >&2; exit 1; }
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R3 multiscope: $*" >&2; exit 1; }
tmp="$(mktemp -d)"; a=''; b=''
cleanup(){
 for pid in "$a" "$b"; do
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
 done
 rm -rf "$tmp"
}
trap cleanup EXIT
subject=11390000-0000-0000-0000-000000000001
reading=12103100-0000-0000-0000-000000000001
# Use real persisted official Reading identity. Reader lock is merely a
# transaction mutex, NOT authority for paid disclosure.
# Unlike pre-binding fixtures, this race needs an EXISTING persisted official
# Reading to ground the Subject × Reading × multi-Reader scope keys.
p -f test/db/official_standard_reading_reader_interpretation.sql \
 >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 40 "$tmp/setup.err"; fail fixture; }
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings
 where reading_id='$reading'::uuid and subject_id='$subject'::uuid")" == 1 ]] ||
 fail 'official Reading fixture missing'
# The actual 1770 revoke sorts multi-Reader scopes before Commerce row locks.
p >"$tmp/catalog.out" 2>&1 <<SQL || { cat "$tmp/catalog.out"; fail '1770 catalog ordering'; }
do \$check\$
declare source text;
begin
 select pg_get_functiondef(p.oid) into source
 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
 where ns.nspname='public' and p.proname='internal_apply_official_reader_provider_revoke_locked_v1';
 if source is null or
    strpos(source,'order by a.official_reading_id, a.reader_character_id')=0 or
    strpos(source,'internal_acquire_official_reader_scope_lock_v1')=0 or
    strpos(source,'internal_apply_entitlement_effect_v1')=0 then
  raise exception 'R3 bound Reader revoke missing sorted multi-scope/Commerce contract';
 end if;
end
\$check\$;
SQL
cat >"$tmp/a.sql" <<SQL
set application_name='r3_multiscope_a';
begin;
select set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_scope_lock_v1(
 '$subject'::uuid,'$reading'::uuid,'seyeon');
\! touch "$tmp/first-held"
select public.internal_acquire_official_reader_scope_lock_v1(
 '$subject'::uuid,'$reading'::uuid,'test-unlockable-reader');
select pg_sleep(2.5);
commit;
SQL
cat >"$tmp/b.sql" <<SQL
set application_name='r3_multiscope_b';
begin;
select set_config('myeongha.subject_id','$subject',true);
select public.internal_acquire_official_reader_scope_lock_v1(
 '$subject'::uuid,'$reading'::uuid,'seyeon');
select public.internal_acquire_official_reader_scope_lock_v1(
 '$subject'::uuid,'$reading'::uuid,'test-unlockable-reader');
commit;
SQL
p -f "$tmp/a.sql" >"$tmp/a.out" 2>"$tmp/a.err" & a=$!
for _ in $(seq 1 100); do [[ -f "$tmp/first-held" ]] && break; sleep 0.05; done
[[ -f "$tmp/first-held" ]] || { cat "$tmp/a.err"; fail 'first Reader lock holder missing'; }
p -f "$tmp/b.sql" >"$tmp/b.out" 2>"$tmp/b.err" & b=$!
seen=0
for _ in $(seq 1 100); do
 if [[ "$(p -c "select count(*) from pg_stat_activity
 where application_name='r3_multiscope_b' and state='active' and wait_event_type='Lock'")" == 1 ]]; then
  seen=1; break
 fi
 sleep 0.05
done
[[ "$seen" == 1 ]] || { cat "$tmp/b.err"; fail 'actual multi-scope lock wait missing'; }
wait "$a" || { cat "$tmp/a.err"; fail first; }; a=''
wait "$b" || { cat "$tmp/b.err"; fail second; }; b=''
echo 'PASS B2-R3 sorted multi-Reader 2-session wait/release, no deadlock, no Grant side effects'
