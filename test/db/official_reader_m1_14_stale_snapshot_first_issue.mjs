#!/usr/bin/env node
import { spawn, execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [receipt, subject, intent, session, proposal, official] = process.argv.slice(2);
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u;
const db = process.env.PGDATABASE ?? '';
const allowedDb = db === 'myeongha_test' ||
  db === 'myeongha_official_standard_reader_interpretation_test' ||
  /^myeongha_ci_case_[a-zA-Z0-9_]+$/u.test(db);

function check(value, why) {
  if (!value) throw new Error('FAIL M1-14: ' + why);
}

check((process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') &&
  process.env.PGHOST === 'localhost' && process.env.PGUSER === 'postgres' &&
  allowedDb && /^\d+$/u.test(process.env.PGPORT ?? '5432'),
  'only disposable localhost CI postgres-owned PostgreSQL database may run');
check([receipt, subject, intent, session, proposal, official].every(v =>
  typeof v === 'string' && uuid.test(v)), 'six exact fixture UUIDs required');

const ts = readFileSync(
  'apps/api/src/official-reader-unknown-commit-reconciliation-v1.ts', 'utf8');
const startToken = 'const UNKNOWN_COMMIT_READ_SQL = ' + String.fromCharCode(96);
const startIndex = ts.indexOf(startToken);
check(startIndex >= 0, 'actual M1-10 TypeScript SELECT was not found');
const start = startIndex + startToken.length;
const end = ts.indexOf(String.fromCharCode(96) + '.trim();', start);
check(end > start, 'exact TypeScript SELECT was not terminated');
const readSql = ts.slice(start, end);

function runSql(sql) {
  return execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, timeout: 13000, encoding: 'utf8' }).trim();
}

function oneRow(output, marker) {
  const rows = output.split(/\r?\n/u).filter(s => s.startsWith(receipt + '|'));
  check(rows.length === 1,
    marker + ': expected exactly one source row, got ' + output);
  const columns = rows[0].split('|');
  check(columns.length === 31 && columns[0] === receipt &&
    columns[1] === subject && columns[2] === intent &&
    columns[3] === 'test-reader-unit' && columns[24] === '1',
    marker + ': canonical Receipt/Subject/Intent/Capability drift: ' + rows[0]);
  return columns;
}

function absent(row, isolation, marker) {
  check(row[30] === isolation &&
    row[4] === '' && row[9] === '' && row[16] === '' &&
    row[25] === '0' && row[26] === '0' && row[27] === '0' &&
    row[28] === '0' && row[29] === '0',
  marker + ': current source query did not observe the expected no-effects view: ' +
  row.join('|'));
}

function committed(row, grant, marker) {
  check(row[30] === 'read committed' && row[4] === grant &&
    row[5] === 'active' && row[6] === 't' &&
    row[25] === '1' && row[26] === '1' && row[27] === '0' &&
    row[28] === '1' && ['0', '1'].includes(row[29]) &&
    row[15] === grant && row[16] === official,
    marker + ': exact newly-committed Grant/Event/Reader not visible: ' +
    row.join('|'));
}

const observer = spawn('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'],
  { stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PGAPPNAME: 'myeongha_m1_14_old_mvcc_observer' } });
let observedOutput = '';
let observerError = '';
let observerExited = false;
observer.stdout.on('data', data => { observedOutput += data.toString('utf8'); });
observer.stderr.on('data', data => { observerError += data.toString('utf8'); });
const finished = new Promise((resolve, reject) => {
  observer.once('error', reject);
  observer.once('close', code => {
    observerExited = true;
    resolve(code);
  });
});
const safety = setTimeout(() => {
  if (!observerExited) observer.kill('SIGKILL');
}, 25000);

function until(marker) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      clearInterval(poll);
      reject(new Error('observer marker timeout ' + marker + ': ' +
        observedOutput + ' :: ' + observerError));
    }, 10000);
    const poll = setInterval(() => {
      if (observedOutput.includes(marker)) {
        clearInterval(poll);
        clearTimeout(deadline);
        resolve();
      } else if (observerExited) {
        clearInterval(poll);
        clearTimeout(deadline);
        reject(new Error('observer exited early: ' + observerError));
      }
    }, 15);
  });
}

function firstIssue() {
  return new Promise((resolve, reject) => {
    execFile(process.execPath,
      ['test/db/official_reader_m1_12_first_issuance_commit_ack_drop_proxy.mjs',
        receipt, subject, intent, session, proposal, official],
      { encoding: 'utf8', timeout: 19000 }, (err, output, stderr) => {
        if (err) {
          reject(new Error('M1-12 first-issue TCP COMMIT fault failed: ' +
            String(err) + '\n' + stderr + '\n' + output));
          return;
        }
        resolve({ output, stderr });
      });
  });
}

async function main() {
  try {
    observer.stdin.write([
      'begin transaction isolation level repeatable read read only;',
      'prepare m114_read(uuid) as',
      readSql + ';',
      "select 'M114_OBSERVER_PID',pg_backend_pid();",
      "execute m114_read('" + receipt + "'::uuid);",
      "select 'M114_FIRST_SNAPSHOT_DONE';",
    ].join('\n') + '\n');
    await until('M114_FIRST_SNAPSHOT_DONE');
    const initial = oneRow(observedOutput, 'before writer COMMIT');
    absent(initial, 'repeatable read', 'before writer COMMIT');
    const backend = observedOutput.match(/M114_OBSERVER_PID\|(\d+)/u);
    check(backend !== null, 'reader snapshot backend PID unavailable');
    const pid = Number(backend[1]);
    check(runSql('select state from pg_catalog.pg_stat_activity where pid=' +
      pid) === 'idle in transaction',
      'old RR snapshot must remain open BEFORE writer COMMIT');

    // The *other* connection executes M1-12's proven real TCP ACK loss at
    // FIRST ISSUE. The server commits; the issuer psql gets no COMMIT ACK.
    const { output, stderr } = await firstIssue();
    check(stderr.includes(
      'PASS M1-12: backend committed FIRST private D2 issuance+Reader bind'),
      'must see server-side successful first issue before the ACK was dropped');
    check(stderr.includes(
      'PASS M1-12: psql observed an actual broken connection'),
      'the first issuing client did not observe a lost COMMIT ACK');
    const issue = output.match(/(?:^|\n)ISSUE\|([0-9a-f-]{36})\|f(?:\n|$)/u);
    check(issue !== null && uuid.test(issue[1]),
      'fresh DB read must return new FIRST grant, never just psql success');
    const grant = issue[1];
    check(output.includes('BIND|' + official + '|' + grant +
      '|additional_reader|f'), 'fresh DB read lost bound Reader identity');

    // A fresh READ COMMITTED snapshot DOES see that committed purchase,
    // while the old REPEATABLE READ observer stays pinned to pre-COMMIT.
    const fresh = oneRow(runSql([
      'begin transaction isolation level read committed read only;',
      'prepare m114_current(uuid) as',
      readSql + ';',
      "execute m114_current('" + receipt + "'::uuid);",
      'commit;',
    ].join('\n') + '\n'), 'new session after commit');
    committed(fresh, grant, 'new session after commit');

    const offset = observedOutput.length;
    observer.stdin.write([
      "execute m114_read('" + receipt + "'::uuid);",
      "select 'M114_OLD_SNAPSHOT_AFTER_COMMIT';",
    ].join('\n') + '\n');
    await until('M114_OLD_SNAPSHOT_AFTER_COMMIT');
    const stale = oneRow(observedOutput.slice(offset), 'old session after COMMIT');
    absent(stale, 'repeatable read', 'old session after COMMIT');
    check(runSql('select state from pg_catalog.pg_stat_activity where pid=' +
      pid) === 'idle in transaction',
      'old snapshot must still be open while newer committed right exists');
    console.error('PASS M1-14: first D2 Grant/Reader COMMIT succeeded while existing REPEATABLE READ observer stayed on earlier snapshot with zero visible rights');
    console.error('PASS M1-14: fresh READ COMMITTED source query sees exactly one committed Grant/Event/Reader while old same-session snapshot still sees none; stale observation must HOLD');

    // Closing the snapshot, then starting a NEW READ COMMITTED statement in
    // the same backend, must observe the committed identity. No Writer call.
    const nextOffset = observedOutput.length;
    observer.stdin.end([
      'commit;',
      'begin transaction isolation level read committed read only;',
      "execute m114_read('" + receipt + "'::uuid);",
      "select 'M114_REFRESHED_SNAPSHOT';",
      'commit;',
    ].join('\n') + '\n');
    await until('M114_REFRESHED_SNAPSHOT');
    const renewed = oneRow(observedOutput.slice(nextOffset), 'renewed observer');
    committed(renewed, grant, 'renewed observer');
    const exitCode = await finished;
    check(exitCode === 0, 'reader did not close cleanly: ' + observerError);
    console.error('PASS M1-14: closing stale transaction and beginning fresh READ COMMITTED read resolves original Grant without minting duplicate rights');
    console.error('HOLD M1-14: runtime classifier denies REPEATABLE READ/SERIALIZABLE snapshots; neither visible absence nor refreshed receipt permits automatic issue/public T2');

    // Preserve the existing fixture contract for M1-03/M1-06/M1-10/M1-11.
    process.stdout.write(output);
  } finally {
    clearTimeout(safety);
    if (!observerExited) {
      observer.stdin.destroy();
      observer.kill('SIGKILL');
      await finished.catch(() => undefined);
    }
  }
}

main().catch(error => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
