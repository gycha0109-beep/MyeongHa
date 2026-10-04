import { randomUUID } from 'node:crypto';
const CONFIRMATION = 'DELETE_SYNTHETIC_AUTH_USER_ONLY';
const PROJECT_REF = 'cnsfpcdiyofqvhpcegfc';
const MAX_RESPONSE_BYTES = 65_536;
const REQUEST_TIMEOUT_MS = 10_000;

class CanaryFailure extends Error {
  constructor(code) {
    super(code);
    this.name = 'CanaryFailure';
    this.code = code;
  }
}

function requireExact(value, expected, code) {
  if (value !== expected) throw new CanaryFailure(code);
  return value;
}

function requireRunId(value) {
  if (typeof value !== 'string' || !/^[0-9]+$/u.test(value)) {
    throw new CanaryFailure('INVALID_RUN_ID');
  }
  return value;
}

function requireUuid(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  ) {
    throw new CanaryFailure('INVALID_CREATED_USER_ID');
  }
  return value.toLowerCase();
}

async function readBoundedJson(response) {
  if (response.body === null) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      if (!(result.value instanceof Uint8Array)) {
        throw new CanaryFailure('INVALID_PROVIDER_BODY');
      }
      total += result.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new CanaryFailure('PROVIDER_BODY_TOO_LARGE');
      }
      chunks.push(result.value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Cleanup must not replace the governed canary result.
    }
  }

  const body = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(body);
  } catch {
    throw new CanaryFailure('INVALID_PROVIDER_JSON');
  }
}

async function fetchWithTimeout(
  url,
  init,
  transportFailureCode = 'PROVIDER_TRANSPORT_FAILURE',
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store',
    });
  } catch {
    throw new CanaryFailure(transportFailureCode);
  } finally {
    clearTimeout(timer);
  }
}

function resolveAdminSecret() {
  const explicit = process.env.MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET;
  if (
    typeof explicit !== 'string' ||
    explicit.length < 16 ||
    explicit.length > 4_096 ||
    /\s/u.test(explicit)
  ) {
    throw new CanaryFailure('AUTH_ADMIN_SECRET_MISSING_OR_INVALID');
  }
  return explicit;
}

async function createDisposableHostedUser({
  origin,
  secret,
  runId,
  createCredentialHeaders,
}) {
  const syntheticEmail =
    `myeongha-auth-canary-${runId}-${randomUUID()}@example.com`;

  const response = await fetchWithTimeout(`${origin}/auth/v1/admin/users`, {
    method: 'POST',
    headers: Object.freeze({
      accept: 'application/json',
      'content-type': 'application/json',
      ...createCredentialHeaders(secret),
    }),
    body: JSON.stringify({
      email: syntheticEmail,
      email_confirm: true,
      user_metadata: {
        myeongha_canary: 'account-deletion-hosted-auth-v1',
        canary_run_id: runId,
      },
    }),
  });

  if (!response.ok) {
    try {
      void response.body?.cancel();
    } catch {
      // Best-effort body cancellation only.
    }
    throw new CanaryFailure(`CREATE_REJECTED_${response.status}`);
  }

  const payload = await readBoundedJson(response);
  return requireUuid(payload?.id ?? payload?.user?.id);
}

async function main() {
  requireExact(
    process.env.MYEONGHA_HOSTED_AUTH_CANARY_CONFIRM,
    CONFIRMATION,
    'CONFIRMATION_REQUIRED',
  );
  const runId = requireRunId(process.env.GITHUB_RUN_ID);
  const adminSecret = resolveAdminSecret();

  const {
    parseProductionAccountDeletionAuthAdminConfigV1,
    summarizeProductionAccountDeletionAuthAdminConfigV1,
  } = await import(
    '../dist/apps/api/src/production-account-deletion-auth-admin-config.js'
  );
  const {
    createSupabaseAuthAdminCredentialHeadersV1,
    createSupabaseAuthAdminUserDeletionAdapterV1,
  } = await import(
    '../dist/apps/api/src/supabase-auth-admin-user-deletion.js'
  );

  let config;
  try {
    config = parseProductionAccountDeletionAuthAdminConfigV1({
      ...process.env,
      MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET: adminSecret,
    });
  } catch {
    throw new CanaryFailure('AUTH_ADMIN_CONFIG_INVALID');
  }

  const summary = summarizeProductionAccountDeletionAuthAdminConfigV1(config);
  if (
    summary.supabaseProjectRef !== PROJECT_REF ||
    summary.adminSecretConfigured !== true
  ) {
    throw new CanaryFailure('GOVERNED_PROJECT_MISMATCH');
  }

  const deletion = createSupabaseAuthAdminUserDeletionAdapterV1({
    supabaseOrigin: config.supabaseOrigin,
    adminSecret: config.adminSecret,
  });

  let createdUserId = null;
  let terminallyAbsent = false;
  try {
    createdUserId = await createDisposableHostedUser({
      origin: config.supabaseOrigin,
      secret: config.adminSecret,
      runId,
      createCredentialHeaders: createSupabaseAuthAdminCredentialHeadersV1,
    });

    const first = await deletion.deleteUser({ authUserId: createdUserId });
    if (first.outcome !== 'deleted') {
      throw new CanaryFailure('FIRST_DELETE_NOT_DELETED');
    }

    const replay = await deletion.deleteUser({ authUserId: createdUserId });
    if (replay.outcome !== 'already_absent') {
      throw new CanaryFailure('DELETE_REPLAY_NOT_ALREADY_ABSENT');
    }
    terminallyAbsent = true;
  } catch (error) {
    if (error instanceof CanaryFailure) throw error;
    const providerCode =
      error && typeof error === 'object' && typeof error.code === 'string'
        ? error.code
        : 'UNKNOWN';
    throw new CanaryFailure(`DELETE_ADAPTER_${providerCode}`);
  } finally {
    if (createdUserId !== null && !terminallyAbsent) {
      try {
        await deletion.deleteUser({ authUserId: createdUserId });
      } catch {
        // A stranded canary is passwordless, uses a reserved example.com address,
        // and is tagged for operator cleanup. Do not print its identifier.
      }
    }
  }

  console.log(
    'MYEONGHA_HOSTED_AUTH_DELETE_CANARY_PASS created=true deleted=true replay_already_absent=true',
  );
}

main().catch((error) => {
  const code =
    error instanceof CanaryFailure ? error.code : 'UNCLASSIFIED_CANARY_FAILURE';
  console.error(`MYEONGHA_HOSTED_AUTH_DELETE_CANARY_FAIL code=${code}`);
  process.exitCode = 1;
});
