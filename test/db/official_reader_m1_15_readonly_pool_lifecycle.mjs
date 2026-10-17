#!/usr/bin/env node
import { spawn } from 'node:child_process';

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
  'only disposable localhost CI PostgreSQL');

const child = spawn('psql', [
  '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=0', '-v', 'VERBOSITY=verbose',
], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, PGAPPNAME: 'myeongha_m1_15_same_backend_lease' },
});
let stdout = '';
let stderr = '';
let exited = false;
child.stdout.on('data', value => { stdout += value.toString('utf8'); });
child.stderr.on('data', value => { stderr += value.toString('utf8'); });
const finished = new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', code => { exited = true; resolve(code); });
});
const watchdog = setTimeout(() => {
  if (!exited) child.kill('SIGKILL');
}, 15000);
function until(marker) {
  return new Promise((resolve, reject) => {
    const alarm = setTimeout(() => {
      clearInterval(tick);
      reject(new Error('M1-15 marker timeout ' + marker + ' | ' + stdout + stderr));
    }, 8000);
    const tick = setInterval(() => {
      if (stdout.includes(marker)) {
        clearTimeout(alarm);
        clearInterval(tick);
        resolve();
      } else if (exited) {
        clearTimeout(alarm);
        clearInterval(tick);
        reject(new Error('M1-15 psql terminated: ' + stderr));
      }
    }, 15);
  });
}
function lastLine(marker) {
  const rows = stdout.split(/\r?\n/u).filter(row => row.startsWith(marker + '|'));
  must(rows.length === 1, 'expected one ' + marker + ', got ' + stdout);
  return rows[0].split('|');
}
async function main() {
  try {
    // Emulate a poorly returned pooled lease: keep an old RR transaction open
    // on exactly ONE persistent PostgreSQL backend.
    child.stdin.write([
      'begin transaction isolation level repeatable read read only;',
      "select 'M115_DIRTY',pg_backend_pid()," +
      "pg_catalog.current_setting('transaction_isolation');",
    ].join('\n') + '\n');
    await until('M115_DIRTY|');
    const dirty = lastLine('M115_DIRTY');
    must(dirty.length === 3 && /^\d+$/u.test(dirty[1]) &&
      dirty[2] === 'repeatable read', 'initial stale RR session was not established');
    const pid = dirty[1];

    // The equivalent M1-15 adapter reset must clear the previous snapshot.
    // Existing authenticated app role MUST NOT have either private D2 Writer.
    child.stdin.write([
      'rollback;',
      'begin transaction isolation level read committed read only;',
      'set local role myeongha_api_executor;',
      "select 'M115_CLEAN',pg_backend_pid(),current_user," +
      "pg_catalog.current_setting('transaction_isolation')," +
      "pg_catalog.current_setting('transaction_read_only')," +
      "has_function_privilege(current_user," +
      "'public.internal_apply_official_reader_unified_receipt_v1(" +
      "uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[])'," +
      "'EXECUTE')," +
      "has_function_privilege(current_user," +
      "'public.internal_cmd_bind_official_reader_unified_v1(" +
      "uuid,uuid,uuid,uuid,text,text,jsonb)','EXECUTE');",
      'commit;',
      "select 'M115_POST_COMMIT',pg_backend_pid(),current_user," +
      "pg_catalog.current_setting('transaction_isolation')," +
      "pg_catalog.current_setting('transaction_read_only');",
    ].join('\n') + '\n');
    await until('M115_POST_COMMIT|');
    const clean = lastLine('M115_CLEAN');
    must(clean.length === 7 && clean[1] === pid &&
      clean[2] === 'myeongha_api_executor' &&
      clean[3] === 'read committed' && clean[4] === 'on' &&
      clean[5] === 'f' && clean[6] === 'f',
      'reset+BEGIN+SET LOCAL did not result in narrow read-only app role: ' +
      clean.join('|'));
    const afterCommit = lastLine('M115_POST_COMMIT');
    must(afterCommit.length === 5 && afterCommit[1] === pid &&
      afterCommit[2] === 'postgres' && afterCommit[3] === 'read committed' &&
      afterCommit[4] === 'off',
      'COMMIT did not clear role/read-only state on same backend: ' +
      afterCommit.join('|'));
    console.log('PASS M1-15: same PostgreSQL backend resets inherited RR snapshot and runs READ COMMITTED READ ONLY API role with both private D2 EXECUTEs denied');

    // Query callback crashes in same persistent backend. Verify the transaction
    // is ROLLBACKed, role resets and a subsequent lease is usable.
    child.stdin.end([
      'rollback;',
      'begin transaction isolation level read committed read only;',
      'set local role myeongha_api_executor;',
      'select 1/0;',
      'rollback;',
      "select 'M115_POST_ERROR',pg_backend_pid(),current_user," +
      "pg_catalog.current_setting('transaction_isolation')," +
      "pg_catalog.current_setting('transaction_read_only');",
    ].join('\n') + '\n');
    const exitCode = await finished;
    must(exitCode === 0, 'psql did not survive intended statement fault: ' + stderr);
    must(stderr.includes('22012') && stderr.includes('division by zero'),
      'did not hit the expected real PostgreSQL 22012 query failure');
    const afterError = lastLine('M115_POST_ERROR');
    must(afterError.length === 5 && afterError[1] === pid &&
      afterError[2] === 'postgres' &&
      afterError[3] === 'read committed' && afterError[4] === 'off',
      'ROLLBACK failed to reset aborted read-only session and app role: ' +
      afterError.join('|'));
    console.log('PASS M1-15: PostgreSQL 22012 callback fault is rolled back and original backend has no sticky role, read-only state or aborted transaction');
    console.log('HOLD M1-15: local fixture owner only; production pool credentials, Reader ACL, private issuer and paid T2 remain unapproved');
  } finally {
    clearTimeout(watchdog);
    if (!exited) {
      child.stdin.destroy();
      child.kill('SIGKILL');
      await finished.catch(() => undefined);
    }
  }
}
main().catch(error => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
