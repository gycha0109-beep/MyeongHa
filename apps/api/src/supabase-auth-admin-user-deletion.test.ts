import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseProductionAccountDeletionAuthAdminConfigV1,
  summarizeProductionAccountDeletionAuthAdminConfigV1,
} from './production-account-deletion-auth-admin-config.js';
import {
  createSupabaseAuthAdminUserDeletionAdapterV1,
  SupabaseAuthAdminUserDeletionErrorV1,
  SUPABASE_AUTH_ADMIN_USER_DELETE_DEFAULT_TIMEOUT_MS_V1,
  type SupabaseAuthAdminUserDeletionFetchV1,
} from './supabase-auth-admin-user-deletion.js';

const ORIGIN = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
const AUTH_USER_ID = '715ed5db-f090-4b8c-a067-640ecee36aa0';
const ADMIN_SECRET = `sb_secret_${'a'.repeat(48)}`;
const PUBLIC_KEY = `sb_publishable_${'b'.repeat(48)}`;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('production account-deletion Auth Admin config', () => {
  it('keeps the privileged secret server-only and out of summaries', () => {
    const config = parseProductionAccountDeletionAuthAdminConfigV1({
      MYEONGHA_SUPABASE_URL: ORIGIN,
      MYEONGHA_SUPABASE_API_KEY: PUBLIC_KEY,
      MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET: ADMIN_SECRET,
    });

    expect(config).toEqual({
      supabaseOrigin: ORIGIN,
      adminSecret: ADMIN_SECRET,
    });

    const summary = summarizeProductionAccountDeletionAuthAdminConfigV1(config);
    expect(summary).toEqual({
      supabaseProjectRef: 'cnsfpcdiyofqvhpcegfc',
      supabaseOrigin: ORIGIN,
      adminSecretConfigured: true,
    });
    expect(JSON.stringify(summary)).not.toContain(ADMIN_SECRET);
  });

  it('rejects ordinary API-key reuse and non-governed origins', () => {
    expect(() =>
      parseProductionAccountDeletionAuthAdminConfigV1({
        MYEONGHA_SUPABASE_URL: ORIGIN,
        MYEONGHA_SUPABASE_API_KEY: ADMIN_SECRET,
        MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET: ADMIN_SECRET,
      }),
    ).toThrow(
      expect.objectContaining({
        name: 'ProductionAccountDeletionAuthAdminConfigErrorV1',
      }),
    );

    expect(() =>
      parseProductionAccountDeletionAuthAdminConfigV1({
        MYEONGHA_SUPABASE_URL: 'https://other-project.supabase.co',
        MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET: ADMIN_SECRET,
      }),
    ).toThrow(
      expect.objectContaining({
        name: 'ProductionAccountDeletionAuthAdminConfigErrorV1',
      }),
    );
  });
});

describe('Supabase Auth Admin account-deletion adapter', () => {
  it('performs an exact server-side hard delete without returning provider payload', async () => {
    const calls: Array<{
      url: string;
      init: RequestInit;
    }> = [];

    const fetchImpl: SupabaseAuthAdminUserDeletionFetchV1 = async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        user: {
          id: AUTH_USER_ID,
          email: 'must-not-be-read@example.com',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const mutableConfig = {
      supabaseOrigin: ORIGIN,
      adminSecret: ADMIN_SECRET,
      fetchImpl,
    };
    const adapter = createSupabaseAuthAdminUserDeletionAdapterV1(mutableConfig);
    mutableConfig.adminSecret = `sb_secret_${'z'.repeat(48)}`;

    const result = await adapter.deleteUser({ authUserId: AUTH_USER_ID });

    expect(result).toEqual({ outcome: 'deleted' });
    expect(JSON.stringify(result)).not.toContain(AUTH_USER_ID);
    expect(JSON.stringify(result)).not.toContain(ADMIN_SECRET);
    expect(calls).toHaveLength(1);

    const call = calls[0];
    expect(call?.url).toBe(
      `${ORIGIN}/auth/v1/admin/users/${AUTH_USER_ID}`,
    );
    expect(call?.init.method).toBe('DELETE');
    expect(call?.init.redirect).toBe('error');
    expect(call?.init.cache).toBe('no-store');
    expect(call?.init.body).toBe(
      JSON.stringify({ should_soft_delete: false }),
    );

    const headers = call?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${ADMIN_SECRET}`);
    expect(headers.apikey).toBe(ADMIN_SECRET);
    expect(headers['content-type']).toBe('application/json');
  });

  it('treats an already-absent Auth user as idempotent terminal success', async () => {
    const adapter = createSupabaseAuthAdminUserDeletionAdapterV1({
      supabaseOrigin: ORIGIN,
      adminSecret: ADMIN_SECRET,
      fetchImpl: async () => new Response(null, { status: 404 }),
    });

    await expect(
      adapter.deleteUser({ authUserId: AUTH_USER_ID }),
    ).resolves.toEqual({ outcome: 'already_absent' });
  });

  it('rejects invalid Auth UUIDs before any privileged provider call', async () => {
    const fetchImpl = vi.fn<SupabaseAuthAdminUserDeletionFetchV1>();
    const adapter = createSupabaseAuthAdminUserDeletionAdapterV1({
      supabaseOrigin: ORIGIN,
      adminSecret: ADMIN_SECRET,
      fetchImpl,
    });

    await expect(
      adapter.deleteUser({ authUserId: 'client-controlled-not-a-uuid' }),
    ).rejects.toMatchObject({
      code: 'INVALID_AUTH_USER_ID',
      retryable: false,
    } satisfies Partial<SupabaseAuthAdminUserDeletionErrorV1>);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'PROVIDER_AUTH_FAILURE', false],
    [403, 'PROVIDER_AUTH_FAILURE', false],
    [429, 'PROVIDER_RETRYABLE_FAILURE', true],
    [500, 'PROVIDER_RETRYABLE_FAILURE', true],
    [400, 'PROVIDER_REJECTED', false],
  ] as const)(
    'classifies provider status %s without leaking the admin secret',
    async (status, code, retryable) => {
      const adapter = createSupabaseAuthAdminUserDeletionAdapterV1({
        supabaseOrigin: ORIGIN,
        adminSecret: ADMIN_SECRET,
        fetchImpl: async () => new Response('provider detail', { status }),
      });

      const error = await adapter
        .deleteUser({ authUserId: AUTH_USER_ID })
        .catch((value: unknown) => value);

      expect(error).toMatchObject({
        name: 'SupabaseAuthAdminUserDeletionErrorV1',
        code,
        retryable,
        httpStatus: status,
      });
      expect(String((error as Error).message)).not.toContain(ADMIN_SECRET);
      expect(JSON.stringify(error)).not.toContain(ADMIN_SECRET);
    },
  );

  it('aborts and classifies a provider deadline as retryable timeout', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;

    const fetchImpl: SupabaseAuthAdminUserDeletionFetchV1 = async (_url, init) => {
      observedSignal = init.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    };

    const adapter = createSupabaseAuthAdminUserDeletionAdapterV1({
      supabaseOrigin: ORIGIN,
      adminSecret: ADMIN_SECRET,
      fetchImpl,
    });

    const pending = adapter.deleteUser({ authUserId: AUTH_USER_ID });
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'TIMEOUT',
      retryable: true,
    } satisfies Partial<SupabaseAuthAdminUserDeletionErrorV1>);

    await vi.advanceTimersByTimeAsync(
      SUPABASE_AUTH_ADMIN_USER_DELETE_DEFAULT_TIMEOUT_MS_V1,
    );
    await rejection;
    expect(observedSignal).toBeInstanceOf(AbortSignal);
    expect(observedSignal?.aborted).toBe(true);
  });
});
