#!/usr/bin/env node
import pg from 'pg';

const db = process.env.PGDATABASE ?? '';
const ci = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const dbAllowed = db === 'myeongha_test' ||
  db === 'myeongha_official_standard_reader_interpretation_test' ||
  /^myeongha_ci_case_[a-zA-Z0-9_]+$/u.test(db);
function must(yes, message) {
  if (!yes) throw new Error('FAIL M1-15: ' + message);
}
must(ci && process.env.PGHOST === 'localhost' &&
  process.env.PGUSER === 'postgres' && dbAllowed,
  'only disposable localhost CI PostgreSQL can run lifecycle tests');

const pool = new pg.Pool({ max: 1, ssl: false });
const reset = 'ROLLBACK';
const begin = 'BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY';
const role = 'SET LOCAL ROLE myeongha_api_executor';

async function run() {
  let lastPid = null;
  try {
    // Simulate a caller that improperly returned a connection with a live,
    // pinned REPEATABLE READ transaction. The M1-15 adapter's acquisition
    // RESET must make that exact connection safe again.
    const dirty = await pool.connect();
    try {
      await dirty.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const evidence = await dirty.query(
        "select pg_catalog.current_setting('transaction_isolation') as isolation," +
        " current_user as actor,pg_backend_pid() as pid");
      must(evidence.rows.length === 1 &&
        evidence.rows[0].isolation === 'repeatable read',
        'did not establish an old MVCC snapshot');
      lastPid = evidence.rows[0].pid;
    } finally {
      // Deliberately leave an open read-only transaction on pool return.
      dirty.release();
    }

    const recovered = await pool.connect();
    try {
      const pid = await recovered.query('select pg_backend_pid() as pid');
      must(pid.rows[0].pid === lastPid, 'single-connection pool was not reused');

      await recovered.query(reset);
      await recovered.query(begin);
      await recovered.query(role);
      const state = await recovered.query(
        "select pg_catalog.current_setting('transaction_isolation') as isolation," +
        " pg_catalog.current_setting('transaction_read_only') as read_only," +
        " current_user as actor,session_user as login," +
        " has_function_privilege(current_user," +
        " 'public.internal_apply_official_reader_unified_receipt_v1(" +
        "uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[])'," +
        " 'EXECUTE') as issuer," +
        " has_function_privilege(current_user," +
        " 'public.internal_cmd_bind_official_reader_unified_v1(" +
        "uuid,uuid,uuid,uuid,text,text,jsonb)','EXECUTE') as binder"
      );
      must(state.rows.length === 1 &&
        state.rows[0].isolation === 'read committed' &&
        state.rows[0].read_only === 'on' &&
        state.rows[0].actor === 'myeongha_api_executor' &&
        state.rows[0].issuer === false &&
        state.rows[0].binder === false,
        'owned read-only API role did not reset old snapshot or lacks D2 writer denial');
      await recovered.query('COMMIT');
      console.log('PASS M1-15: reused PG15 connection drops inherited RR transaction and opens READ COMMITTED READ ONLY under API role without D2 Writer rights');
    } finally {
      recovered.release();
    }

    // Explicitly exercise a query error on the same physical connection.
    // ROLLBACK must clear aborted transaction and the SET LOCAL role.
    const failure = await pool.connect();
    try {
      await failure.query(reset);
      await failure.query(begin);
      await failure.query(role);
      let errorCode = null;
      try {
        await failure.query('select 1/0');
      } catch (error) {
        errorCode = error.code;
      }
      must(errorCode === '22012', 'expected real PG division-by-zero callback fault');
      await failure.query(reset);
    } finally {
      failure.release();
    }

    const next = await pool.connect();
    try {
      const state = await next.query(
        "select pg_backend_pid() as pid,current_user as actor," +
        "pg_catalog.current_setting('transaction_isolation') as isolation," +
        "pg_catalog.current_setting('transaction_read_only') as read_only");
      must(state.rows[0].pid === lastPid &&
        state.rows[0].actor === 'postgres' &&
        state.rows[0].isolation === 'read committed' &&
        state.rows[0].read_only === 'off',
        'query failure carried aborted transaction, stale role or READ ONLY into next lease');
      console.log('PASS M1-15: PostgreSQL callback error rolls back, resets transaction-local role and read-only state on subsequent pool lease');
    } finally {
      next.release();
    }
    console.log('HOLD M1-15: this physical pool test is owner-only CI; no new production connection credential, GRANT or private Writer runtime');
  } finally {
    await pool.end();
  }
}
run().catch(error => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
