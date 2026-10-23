import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) =>
  readFileSync(new URL('../' + path, import.meta.url), 'utf8');

describe('C08-J: two real PG17 backends, deterministic first-turn census recheck', () => {
  it('places the concurrent writer between first valid census and the existing tombstone regression', () => {
    const main = read('test/db/seyeon_c08_first_turn_local_pg17.sh');
    const race = read('test/db/seyeon_c08_two_session_census_race_pg17.sh');
    const first = main.indexOf('PASS_C08_PG17_ONE_REAL_MESSAGE_CURRENT_USER');
    const second = main.indexOf('bash test/db/seyeon_c08_two_session_census_race_pg17.sh');
    const third = main.indexOf('PASS_C08_PG17_REDACTED_HISTORY_COUNTS_AS_SECOND_MESSAGE');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    expect(main).not.toContain('SYNTHETIC_NEVER_REVEAL');
    expect(race).toContain('SYNTHETIC_NEVER_REVEAL');
    expect(race).toContain('PASS_C08J_TWO_PG17_BACKENDS_READ_COMMITTED_RECHECK_BLOCKS_STALE_FIRST_CONTACT');
  });

  it('uses one read-committed reader transaction and a distinct committing writer backend', () => {
    const race = read('test/db/seyeon_c08_two_session_census_race_pg17.sh');
    expect(race).toContain('BEGIN ISOLATION LEVEL READ COMMITTED;');
    expect(race).toContain('SET LOCAL ROLE myeongha_api_executor;');
    expect(race).toContain('begin_member_subject_context_v1');
    expect(race).toContain('pg_backend_pid()');
    expect(race).toContain('reader_backend');
    expect(race).toContain('writer_backend');
    expect(race).toContain('"$reader_backend" != "$writer_backend"');
    expect(race).toContain('touch "$race_dir/writer_committed"');
    expect(race).toContain('reader_ready');
    expect(race).toContain('timeout 20 sh -c');
    expect(race).toContain('with authorized_thread as materialized (');
    expect(race).toContain('first_two_messages as materialized');
    expect(race).toContain('order by m.sequence_no asc limit 2');
    expect(race).toContain('active|seyeon|1|t');
    expect(race).toContain('active|seyeon|2|f');
    expect(race).toContain('COMMIT;');
    expect(race).toContain('ROLLBACK;');
    expect(race).not.toContain('pg_sleep(');
  });

  it('keeps the two-session fixture confined to disposable PostgreSQL 17 with bounded waits', () => {
    const race = read('test/db/seyeon_c08_two_session_census_race_pg17.sh');
    const cases = read('test/db/run_ci_case.sh');
    const suites = JSON.parse(read('scripts/ci/db-suites.json')) as {
      postgres17: { cases: string[] };
    };
    expect(suites.postgres17.cases).toContain('seyeon-c08-first-turn-local-pg17');
    expect(cases).toContain('seyeon-c08-first-turn-local-pg17)');
    expect(race).toContain('myeongha_c08_local_case_1');
    expect(race).toContain('GITHUB_ACTIONS');
    expect(race).toContain('DB_SUITE');
    expect(race).toContain('myeongha_ci_case_');
    expect(race).toContain('timeout 30 psql');
    expect(race).toContain('timeout 20 sh');
    expect(race).toContain('trap cleanup EXIT');
    expect(race).not.toContain('OPENAI_API_KEY');
    expect(race).not.toContain('DATABASE_URL');
    expect(race).not.toContain('GRANT SELECT');
  });
});
