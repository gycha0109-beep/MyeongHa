#!/usr/bin/env node
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u;
const [receipt, subject, intent, session, proposal, official] = process.argv.slice(2);
const db = process.env.PGDATABASE ?? '';
const ci = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const allowedDb = db === 'myeongha_test' ||
  db === 'myeongha_official_standard_reader_interpretation_test' ||
  db.startsWith('myeongha_ci_case_');
const port = Number(process.env.PGPORT ?? '5432');

function requireTrue(condition, message) {
  if (!condition) throw new Error('FAIL M1-12: ' + message);
}

requireTrue(ci && process.env.PGHOST === 'localhost' &&
  process.env.PGUSER === 'postgres' && allowedDb &&
  Number.isInteger(port) && port > 0 && port <= 65535,
  'disposable localhost CI PostgreSQL with owner postgres is required');
requireTrue([receipt, subject, intent, session, proposal, official]
  .every(id => typeof id === 'string' && uuid.test(id)),
  'six exact fixture UUIDs are required');

function query(sql) {
  return execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    { encoding: 'utf8', timeout: 12000 }).trim();
}


requireTrue(query(
  "select count(*) from public.commerce_receipts cr" +
  " join public.purchase_intents pi on pi.id=cr.purchase_intent_id" +
  " and pi.subject_id=cr.subject_id and pi.product_offer_id=cr.product_offer_id" +
  " where cr.id='" + receipt + "'::uuid" +
  " and cr.subject_id='" + subject + "'::uuid" +
  " and cr.purchase_intent_id='" + intent + "'::uuid" +
  " and cr.environment='production' and cr.verification_status='verified'" +
  " and pi.status='verified'"
) === '1', 'an actual verified 1050 Receipt and Intent must already be committed');

function snapshot() {
  return query(
    "select concat_ws('|'," +
    "(select count(*)::text from public.entitlement_grants" +
    " where source_receipt_id='" + receipt + "'::uuid)," +
    "(select count(*)::text from public.entitlement_events" +
    " where source_type='receipt' and source_receipt_id='" + receipt + "'::uuid)," +
    "(select count(*)::text from public.standard_reading_reader_access_grants" +
    " where purchase_intent_id='" + intent + "'::uuid)," +
    "(select count(*)::text from public.outbox_events ob" +
    " join public.entitlement_events e on e.event_dedupe_key=ob.dedupe_key" +
    " where e.source_receipt_id='" + receipt + "'::uuid" +
    " and e.source_type='receipt' and ob.aggregate_type='entitlement')," +
    "(select count(*)::text from public.entitlement_events e" +
    " join public.entitlement_grants g on g.id=e.grant_id" +
    " where g.source_receipt_id='" + receipt + "'::uuid" +
    " and e.source_type='provider_event')," +
    "(select count(*)::text from public.standard_reading_official_bindings" +
    " where reading_id='" + official + "'::uuid and subject_id='" + subject + "'::uuid))"
  );
}

const before = snapshot();
requireTrue(before === '0|0|0|0|0|1',
  'the first-issue fault MUST begin before ANY committed purchased entitlement: ' + before);

const sql = [
  'begin;',
  "select pg_catalog.set_config('myeongha.subject_id','" + subject + "',true);",
  "select 'M112_ISSUE',result_grant_id,result_replayed" +
  ' from public.internal_apply_official_reader_unified_receipt_v1(' +
  "'" + receipt + "'::uuid,array['test-reader-unit']," +
  'array[transaction_timestamp()],array[transaction_timestamp()],' +
  'array[null]::timestamptz[],array[null]::text[]);',
  "select 'M112_BIND',reading_id,entitlement_grant_id,access_role,official_reading_created" +
  ' from public.internal_cmd_bind_official_reader_unified_v1(' +
  "'" + subject + "'::uuid,'" + intent + "'::uuid," +
  "'" + session + "'::uuid,'" + proposal + "'::uuid," +
  "'sha256:v1:" + '7'.repeat(64) + "'," +
  "'standard-reading-access-bind-v2'," +
  "pg_catalog.jsonb_build_object('schemaVersion'," +
  "'standard-reading-access-bind-v2','purchaseIntentId','" + intent + "'));",
  'commit;',
].join('\n') + '\n';

// The same PG wire proxy proven in M1-11. Only the COMMIT completion
// frame is suppressed, after the first issue and bind are committed.
let commitSent = false;
let commitAckIntercepted = false;
let proxyError = null;
const proxy = net.createServer((client) => {
  const upstream = net.createConnection({ host: '127.0.0.1', port });
  let serverFrames = Buffer.alloc(0);
  let clientTail = '';
  client.setNoDelay(true);
  upstream.setNoDelay(true);
  client.on('data', chunk => {
    const fragment = (clientTail + chunk.toString('utf8')).toLowerCase();
    if (fragment.includes('commit;')) commitSent = true;
    clientTail = fragment.slice(-16);
    if (!upstream.destroyed) upstream.write(chunk);
  });
  upstream.on('data', chunk => {
    serverFrames = Buffer.concat([serverFrames, chunk]);
    while (serverFrames.length >= 5) {
      const length = serverFrames.readUInt32BE(1);
      if (length < 4 || length > 16 * 1024 * 1024) {
        proxyError = new Error('invalid backend PostgreSQL frame length');
        client.destroy(); upstream.destroy();
        return;
      }
      const size = 1 + length;
      if (serverFrames.length < size) break;
      const frame = serverFrames.subarray(0, size);
      serverFrames = serverFrames.subarray(size);
      if (commitSent && frame[0] === 0x43 &&
          frame.subarray(5).toString('utf8') === 'COMMIT\0') {
        commitAckIntercepted = true;
        // COMMIT has completed at the server, but the client cannot
        // distinguish that from a failed transaction.
        client.destroy();
        upstream.destroy();
        return;
      }
      if (!client.destroyed) client.write(frame);
    }
  });
  client.on('error', err => { proxyError ??= err; });
  upstream.on('error', err => { proxyError ??= err; client.destroy(); });
  upstream.on('close', () => client.destroy());
  client.on('close', () => upstream.destroy());
});
proxy.on('error', err => { proxyError = err; });


async function main() {
  await new Promise((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen(0, '127.0.0.1', resolve);
  });
  const address = proxy.address();
  requireTrue(address && typeof address !== 'string',
    'TCP proxy did not receive a local ephemeral port');
  const child = spawn('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'], {
    env: {
      ...process.env, PGHOST: '127.0.0.1',
      PGPORT: String(address.port),
      PGSSLMODE: 'disable', PGGSSENCMODE: 'disable',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', value => { stdout += value.toString('utf8'); });
  child.stderr.on('data', value => { stderr += value.toString('utf8'); });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve(code));
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
  child.stdin.end(sql);
  const exitCode = await exited;
  clearTimeout(timer);
  proxy.close();

  requireTrue(!proxyError, 'TCP proxy failed: ' + String(proxyError));
  requireTrue(commitSent && commitAckIntercepted,
    'the backend did not complete the FIRST-ISSUE COMMIT before ACK interception: ' +
    stderr);
  requireTrue(exitCode !== 0 &&
    /server closed|connection to server|unexpectedly|lost/u.test(stderr),
    'psql observed success rather than an unknown COMMIT outcome: ' + stderr);

  const match = stdout.match(/(?:^|\n)M112_ISSUE\|([0-9a-f-]{36})\|f(?:\n|$)/u);
  requireTrue(match !== null && uuid.test(match[1]),
    'first D2 issue must return a NEW uncommitted grant ID: ' + stdout);
  const grant = match[1];
  requireTrue(stdout.includes(
    'M112_BIND|' + official + '|' + grant + '|additional_reader|f'),
    'Reader binder must select the original Official Reading and newly minted grant: ' + stdout);

  const after = snapshot();
  requireTrue(/^1\|1\|1\|[01]\|0\|1$/u.test(after),
    'a FIRST issue+bind must commit exactly one purchased Grant, Event and Reader: ' +
    before + ' -> ' + after);

  const authoritative = query(
    "select concat_ws('|'," +
    "(select count(*) from public.entitlement_grants g" +
    " where g.id='" + grant + "'::uuid and g.subject_id='" + subject + "'::uuid" +
    " and g.source_receipt_id='" + receipt + "'::uuid and g.status='active')," +
    "(select count(*) from public.entitlement_events e" +
    " where e.grant_id='" + grant + "'::uuid and e.source_type='receipt'" +
    " and e.source_receipt_id='" + receipt + "'::uuid and e.event_type='granted')," +
    "(select count(*) from public.standard_reading_reader_access_grants a" +
    " where a.purchase_intent_id='" + intent + "'::uuid" +
    " and a.entitlement_grant_id='" + grant + "'::uuid" +
    " and a.official_reading_id='" + official + "'::uuid)," +
    "(select revision from public.entitlement_grants g" +
    " where g.id='" + grant + "'::uuid))"
  );
  requireTrue(/^1\|1\|1\|\d+$/u.test(authoritative),
    'fresh read after COMMIT-ACK loss did not resolve the EXACT new Grant/Event/Reader: ' +
    authoritative);

  console.error('PASS M1-12: backend committed FIRST private D2 issuance+Reader bind, while loopback TCP suppressed the real PostgreSQL COMMIT acknowledgement');
  console.error('PASS M1-12: psql observed an actual broken connection; fresh PostgreSQL read proved exactly one new source-backed Grant/Event/Reader, no duplicate or orphan');
  console.error('HOLD M1-12: executed only as an isolated fixture owner; runtime issuer roles, first validity policy, saleable Offer and paid T2 remain unapproved');

  // Existing M1-03 fixture parses these established private transaction rows.
  // No successful COMMIT acknowledgement is required or asserted by psql.
  console.log('ISSUE|' + grant + '|f');
  console.log('BIND|' + official + '|' + grant + '|additional_reader|f');
}

main().catch(error => {
  proxy.close();
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
