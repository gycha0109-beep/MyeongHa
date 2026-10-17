#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';

const [receipt, subject, intent, session, proposal, official] = process.argv.slice(2);
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u;
const db = process.env.PGDATABASE ?? '';
const ci = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const dbAllowed = db === 'myeongha_test' ||
  db === 'myeongha_official_standard_reader_interpretation_test' ||
  /^myeongha_ci_case_[a-zA-Z0-9_]+$/u.test(db);

function check(condition, why) {
  if (!condition) throw new Error('FAIL M1-13: ' + why);
}
check(ci && process.env.PGHOST === 'localhost' &&
  process.env.PGUSER === 'postgres' && dbAllowed &&
  /^\d+$/u.test(process.env.PGPORT ?? '5432'),
  'only isolated localhost PostgreSQL CI postgres-owner fixture is allowed');
check([receipt, subject, intent, session, proposal, official].every(x =>
  typeof x === 'string' && uuid.test(x)), 'six fixture UUIDs required');

function dbRead(sql) {
  return execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    { timeout: 12000, encoding: 'utf8' }).trim();
}
function receiptSnapshot() {
  return dbRead(
    "select concat_ws('|'," +
    "(select count(*) from public.commerce_receipts" +
    " where id='" + receipt + "'::uuid and subject_id='" + subject + "'::uuid" +
    " and purchase_intent_id='" + intent + "'::uuid" +
    " and verification_status='verified' and environment='production')," +
    "(select count(*) from public.entitlement_grants" +
    " where source_receipt_id='" + receipt + "'::uuid)," +
    "(select count(*) from public.entitlement_events" +
    " where source_type='receipt' and source_receipt_id='" + receipt + "'::uuid)," +
    "(select count(*) from public.standard_reading_reader_access_grants" +
    " where purchase_intent_id='" + intent + "'::uuid)," +
    "(select count(*) from public.outbox_events ob" +
    " join public.entitlement_events e on e.event_dedupe_key=ob.dedupe_key" +
    " where e.source_type='receipt' and e.source_receipt_id='" + receipt + "'::uuid" +
    " and ob.aggregate_type='entitlement'))"
  );
}

const before = receiptSnapshot();
check(before === '1|0|0|0|0',
  'precondition requires persisted 1050 Receipt and zero committed D2 effects: ' + before);
check(dbRead("select count(*) from public.standard_reading_official_bindings" +
  " where reading_id='" + official + "'::uuid and subject_id='" + subject + "'::uuid") === '1',
  'existing original Official Reading binding missing');

const writer = spawn('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'],
  { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PGAPPNAME: 'myeongha_m1_13_inflight_writer' } });
let stdout = '';
let stderr = '';
let exited = false;
let exitCode = null;
writer.stdout.on('data', b => { stdout += b.toString('utf8'); });
writer.stderr.on('data', b => { stderr += b.toString('utf8'); });
const complete = new Promise((resolve, reject) => {
  writer.once('error', reject);
  writer.once('close', code => {
    exited = true;
    exitCode = code;
    resolve(code);
  });
});
const safety = setTimeout(() => { if (!exited) writer.kill('SIGKILL'); }, 20000);

function untilOutput(marker) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      cleanup();
      reject(new Error('waiting for ' + marker + ': ' + stdout + ' // ' + stderr));
    }, 10000);
    const poll = setInterval(() => {
      if (stdout.includes(marker)) { cleanup(); resolve(); }
      else if (exited) { cleanup(); reject(new Error('writer exited early: ' + stderr)); }
    }, 15);
    function cleanup() {
      clearInterval(poll);
      clearTimeout(deadline);
    }
  });
}

async function main() {
  try {
    // Keep this *first* D2 issuance and Reader bind open, holding their
    // original L0/L1 transaction locks. DO NOT write COMMIT at any point.
    writer.stdin.write([
      'begin;',
      "select pg_catalog.set_config('myeongha.subject_id','" + subject + "',true);",
      "select 'M113_ISSUE',result_grant_id,result_replayed" +
        ' from public.internal_apply_official_reader_unified_receipt_v1(' +
        "'" + receipt + "'::uuid,array['test-reader-unit']," +
        'array[transaction_timestamp()],array[transaction_timestamp()],' +
        'array[null]::timestamptz[],array[null]::text[]);',
      "select 'M113_BIND',reading_id,entitlement_grant_id,access_role,official_reading_created" +
        ' from public.internal_cmd_bind_official_reader_unified_v1(' +
        "'" + subject + "'::uuid,'" + intent + "'::uuid," +
        "'" + session + "'::uuid,'" + proposal + "'::uuid," +
        "'sha256:v1:" + '7'.repeat(64) + "'," +
        "'standard-reading-access-bind-v2'," +
        "pg_catalog.jsonb_build_object('schemaVersion'," +
        "'standard-reading-access-bind-v2','purchaseIntentId','" + intent + "'));",
      "select 'M113_READY',pg_backend_pid()," +
        "(select count(*) from public.entitlement_grants" +
        " where source_receipt_id='" + receipt + "'::uuid)," +
        "(select count(*) from public.entitlement_events" +
        " where source_receipt_id='" + receipt + "'::uuid and source_type='receipt')," +
        "(select count(*) from public.standard_reading_reader_access_grants" +
        " where purchase_intent_id='" + intent + "'::uuid);",
    ].join('\n') + '\n');

    await untilOutput('M113_READY|');
    const match = stdout.match(/(?:^|\n)M113_ISSUE\|([0-9a-f-]{36})\|f(?:\n|$)/u);
    check(match !== null && uuid.test(match[1]),
      'real FIRST uncommitted D2 issue must return result_replayed=false: ' + stdout);
    const grant = match[1];
    check(stdout.includes('M113_BIND|' + official + '|' + grant + '|additional_reader|f'),
      'D2 bind inside the same uncommitted transaction must succeed: ' + stdout);
    const ready = stdout.match(/(?:^|\n)M113_READY\|(\d+)\|1\|1\|1(?:\n|$)/u);
    check(ready !== null, 'writer did not observe its own new Grant/Event/Reader: ' + stdout);

    const pid = Number(ready[1]);
    const active = dbRead('select state from pg_catalog.pg_stat_activity where pid=' + pid);
    check(active === 'idle in transaction',
      'the FIRST-issue transaction is not concurrently open: ' + active);

    // This is a different READ ONLY MVCC session using M1-10's literal
    // production-source SELECT, not a hand-written approximating query.
    const observer = execFileSync('bash', [
      'test/db/official_reader_m1_10_unknown_commit_source.sh',
      receipt, subject, intent, 'preissue', 'none', 'none',
    ], { encoding: 'utf8', timeout: 12000 });
    check(observer.includes('automatic retry remains HOLD'),
      'M1-10 observed a missing right as an allowed retry');

    check(receiptSnapshot() === before,
      'different observer must NOT see the writer uncommitted Grant/Event/Reader/Outbox');
    check(dbRead('select state from pg_catalog.pg_stat_activity where pid=' + pid) ===
      'idle in transaction', 'writer was not still open after the MVCC observer');
    console.log('PASS M1-13: real first D2 issue/bind exists in open writer transaction, but M1-10 separate snapshot sees no committed rights and keeps auto-retry HOLD');

    // Simulate a *competing* new issuance against the same Receipt while
    // the first writer holds its locks. It must not successfully mint another
    // Grant: lock_timeout requires PostgreSQL SQLSTATE 55P03.
    const contender = [
      'begin;',
      "set local lock_timeout='350ms';",
      "select pg_catalog.set_config('myeongha.subject_id','" + subject + "',true);",
      "select result_grant_id from public.internal_apply_official_reader_unified_receipt_v1(" +
        "'" + receipt + "'::uuid,array['test-reader-unit']," +
        'array[transaction_timestamp()],array[transaction_timestamp()],' +
        'array[null]::timestamptz[],array[null]::text[]);',
      'commit;',
    ].join('\n') + '\n';
    let errorText = '';
    try {
      execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1',
        '-v', 'VERBOSITY=verbose', '-At'],
        { input: contender, encoding: 'utf8', timeout: 10000 });
      throw new Error('competing first issuer committed unexpectedly');
    } catch (e) {
      if (!('status' in e) || e.status !== 3) throw e;
      errorText = String(e.stderr || '');
    }
    check(errorText.includes('55P03') && /lock timeout/u.test(errorText),
      'competing issuer must fail at real PostgreSQL lock timeout, got: ' + errorText);
    check(receiptSnapshot() === before,
      'a blocked competing issuer must not commit an orphan/duplicate effect');
    console.log('PASS M1-13: competing same-Receipt issuer fails with SQLSTATE 55P03 while the original first-issue transaction is uncommitted');

    // Intentionally ROLLBACK. This restores an empty committed Receipt, so
    // existing M1-12 can independently prove first successful issue with lost
    // COMMIT ACK, preserving all M1-03 through M1-12 regression tests.
    writer.stdin.end("rollback;\nselect 'M113_ROLLED_BACK',1;\n");
    await untilOutput('M113_ROLLED_BACK|1');
    const code = await complete;
    check(code === 0, 'writer did not cleanly ROLLBACK: ' + stderr);
    check(receiptSnapshot() === before,
      'rolled-back first issuance left a committed Grant, Event, Reader or Outbox');
    console.log('PASS M1-13: rollback removes writer-only first-issue effects; verified Receipt remains ready for separate M1-12 test');
    console.log('HOLD M1-13: no public retry admission; scenario tested with disposable fixture owner, not an approved operational issuer');
  } finally {
    clearTimeout(safety);
    if (!exited) {
      writer.stdin.destroy();
      writer.kill('SIGKILL');
      await complete.catch(() => undefined);
    }
  }
}

main().catch(err => {
  console.error(err.stack ?? String(err));
  process.exitCode = 1;
});
