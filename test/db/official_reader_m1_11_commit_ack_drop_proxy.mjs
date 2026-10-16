#!/usr/bin/env node
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u;
const [receipt, subject, intent, session, proposal, grant, official] = process.argv.slice(2);
const db = process.env.PGDATABASE ?? '';
const ci = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const allowedDb = db === 'myeongha_test' ||
  db === 'myeongha_official_standard_reader_interpretation_test' ||
  db.startsWith('myeongha_ci_case_');
const port = Number(process.env.PGPORT ?? '5432');

function requireTrue(condition, message) {
  if (!condition) throw new Error('FAIL M1-11: ' + message);
}

requireTrue(ci && process.env.PGHOST === 'localhost' &&
  process.env.PGUSER === 'postgres' && allowedDb &&
  Number.isInteger(port) && port > 0 && port <= 65535,
  'disposable localhost CI PostgreSQL with owner postgres is required');
requireTrue([receipt, subject, intent, session, proposal, grant, official]
  .every(id => typeof id === 'string' && uuid.test(id)),
  'seven exact fixture UUIDs are required');

function query(sql) {
  return execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    { encoding: 'utf8', timeout: 12000 }).trim();
}

const original = query(
  "select concat_ws('|'," +
  "pg_catalog.to_char(e.effective_at at time zone 'UTC'," +
  " 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')," +
  "pg_catalog.to_char(e.target_valid_from at time zone 'UTC'," +
  " 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')," +
  "coalesce(e.target_valid_until::text,'none')," +
  "coalesce(e.reason_code,'none'))" +
  " from public.entitlement_events e" +
  " join public.entitlement_grants g on g.id=e.grant_id" +
  " where e.source_type='receipt' and e.event_type='granted'" +
  " and e.source_receipt_id='" + receipt + "'::uuid" +
  " and e.grant_id='" + grant + "'::uuid" +
  " and g.subject_id='" + subject + "'::uuid"
);
const effectParts = original.split('|');
requireTrue(effectParts.length === 4 && effectParts[0].length > 0 &&
  effectParts[1].length > 0 && effectParts[2] === 'none' &&
  effectParts[3] === 'none',
  'only one existing immutable Grant Event with fixture-null expiry/reason is allowed');
const [effective, validFrom] = effectParts;

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
    "(select revision::text from public.entitlement_grants" +
    " where id='" + grant + "'::uuid and source_receipt_id='" + receipt + "'::uuid)," +
    "(select count(*)::text from public.standard_reading_official_bindings" +
    " where reading_id='" + official + "'::uuid and subject_id='" + subject + "'::uuid))"
  );
}

const before = snapshot();
requireTrue(/^1\|1\|1\|[01]\|\d+\|1$/u.test(before),
  'exact single committed D2 Grant/Event/Access/Reader baseline is required: ' + before);

const sql = [
  'begin;',
  "select pg_catalog.set_config('myeongha.subject_id','" + subject + "',true);",
  "select 'M111_ISSUE',result_grant_id,result_replayed" +
  ' from public.internal_apply_official_reader_unified_receipt_v1(' +
  "'" + receipt + "'::uuid,array['test-reader-unit']," +
  "array['" + effective + "'::timestamptz]," +
  "array['" + validFrom + "'::timestamptz]," +
  'array[null]::timestamptz[],array[null]::text[]);',
  "select 'M111_BIND',reading_id,entitlement_grant_id,replayed" +
  ' from public.internal_cmd_bind_official_reader_unified_v1(' +
  "'" + subject + "'::uuid,'" + intent + "'::uuid," +
  "'" + session + "'::uuid,'" + proposal + "'::uuid," +
  "'sha256:v1:" + '7'.repeat(64) + "'," +
  "'standard-reading-access-bind-v2'," +
  "pg_catalog.jsonb_build_object('schemaVersion'," +
  "'standard-reading-access-bind-v2','purchaseIntentId','" + intent + "'));",
  'commit;',
].join('\n') + '\n';

// The proxy relays actual PostgreSQL wire frames. Only AFTER the server
// generated the CommandComplete("COMMIT") acknowledgement does it destroy
// the client connection WITHOUT forwarding that acknowledgement.
// This is NOT a fake psql timeout nor a guessed completed COMMIT.
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
    'TCP proxy did not receive a loopback port');

  const child = spawn('psql',
    ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'],
    {
      env: {
        ...process.env, PGHOST: '127.0.0.1',
        PGPORT: String(address.port),
        PGSSLMODE: 'disable', PGGSSENCMODE: 'disable',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', b => { stdout += b.toString('utf8'); });
  child.stderr.on('data', b => { stderr += b.toString('utf8'); });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code));
  });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 15000);
  child.stdin.end(sql);
  const exitCode = await exited;
  clearTimeout(timeout);
  proxy.close();

  requireTrue(!proxyError, 'TCP proxy failure: ' + String(proxyError));
  requireTrue(commitSent && commitAckIntercepted,
    'backend never completed COMMIT before acknowledgement interception: ' + stderr);
  requireTrue(exitCode !== 0 && /server closed|connection to server|unexpectedly|lost/u.test(stderr),
    'client unexpectedly received success despite lost COMMIT ack: ' + stderr);
  requireTrue(stdout.includes('M111_ISSUE|' + grant + '|t'),
    'original issuer was not replayed before COMMIT: ' + stdout);
  requireTrue(stdout.includes('M111_BIND|' + official + '|' + grant + '|t'),
    'original Reader binder was not replayed before COMMIT: ' + stdout);

  const after = snapshot();
  requireTrue(after === before,
    'network-dropped COMMIT acknowledgement caused duplicate or missing authority: ' +
    before + ' -> ' + after);
  console.log('PASS M1-11: actual TCP proxy drops PostgreSQL COMMIT completion frame; psql observes lost connection after private D2 replay');
  console.log('PASS M1-11: new direct PostgreSQL connection sees unchanged exact Grant/Event/Reader/Outbox despite lost client acknowledgement');
  console.log('HOLD M1-11: transport fault tested on committed D2 replay, not first issuance; operational issuer credential and paid T2 remain unapproved');
}

main().catch(error => {
  proxy.close();
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
