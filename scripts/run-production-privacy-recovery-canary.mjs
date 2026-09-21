import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import {
  HostedAuthCanaryKeySelectionError,
  selectHostedAuthCanaryAdminKey,
} from './account-deletion-hosted-auth-canary-key-selection.mjs';

const PROJECT_REF = 'cnsfpcdiyofqvhpcegfc';
const ORIGIN = `https://${PROJECT_REF}.supabase.co`;
const CONFIRMATION = 'RUN_SYNTHETIC_PRODUCTION_PRIVACY_CANARY';
const PROVIDER = 'myeongha-privacy-canary-v1';
const API_DATABASE_PRINCIPAL = 'myeongha_runtime';
const API_EXECUTION_ROLE = 'myeongha_api_executor';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

class CanaryFailure extends Error {
  constructor(code) {
    super(code);
    this.name = 'CanaryFailure';
    this.code = code;
  }
}

function fail(code) {
  throw new CanaryFailure(code);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) fail(`MISSING_${name}`);
  return value;
}

function requireRunId(value) {
  if (!/^[1-9][0-9]{0,19}$/u.test(value ?? '')) fail('INVALID_RUN_ID');
  return value;
}

function requireUuid(value, code) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(code);
  return value.toLowerCase();
}

async function readBoundedJson(response) {
  const text = await response.text();
  if (text.length > 64 * 1024) fail('PROVIDER_BODY_TOO_LARGE');
  try {
    return text.length === 0 ? null : JSON.parse(text);
  } catch {
    fail('INVALID_PROVIDER_JSON');
  }
}

async function fetchWithTimeout(url, init, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    fail('PROVIDER_TRANSPORT_FAILURE');
  } finally {
    clearTimeout(timer);
  }
}

async function resolveAdminSecret() {
  const explicit = process.env.MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET;
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;

  const token = requiredEnv('SUPABASE_ACCESS_TOKEN');
  if (
    token.trim() !== token ||
    token.length < 20 ||
    token.length > 4096 ||
    /\s/u.test(token)
  ) {
    fail('MANAGEMENT_ACCESS_TOKEN_INVALID');
  }

  const response = await fetchWithTimeout(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok) fail(`MANAGEMENT_API_REJECTED_${response.status}`);

  const payload = await readBoundedJson(response);
  try {
    return selectHostedAuthCanaryAdminKey(payload);
  } catch (error) {
    if (error instanceof HostedAuthCanaryKeySelectionError) fail(error.code);
    throw error;
  }
}

async function runtimeModules() {
  const [
    authConfigModule,
    authDeletionModule,
    workerDbConfigModule,
    workerRuntimeModule,
    postgresPoolModule,
  ] = await Promise.all([
    import('../dist/apps/api/src/production-account-deletion-auth-admin-config.js'),
    import('../dist/apps/api/src/supabase-auth-admin-user-deletion.js'),
    import('../dist/apps/api/src/production-account-deletion-worker-db-config.js'),
    import('../dist/apps/api/src/production-account-deletion-worker-runtime.js'),
    import('../dist/apps/api/src/node-postgres-subject-pool.js'),
  ]);
  return {
    ...authConfigModule,
    ...authDeletionModule,
    ...workerDbConfigModule,
    ...workerRuntimeModule,
    ...postgresPoolModule,
  };
}

async function createAdminPool() {
  const { normalizeNodePostgresConnectionStringV1 } = await runtimeModules();
  const connectionString = normalizeNodePostgresConnectionStringV1(
    requiredEnv('MYEONGHA_PRIVACY_CANARY_ADMIN_DATABASE_URL'),
  );
  return new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    allowExitOnIdle: true,
  });
}

async function createApiPool() {
  const { normalizeNodePostgresConnectionStringV1 } = await runtimeModules();
  const connectionString = normalizeNodePostgresConnectionStringV1(
    requiredEnv('MYEONGHA_DATABASE_URL'),
  );
  return new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    allowExitOnIdle: true,
  });
}

async function assertApiRuntimePrincipal(client) {
  const result = await client.query(
    'select current_user::text as "currentUser", pg_catalog.pg_has_role(current_user, $1::name, \'MEMBER\') as "canEnterExecutionRole"',
    [API_EXECUTION_ROLE],
  );
  const row = result.rows[0];
  if (
    result.rows.length !== 1 ||
    row?.currentUser !== API_DATABASE_PRINCIPAL ||
    row?.canEnterExecutionRole !== true
  ) {
    fail('API_DATABASE_PRINCIPAL_INVALID');
  }
}

async function authHeaders(secret) {
  const { createSupabaseAuthAdminCredentialHeadersV1 } = await runtimeModules();
  return createSupabaseAuthAdminCredentialHeadersV1(secret);
}

async function createHostedUser(secret, runId) {
  const email = `myeongha-privacy-canary-${runId}-${randomUUID()}@example.com`;
  const response = await fetchWithTimeout(`${ORIGIN}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(await authHeaders(secret)),
    },
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: {
        myeongha_canary: PROVIDER,
        canary_run_id: runId,
      },
    }),
  });
  if (!response.ok) fail(`AUTH_CREATE_REJECTED_${response.status}`);
  const payload = await readBoundedJson(response);
  return requireUuid(payload?.id ?? payload?.user?.id, 'AUTH_CREATE_ID_INVALID');
}

async function deleteHostedUserBestEffort(secret, authUserId) {
  const response = await fetchWithTimeout(
    `${ORIGIN}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
    {
      method: 'DELETE',
      headers: {
        accept: 'application/json',
        ...(await authHeaders(secret)),
      },
    },
  );
  if (![200, 204, 404].includes(response.status)) {
    fail(`AUTH_CLEANUP_REJECTED_${response.status}`);
  }
  try {
    void response.body?.cancel();
  } catch {
    // Best-effort response cleanup only.
  }
}

async function assertHostedUserAbsent(secret, authUserId) {
  const response = await fetchWithTimeout(
    `${ORIGIN}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(await authHeaders(secret)),
      },
    },
  );
  if (response.status !== 404) {
    try {
      void response.body?.cancel();
    } catch {
      // Best-effort response cleanup only.
    }
    fail(`AUTH_USER_STILL_PRESENT_${response.status}`);
  }
  try {
    void response.body?.cancel();
  } catch {
    // Best-effort response cleanup only.
  }
}

function statePath() {
  return requiredEnv('MYEONGHA_PRIVACY_CANARY_STATE_PATH');
}

async function writeState(state) {
  await writeFile(statePath(), `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

async function readState() {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(statePath(), 'utf8'));
  } catch {
    fail('CANARY_STATE_UNREADABLE');
  }
  if (
    parsed?.schema !== 'myeongha-production-privacy-canary-state-v1' ||
    typeof parsed.phase !== 'string'
  ) {
    fail('CANARY_STATE_INVALID');
  }
  for (const key of [
    'authUserId',
    'subjectId',
    'commerceAccountLinkId',
    'deletionJobId',
    'outboxEventId',
  ]) {
    requireUuid(parsed[key], 'CANARY_STATE_INVALID');
  }
  if (
    typeof parsed.requestDedupeKey !== 'string' ||
    parsed.requestDedupeKey.length === 0
  ) {
    fail('CANARY_STATE_INVALID');
  }
  return parsed;
}

async function prepare() {
  if (requiredEnv('MYEONGHA_PRIVACY_CANARY_CONFIRM') !== CONFIRMATION) {
    fail('CONFIRMATION_REQUIRED');
  }
  const runId = requireRunId(process.env.GITHUB_RUN_ID);
  const secret = await resolveAdminSecret();
  const authUserId = await createHostedUser(secret, runId);
  const state = {
    schema: 'myeongha-production-privacy-canary-state-v1',
    phase: 'preparing',
    authUserId,
    subjectId: randomUUID(),
    commerceAccountLinkId: randomUUID(),
    deletionJobId: randomUUID(),
    outboxEventId: randomUUID(),
    requestDedupeKey: `privacy-canary-${runId}-${randomUUID()}`,
  };

  const pool = await createAdminPool();
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `insert into public.subjects(
           id, kind, auth_user_id, status, merged_into_subject_id, created_at, updated_at
         ) values ($1::uuid, 'member', $2::uuid, 'active', null, clock_timestamp(), clock_timestamp())`,
        [state.subjectId, state.authUserId],
      );
      await client.query(
        `insert into public.profiles(
           subject_id, display_name, locale, timezone, onboarding_state, created_at, updated_at
         ) values ($1::uuid, 'Synthetic Privacy Canary', 'ko-KR', 'Asia/Seoul', 'canary', clock_timestamp(), clock_timestamp())`,
        [state.subjectId],
      );
      await client.query(
        `insert into public.commerce_account_links(
           id, subject_id, provider, external_account_fingerprint, status,
           verified_at, revoked_at, created_at
         ) values (
           $1::uuid, $2::uuid, $3::text, $4::text, 'active',
           clock_timestamp(), null, clock_timestamp()
         )`,
        [
          state.commerceAccountLinkId,
          state.subjectId,
          PROVIDER,
          `synthetic:${runId}:${randomUUID()}`,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Original failure remains authoritative.
      }
      throw error;
    } finally {
      client.release();
    }
  } catch {
    await deleteHostedUserBestEffort(secret, authUserId);
    fail('PREPARE_DATABASE_FAILED');
  } finally {
    await pool.end();
  }

  state.phase = 'prepared';
  await writeState(state);
  console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_PREPARED');
}

async function startDeletion(state) {
  const pool = await createApiPool();
  try {
    const client = await pool.connect();
    try {
      await assertApiRuntimePrincipal(client);
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE myeongha_api_executor');
      const resolved = await client.query(
        `select subject_id::text as "subjectId", subject_kind as "subjectKind"
         from public.begin_member_subject_context_v1($1::uuid)`,
        [state.authUserId],
      );
      if (
        resolved.rows.length !== 1 ||
        resolved.rows[0]?.subjectId !== state.subjectId ||
        resolved.rows[0]?.subjectKind !== 'member'
      ) {
        fail('API_SUBJECT_CONTEXT_MISMATCH');
      }

      const started = await client.query(
        `select
           deletion_job_id::text as "deletionJobId",
           deletion_job_status as "status",
           replayed
         from public.cmd_start_account_deletion_runtime_v1(
           $1::uuid, $2::uuid, $3::text, $4::uuid
         )`,
        [
          state.subjectId,
          state.deletionJobId,
          state.requestDedupeKey,
          state.outboxEventId,
        ],
      );
      const row = started.rows[0];
      if (
        started.rows.length !== 1 ||
        row?.deletionJobId !== state.deletionJobId ||
        row?.status !== 'running' ||
        row?.replayed !== false
      ) {
        fail('ACCOUNT_DELETION_START_RESULT_INVALID');
      }
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Original failure remains authoritative.
      }
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function runWorker(state, secret) {
  const {
    parseProductionAccountDeletionWorkerDbConfigV1,
    parseProductionAccountDeletionAuthAdminConfigV1,
    createProductionAccountDeletionWorkerRuntimeV1,
  } = await runtimeModules();

  let databaseConfig;
  let authAdminConfig;
  try {
    databaseConfig = parseProductionAccountDeletionWorkerDbConfigV1({
      ...process.env,
      MYEONGHA_WORKER_DATABASE_PRINCIPAL: 'myeongha_worker_runtime',
    });
    authAdminConfig = parseProductionAccountDeletionAuthAdminConfigV1({
      ...process.env,
      MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET: secret,
    });
  } catch {
    fail('WORKER_CONFIG_INVALID');
  }

  const lease = createProductionAccountDeletionWorkerRuntimeV1({
    databaseConfig,
    authAdminConfig,
  });
  try {
    const result = await lease.runtime.run({
      outboxEventId: state.outboxEventId,
      lockOwner: `privacy-canary-${requireRunId(process.env.GITHUB_RUN_ID)}`,
      leaseExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (
      result.worker.status !== 'completed' ||
      result.worker.alreadyCompleted !== false ||
      result.worker.authDeletionInvoked !== true ||
      !['deleted', 'already_absent'].includes(result.worker.authDeletionOutcome)
    ) {
      fail('WORKER_RESULT_INVALID');
    }
    return result.worker;
  } finally {
    await lease.close();
  }
}

async function verifyFinalState(state, secret, worker) {
  const pool = await createAdminPool();
  try {
    const result = await pool.query(
      `select
         s.status as subject_status,
         s.auth_user_id,
         dj.status as job_status,
         dj.completed_at,
         oe.status as outbox_status,
         oe.processed_at,
         cal.provider,
         cal.status as commerce_status,
         cal.revoked_at,
         (select count(*)::int from public.profiles p where p.subject_id = s.id) as profile_count
       from public.subjects s
       join public.data_deletion_jobs dj
         on dj.id = $2::uuid and dj.subject_id = s.id
       join public.outbox_events oe
         on oe.id = $3::uuid
        and oe.aggregate_type = 'data_deletion_job'
        and oe.aggregate_id = dj.id::text
       join public.commerce_account_links cal
         on cal.id = $4::uuid and cal.subject_id = s.id
       where s.id = $1::uuid`,
      [
        state.subjectId,
        state.deletionJobId,
        state.outboxEventId,
        state.commerceAccountLinkId,
      ],
    );
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      row?.subject_status !== 'deleted' ||
      row?.auth_user_id !== null ||
      row?.job_status !== 'completed' ||
      row?.completed_at === null ||
      row?.outbox_status !== 'processed' ||
      row?.processed_at === null ||
      row?.provider !== PROVIDER ||
      row?.commerce_status !== 'revoked' ||
      row?.revoked_at === null ||
      row?.profile_count !== 0
    ) {
      fail('FINAL_DATABASE_STATE_INVALID');
    }
  } finally {
    await pool.end();
  }

  await assertHostedUserAbsent(secret, state.authUserId);

  const evidencePath = requiredEnv('MYEONGHA_PRIVACY_CANARY_EVIDENCE_PATH');
  const evidence = {
    schema: 'myeongha-production-privacy-recovery-canary-evidence-v1',
    productionProjectRef: PROJECT_REF,
    fixtureClass: 'synthetic-disposable-member',
    commerceProvider: PROVIDER,
    accountDeletionStartAuthority: 'myeongha_api_executor/cmd_start_account_deletion_runtime_v1',
    workerAuthority: 'myeongha_worker_runtime->myeongha_system_executor',
    workerStatus: worker.status,
    hostedAuthDeletionInvoked: worker.authDeletionInvoked,
    hostedAuthDeletionOutcome: worker.authDeletionOutcome,
    databaseFinalization: 'pass',
    completionAck: 'pass',
    personalizationNonResurrectionGuard: 'pass',
    commerceP5yRetentionGuard: 'retained-revoked-pass',
    outputContainsIdentifiers: false,
    outputContainsRowPayloads: false,
    authoritativePrivacyReconciliation: false,
    futureSafePrivacyReconciliation: false,
    drReady: false,
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

async function execute() {
  if (requiredEnv('MYEONGHA_PRIVACY_CANARY_CONFIRM') !== CONFIRMATION) {
    fail('CONFIRMATION_REQUIRED');
  }
  requiredEnv('MYEONGHA_DATABASE_URL');
  requiredEnv('MYEONGHA_WORKER_DATABASE_URL');
  const state = await readState();
  if (state.phase !== 'prepared') fail('CANARY_NOT_PREPARED');

  await startDeletion(state);
  state.phase = 'deletion_started';
  await writeState(state);

  const secret = await resolveAdminSecret();
  const worker = await runWorker(state, secret);
  await verifyFinalState(state, secret, worker);

  state.phase = 'completed';
  await writeState(state);
  console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_DELETE_PASS');
}

async function cleanupPrestart() {
  let state;
  try {
    state = await readState();
  } catch {
    console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_CLEANUP_SKIP state=unavailable');
    return;
  }
  if (state.phase !== 'prepared') {
    console.log(`MYEONGHA_PRODUCTION_PRIVACY_CANARY_CLEANUP_SKIP phase=${state.phase}`);
    return;
  }

  const pool = await createAdminPool();
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const guard = await client.query(
        `select status, auth_user_id::text as "authUserId"
         from public.subjects where id = $1::uuid for update`,
        [state.subjectId],
      );
      if (
        guard.rows.length !== 1 ||
        guard.rows[0]?.status !== 'active' ||
        guard.rows[0]?.authUserId !== state.authUserId
      ) {
        fail('CLEANUP_PRESTART_GUARD_FAILED');
      }
      await client.query(
        'delete from public.commerce_account_links where id = $1::uuid and subject_id = $2::uuid',
        [state.commerceAccountLinkId, state.subjectId],
      );
      await client.query(
        'delete from public.profiles where subject_id = $1::uuid',
        [state.subjectId],
      );
      await client.query(
        'delete from public.subjects where id = $1::uuid and status = \'active\'',
        [state.subjectId],
      );
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Original failure remains authoritative.
      }
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  const secret = await resolveAdminSecret();
  await deleteHostedUserBestEffort(secret, state.authUserId);
  state.phase = 'cleaned';
  await writeState(state);
  console.log('MYEONGHA_PRODUCTION_PRIVACY_CANARY_CLEANUP_PASS');
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'prepare') return prepare();
  if (mode === 'execute') return execute();
  if (mode === 'cleanup-prestart') return cleanupPrestart();
  fail('MODE_REQUIRED');
}

main().catch((error) => {
  const code =
    error instanceof CanaryFailure
      ? error.code
      : error && typeof error === 'object' && typeof error.code === 'string'
        ? error.code
        : 'UNEXPECTED';
  console.error(`MYEONGHA_PRODUCTION_PRIVACY_CANARY_FAIL code=${code}`);
  process.exitCode = 1;
});
