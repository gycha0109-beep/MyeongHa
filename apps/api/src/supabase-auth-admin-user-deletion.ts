import {
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
} from './production-user-data-runtime-config.js';

export const SUPABASE_AUTH_ADMIN_USER_DELETE_DEFAULT_TIMEOUT_MS_V1 = 5_000 as const;
export const SUPABASE_AUTH_ADMIN_USER_DELETE_MAX_TIMEOUT_MS_V1 = 30_000 as const;

export type SupabaseAuthAdminUserDeletionOutcomeV1 =
  | 'deleted'
  | 'already_absent';

export interface SupabaseAuthAdminUserDeletionResultV1 {
  readonly outcome: SupabaseAuthAdminUserDeletionOutcomeV1;
}

export type SupabaseAuthAdminUserDeletionFailureCodeV1 =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_AUTH_USER_ID'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'PROVIDER_AUTH_FAILURE'
  | 'PROVIDER_RETRYABLE_FAILURE'
  | 'PROVIDER_REJECTED'
  | 'PROVIDER_UNEXPECTED_STATUS';

export class SupabaseAuthAdminUserDeletionErrorV1 extends Error {
  constructor(
    readonly code: SupabaseAuthAdminUserDeletionFailureCodeV1,
    message: string,
    readonly retryable: boolean,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = 'SupabaseAuthAdminUserDeletionErrorV1';
  }
}

export interface SupabaseAuthAdminUserDeletionPortV1 {
  deleteUser(input: {
    readonly authUserId: string;
  }): Promise<SupabaseAuthAdminUserDeletionResultV1>;
}

export type SupabaseAuthAdminUserDeletionFetchV1 = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export interface SupabaseAuthAdminUserDeletionAdapterConfigV1 {
  readonly supabaseOrigin: string;
  readonly adminSecret: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: SupabaseAuthAdminUserDeletionFetchV1;
}

const AUTH_USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function fail(
  code: SupabaseAuthAdminUserDeletionFailureCodeV1,
  message: string,
  retryable: boolean,
  httpStatus: number | null = null,
): never {
  throw new SupabaseAuthAdminUserDeletionErrorV1(
    code,
    message,
    retryable,
    httpStatus,
  );
}

function resolveOrigin(value: string): typeof MYEONGHA_PRODUCTION_SUPABASE_ORIGIN {
  if (value !== MYEONGHA_PRODUCTION_SUPABASE_ORIGIN) {
    return fail(
      'INVALID_CONFIGURATION',
      'Supabase Auth Admin deletion must target the governed production origin.',
      false,
    );
  }
  return MYEONGHA_PRODUCTION_SUPABASE_ORIGIN;
}

function resolveAdminSecret(value: string): string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length < 32 ||
    value.length > 4_096 ||
    /\s/u.test(value)
  ) {
    return fail(
      'INVALID_CONFIGURATION',
      'Supabase Auth Admin deletion credential is invalid.',
      false,
    );
  }
  return value;
}

export function createSupabaseAuthAdminCredentialHeadersV1(
  value: string,
): Readonly<Record<string, string>> {
  const adminSecret = resolveAdminSecret(value);
  if (adminSecret.startsWith('sb_secret_')) {
    return Object.freeze({
      apikey: adminSecret,
    });
  }
  return Object.freeze({
    authorization: `Bearer ${adminSecret}`,
    apikey: adminSecret,
  });
}

function resolveTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? SUPABASE_AUTH_ADMIN_USER_DELETE_DEFAULT_TIMEOUT_MS_V1;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > SUPABASE_AUTH_ADMIN_USER_DELETE_MAX_TIMEOUT_MS_V1
  ) {
    return fail(
      'INVALID_CONFIGURATION',
      `Supabase Auth Admin deletion timeout must be an integer between 1 and ${String(SUPABASE_AUTH_ADMIN_USER_DELETE_MAX_TIMEOUT_MS_V1)}.`,
      false,
    );
  }
  return timeoutMs;
}

function requireAuthUserId(value: string): string {
  if (typeof value !== 'string' || !AUTH_USER_ID.test(value)) {
    return fail(
      'INVALID_AUTH_USER_ID',
      'Supabase Auth Admin deletion requires a canonical Auth user UUID.',
      false,
    );
  }
  return value.toLowerCase();
}

function cancelUnusedBody(response: Response): void {
  try {
    if (response.body === null) return;
    void response.body.cancel().catch(() => undefined);
  } catch {
    return;
  }
}

function classifyStatus(status: number): SupabaseAuthAdminUserDeletionResultV1 {
  if (status === 200) {
    return Object.freeze({ outcome: 'deleted' });
  }
  if (status === 404) {
    return Object.freeze({ outcome: 'already_absent' });
  }
  if (status === 401 || status === 403) {
    return fail(
      'PROVIDER_AUTH_FAILURE',
      'Supabase Auth Admin deletion credential was rejected.',
      false,
      status,
    );
  }
  if (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status >= 500 && status <= 599)
  ) {
    return fail(
      'PROVIDER_RETRYABLE_FAILURE',
      'Supabase Auth Admin deletion failed with a retryable provider status.',
      true,
      status,
    );
  }
  if (status >= 400 && status <= 499) {
    return fail(
      'PROVIDER_REJECTED',
      'Supabase Auth Admin deletion was rejected by the provider.',
      false,
      status,
    );
  }
  return fail(
    'PROVIDER_UNEXPECTED_STATUS',
    'Supabase Auth Admin deletion returned an unsupported provider status.',
    false,
    status,
  );
}

const defaultFetch: SupabaseAuthAdminUserDeletionFetchV1 = async (input, init) =>
  fetch(input, init);

async function deleteWithTimeout(input: {
  readonly url: string;
  readonly adminSecret: string;
  readonly timeoutMs: number;
  readonly fetchImpl: SupabaseAuthAdminUserDeletionFetchV1;
}): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      const error = new SupabaseAuthAdminUserDeletionErrorV1(
        'TIMEOUT',
        'Supabase Auth Admin deletion timed out.',
        true,
      );
      reject(error);
      controller.abort(error);
    }, input.timeoutMs);
  });

  try {
    const credentialHeaders = createSupabaseAuthAdminCredentialHeadersV1(
      input.adminSecret,
    );
    return await Promise.race([
      input.fetchImpl(input.url, {
        method: 'DELETE',
        headers: Object.freeze({
          accept: 'application/json',
          'content-type': 'application/json',
          ...credentialHeaders,
        }),
        body: JSON.stringify({ should_soft_delete: false }),
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
      }),
      deadline,
    ]);
  } catch (error) {
    if (
      error instanceof SupabaseAuthAdminUserDeletionErrorV1 &&
      error.code === 'TIMEOUT'
    ) {
      throw error;
    }
    if (timedOut) {
      return fail(
        'TIMEOUT',
        'Supabase Auth Admin deletion timed out.',
        true,
      );
    }
    return fail(
      'NETWORK_FAILURE',
      'Supabase Auth Admin deletion failed before an HTTP response was accepted.',
      true,
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function createSupabaseAuthAdminUserDeletionAdapterV1(
  config: SupabaseAuthAdminUserDeletionAdapterConfigV1,
): SupabaseAuthAdminUserDeletionPortV1 {
  const supabaseOrigin = resolveOrigin(config.supabaseOrigin);
  const adminSecret = resolveAdminSecret(config.adminSecret);
  const timeoutMs = resolveTimeoutMs(config.timeoutMs);
  const fetchImpl = config.fetchImpl ?? defaultFetch;

  return Object.freeze({
    async deleteUser(input: { readonly authUserId: string }): Promise<SupabaseAuthAdminUserDeletionResultV1> {
      const authUserId = requireAuthUserId(input.authUserId);
      const response = await deleteWithTimeout({
        url: `${supabaseOrigin}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
        adminSecret,
        timeoutMs,
        fetchImpl,
      });
      cancelUnusedBody(response);
      return classifyStatus(response.status);
    },
  });
}
