#!/usr/bin/env bash
# Two concurrent PostgreSQL sessions; NO Production commit code is invoked.
set -euo pipefail

psql -X -v ON_ERROR_STOP=1 -f test/db/seyeon_atomic_memory_grant_race_fixture_v1.sql >/dev/null
race_dir="$(mktemp -d)"
guard_pid=""

cleanup() {
  if [[ -n "${guard_pid}" ]]; then
    kill "${guard_pid}" 2>/dev/null || true
    wait "${guard_pid}" 2>/dev/null || true
  fi
  psql -X -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL' || true
DROP FUNCTION IF EXISTS public.__ci_seyeon_memory_grant_lock_probe_v1(uuid,uuid,uuid);
DELETE FROM public.record_access_grants
WHERE subject_id = 'b9200000-0000-4000-8000-000000000001';
DELETE FROM public.memory_items
WHERE subject_id = 'b9200000-0000-4000-8000-000000000001';
DELETE FROM public.subjects WHERE id = 'b9200000-0000-4000-8000-000000000001';
DELETE FROM auth.users WHERE id = 'b9100000-0000-4000-8000-000000000001';
SQL
  rm -rf "${race_dir}"
}
trap cleanup EXIT

# Session A: simulate atomic Commit authorization: lock exact Grant+Memory
# rows and retain those locks UNTIL the transaction's Commit.
cat > "${race_dir}/lock.sql" <<'SQL'
BEGIN;
SET LOCAL ROLE myeongha_api_executor;
SELECT pg_catalog.set_config(
  'myeongha.subject_id','b9200000-0000-4000-8000-000000000001',true
);
DO $$
BEGIN
  IF NOT public.__ci_seyeon_memory_grant_lock_probe_v1(
    'b9200000-0000-4000-8000-000000000001',
    'b9300000-0000-4000-8000-000000000001',
    'b9400000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Initially active exact grant must pass the test-only lock probe';
  END IF;
END
$$;
SQL
printf '\\! touch "%s/lock-acquired"\n' "${race_dir}" >> "${race_dir}/lock.sql"
cat >> "${race_dir}/lock.sql" <<'SQL'
-- Give session B time to race a revoke while Commit still holds row locks.
SELECT pg_sleep(8);
COMMIT;
SQL

psql -X -v ON_ERROR_STOP=1 -f "${race_dir}/lock.sql" > "${race_dir}/lock.log" 2>&1 &
guard_pid="$!"

locked=""
for _ in $(seq 1 140); do
  if [[ -f "${race_dir}/lock-acquired" ]]; then
    locked="yes"
    break
  fi
  if ! kill -0 "${guard_pid}" 2>/dev/null; then
    cat "${race_dir}/lock.log" >&2
    echo "Atomic-grant session ended before the lock was acquired" >&2
    exit 1
  fi
  sleep 0.05
done
if [[ "${locked}" != "yes" ]]; then
  cat "${race_dir}/lock.log" >&2
  echo "Atomic-grant session did not acquire row locks" >&2
  exit 1
fi

# Session B: both the Grant and referenced Memory revocations MUST block.
if psql -X -v ON_ERROR_STOP=1 -c "
  SET lock_timeout = '600ms';
  UPDATE public.record_access_grants
  SET revoked_at = clock_timestamp()
  WHERE id = 'b9400000-0000-4000-8000-000000000001';
" > "${race_dir}/grant-revoke.log" 2>&1; then
  echo "Grant revoke crossed the simulated atomic Commit gate" >&2
  exit 1
fi
grep -q 'lock timeout' "${race_dir}/grant-revoke.log" || {
  cat "${race_dir}/grant-revoke.log" >&2
  echo "Grant revoke failed for a reason other than row lock contention" >&2
  exit 1
}

if psql -X -v ON_ERROR_STOP=1 -c "
  SET lock_timeout = '600ms';
  UPDATE public.memory_items
  SET revoked_at = clock_timestamp()
  WHERE id = 'b9300000-0000-4000-8000-000000000001';
" > "${race_dir}/memory-revoke.log" 2>&1; then
  echo "Memory revoke crossed the simulated atomic Commit gate" >&2
  exit 1
fi
grep -q 'lock timeout' "${race_dir}/memory-revoke.log" || {
  cat "${race_dir}/memory-revoke.log" >&2
  echo "Memory revoke failed for a reason other than row lock contention" >&2
  exit 1
}

wait "${guard_pid}"
guard_pid=""
echo "DB Commit fence proof: both concurrent revocations blocked until Commit" 

# Revoke is allowed after the Commit linearization point. The next read must
# reject the pinned Grant even if a replacement Grant is later created.
psql -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
UPDATE public.record_access_grants SET revoked_at = clock_timestamp()
WHERE id = 'b9400000-0000-4000-8000-000000000001';
INSERT INTO public.record_access_grants(
  id,subject_id,life_fact_id,memory_item_id,grantee_character_id,
  grant_reason,granted_at,revoked_at
) VALUES (
  'b9400000-0000-4000-8000-000000000002',
  'b9200000-0000-4000-8000-000000000001',
  null,'b9300000-0000-4000-8000-000000000001',
  'seyeon','user_choice',clock_timestamp(),null
);
BEGIN;
SET LOCAL ROLE myeongha_api_executor;
SELECT pg_catalog.set_config(
  'myeongha.subject_id','b9200000-0000-4000-8000-000000000001',true
);
DO $$
BEGIN
  IF public.__ci_seyeon_memory_grant_lock_probe_v1(
    'b9200000-0000-4000-8000-000000000001',
    'b9300000-0000-4000-8000-000000000001',
    'b9400000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Revoked original Grant must not authorize a replay';
  END IF;
  IF NOT public.__ci_seyeon_memory_grant_lock_probe_v1(
    'b9200000-0000-4000-8000-000000000001',
    'b9300000-0000-4000-8000-000000000001',
    'b9400000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'Current replacement Grant should be distinguishable from original';
  END IF;
END
$$;
COMMIT;
UPDATE public.memory_items SET revoked_at = clock_timestamp()
WHERE id = 'b9300000-0000-4000-8000-000000000001';
BEGIN;
SET LOCAL ROLE myeongha_api_executor;
SELECT pg_catalog.set_config(
  'myeongha.subject_id','b9200000-0000-4000-8000-000000000001',true
);
DO $$
BEGIN
  IF public.__ci_seyeon_memory_grant_lock_probe_v1(
    'b9200000-0000-4000-8000-000000000001',
    'b9300000-0000-4000-8000-000000000001',
    'b9400000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'Revoked Memory must not authorize any current Grant';
  END IF;
END
$$;
COMMIT;
SQL

echo "DB fresh-read proof: revoked Grant and Memory fail closed; regrant is not replay"
