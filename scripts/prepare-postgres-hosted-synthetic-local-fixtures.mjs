import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateSyntheticLocalInputs } from './run-postgres-hosted-synthetic-local-acceptance.mjs';

const LOCAL_ENDPOINT = 'http://127.0.0.1:54321';
const LOCAL_DB_HOST = '127.0.0.1';
const LOCAL_DB_PORT = 54322;
const LOCAL_BUCKET = 'dr-synthetic-private';
const LOCAL_OBJECT = 'probe/data.txt';
const OBJECT_BYTES = Buffer.from('dr-synthetic-private-object-2026\n', 'utf8');
const OBJECT_SHA = createHash('sha256').update(OBJECT_BYTES).digest('hex');

function fail(reason) { throw new Error('HOLD_DR_LOCAL_FIXTURE: ' + reason); }

export function validateLocalFixtureConfig(env) {
  const config = validateSyntheticLocalInputs(env);
  if (config.bucket !== LOCAL_BUCKET || config.objectPath !== LOCAL_OBJECT ||
      config.expectedSha !== OBJECT_SHA) {
    fail('fixture identities and deterministic test object digest must match the fixed local fixture');
  }
  const serviceRoleKey = env.MH_DR_LOCAL_SERVICE_ROLE_KEY;
  if (typeof serviceRoleKey !== 'string') fail('local service-role key missing');
  const parts = serviceRoleKey.split('.');
  let payload;
  try {
    if (parts.length !== 3) fail('local service role must be a legacy JWT for the CLI');
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { fail('invalid local JWT'); }
  if (payload?.role !== 'service_role' || payload?.iss !== 'supabase-demo') {
    fail('local fixture setup requires only the CLI service-role JWT');
  }
  const dbPassword = env.MH_DR_LOCAL_DB_PASSWORD;
  if (typeof dbPassword !== 'string' || !dbPassword ||
      dbPassword.includes('\n')) fail('local PostgreSQL password missing');
  return Object.freeze({ ...config, serviceRoleKey, dbPassword });
}

function adminHeaders(serviceRoleKey, type = null) {
  return { apikey: serviceRoleKey, Authorization: 'Bearer ' + serviceRoleKey,
    ...(type ? { 'Content-Type': type } : {}) };
}

async function safeRequest(request, path, options, expected, operation) {
  const res = await request(LOCAL_ENDPOINT + path, { redirect: 'manual', ...options });
  if (!expected.includes(res.status)) fail(operation + ' rejected by local API');
  return res;
}

function uuid(value) {
  if (typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    fail('local synthetic user id missing or malformed');
  }
  return value;
}

async function newLocalUser(request, token, email, password) {
  const res = await safeRequest(request, '/auth/v1/admin/users', {
    method: 'POST', headers: adminHeaders(token, 'application/json'),
    body: JSON.stringify({ email, password, email_confirm: true }),
  }, [200, 201], 'synthetic local Auth user create');
  let body;
  try { body = await res.json(); } catch { fail('local Auth create response invalid'); }
  return uuid(body?.id);
}

async function deleteLocalUser(request, token, id) {
  await safeRequest(request, '/auth/v1/admin/users/' + id, {
    method: 'DELETE', headers: adminHeaders(token),
  }, [200, 204], 'delete designated synthetic user');
}

export async function prepareLocalSyntheticFixtures(env, request = fetch, dbFactory = null) {
  const cfg = validateLocalFixtureConfig(env);
  if (typeof request !== 'function') fail('local request implementation missing');
  if (!dbFactory) {
    dbFactory = async (password) => {
      const { default: pg } = await import('pg');
      const client = new pg.Client({
        host: LOCAL_DB_HOST, port: LOCAL_DB_PORT, database: 'postgres',
        user: 'postgres', password, ssl: false, connectionTimeoutMillis: 5000,
      });
      await client.connect();
      return client;
    };
  }

  const db = await dbFactory(cfg.dbPassword);
  let tx = false;
  try {
    const preflight = await db.query(
      "select current_database() as db, current_user as role, (select count(*)::int from pg_namespace where nspname='auth') as auth_schema, (select count(*)::int from pg_namespace where nspname='storage') as storage_schema",
    );
    if (preflight.rows.length !== 1 || preflight.rows[0].db !== 'postgres' ||
        preflight.rows[0].role !== 'postgres' ||
        Number(preflight.rows[0].auth_schema) !== 1 ||
        Number(preflight.rows[0].storage_schema) !== 1) {
      fail('dedicated local Supabase auth/storage database not established');
    }
    const old = await db.query(
      "select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='dr_synthetic_local_private_read_v1'",
    );
    if (old.rows.length !== 0) fail('synthetic fixture already provisioned; never mutate existing fixture');

    const memberId = await newLocalUser(request, cfg.serviceRoleKey, cfg.email, cfg.password);
    const deletedId = await newLocalUser(request, cfg.serviceRoleKey, cfg.deletedEmail, cfg.deletedPassword);
    await deleteLocalUser(request, cfg.serviceRoleKey, deletedId);

    await safeRequest(request, '/storage/v1/bucket', {
      method: 'POST', headers: adminHeaders(cfg.serviceRoleKey, 'application/json'),
      body: JSON.stringify({ id: LOCAL_BUCKET, name: LOCAL_BUCKET, public: false }),
    }, [200, 201], 'private synthetic bucket create');

    const objectUrl = '/storage/v1/object/' + LOCAL_BUCKET + '/' + LOCAL_OBJECT;
    await safeRequest(request, objectUrl, {
      method: 'POST', headers: adminHeaders(cfg.serviceRoleKey, 'text/plain'),
      body: OBJECT_BYTES,
    }, [200, 201], 'private synthetic object upload');

    const bucket = await safeRequest(request, '/storage/v1/bucket/' + LOCAL_BUCKET, {
      method: 'GET', headers: adminHeaders(cfg.serviceRoleKey),
    }, [200], 'private bucket verification');
    let metadata;
    try { metadata = await bucket.json(); } catch { fail('private bucket response invalid'); }
    if (metadata?.public !== false) fail('synthetic bucket must stay private');

    await db.query('BEGIN');
    tx = true;
    await db.query("create policy dr_synthetic_local_private_read_v1 on storage.objects for select to authenticated using (bucket_id = '" +
      LOCAL_BUCKET + "' and name = '" + LOCAL_OBJECT + "' and auth.uid() = '" + memberId + "'::uuid)");
    await db.query('COMMIT');
    tx = false;

    return Object.freeze({
      schema: 'myeongha-dr-synthetic-local-fixture-v1',
      target: 'local-loopback-synthetic-only',
      memberCreated: true, deletedMemberRemoved: true,
      privateBucket: true, objectSha256: OBJECT_SHA,
      privateReadPolicyInstalled: true,
      productionDataUsed: false, hostedRecoveryProven: false,
      drReady: false, gate: 'BLOCKED', serviceResumptionAllowed: false,
      outputContainsIdentifiers: false,
    });
  } catch (error) {
    if (tx) { try { await db.query('ROLLBACK'); } catch { /* local fixture only */ } }
    throw error;
  } finally { await db.end(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 2) fail('unexpected CLI arguments');
  try {
    console.log(JSON.stringify(await prepareLocalSyntheticFixtures(process.env)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'HOLD_DR_LOCAL_FIXTURE');
    process.exitCode = 1;
  }
}
