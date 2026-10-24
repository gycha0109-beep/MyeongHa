import assert from 'node:assert/strict';
import pg from 'pg';

let url;
try { url = new URL(process.env.MYEONGHA_WORKER_DATABASE_URL ?? ''); }
catch { throw new Error('SAJU_COUNTER_CLEANUP_CONFIGURATION_INVALID'); }
assert.equal(url.protocol, 'postgresql:');
assert.equal(url.username, 'myeongha_worker_runtime.cnsfpcdiyofqvhpcegfc');
assert.match(url.hostname, /^[a-z0-9.-]+\.pooler\.supabase\.com$/u);
assert.equal(url.port, '5432');
assert.equal(url.pathname, '/postgres');
assert.equal(url.hash, '');
const ca = process.env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM?.replace(/\\n/gu, '\n');
assert.ok(ca?.includes('-----BEGIN CERTIFICATE-----'));
url.search = ''; // Keep pg connection-string sslmode from overriding the explicit verified TLS configuration.
const pool = new pg.Pool({ connectionString: url.href, ssl: { rejectUnauthorized: true, ca },
  max: 1, connectionTimeoutMillis: 10_000, query_timeout: 30_000 });
let connection;
let begun = false;
try {
  connection = await pool.connect();
  const context = (await connection.query('SELECT current_database() AS db,current_user AS actor')).rows[0];
  assert.equal(context.db, 'postgres');
  assert.equal(context.actor, 'myeongha_worker_runtime');
  await connection.query('BEGIN'); begun = true;
  await connection.query('SET LOCAL ROLE myeongha_system_executor');
  await connection.query("SET LOCAL lock_timeout='3s'");
  const count = (await connection.query('SELECT public.cmd_cleanup_saju_abuse_admission_buckets_v1() AS count')).rows[0].count;
  assert.ok(Number.isInteger(count) && count >= 0 && count <= 5000);
  await connection.query('COMMIT'); begun = false;
  console.log(JSON.stringify({ status: 'PASS', deletedExpiredCounters: count, maximumBatch: 5000,
    verifiedTls: true, principal: 'existing worker / system executor', rawIdentityOrPayloadEmitted: false }));
} catch {
  if (begun) await connection?.query('ROLLBACK').catch(() => undefined);
  console.error('SAJU_COUNTER_CLEANUP_FAILED: no automatic replay; inspect protected job metadata.');
  process.exitCode = 1;
} finally { connection?.release(); await pool.end(); }
