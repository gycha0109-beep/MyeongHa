import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SUPABASE_AUTH_UPSTREAM_DEFAULT_TIMEOUT_MS_V1,
  SUPABASE_AUTH_UPSTREAM_MAX_TIMEOUT_MS_V1,
  SupabaseAuthUpstreamDeadlineConfigErrorV1,
  fetchSupabaseAuthWithDeadlineV1,
} from './supabase-auth-upstream-deadline.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Supabase Auth upstream deadline', () => {
  it('uses a finite governed default below the configured maximum', () => {
    expect(SUPABASE_AUTH_UPSTREAM_DEFAULT_TIMEOUT_MS_V1).toBe(5_000);
    expect(SUPABASE_AUTH_UPSTREAM_DEFAULT_TIMEOUT_MS_V1).toBeLessThan(
      SUPABASE_AUTH_UPSTREAM_MAX_TIMEOUT_MS_V1,
    );
  });

  it('passes an AbortSignal and clears its timer after a normal response', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.signal?.aborted).toBe(false);
      return Response.json({ ok: true });
    });

    const response = await fetchSupabaseAuthWithDeadlineV1(
      fetchImpl,
      'https://example.supabase.co/auth/v1/user',
      { method: 'GET' },
      25,
    );

    expect(response.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it('aborts a stalled upstream request at the application deadline', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    });

    const pending = fetchSupabaseAuthWithDeadlineV1(
      fetchImpl,
      'https://example.supabase.co/auth/v1/user',
      { method: 'GET' },
      25,
    );
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    await vi.advanceTimersByTimeAsync(25);
    await rejection;

    expect(observedSignal?.aborted).toBe(true);
  });

  it('rejects an invalid timeout before starting an upstream request', async () => {
    const fetchImpl = vi.fn();

    await expect(fetchSupabaseAuthWithDeadlineV1(
      fetchImpl,
      'https://example.supabase.co/auth/v1/user',
      { method: 'GET' },
      SUPABASE_AUTH_UPSTREAM_MAX_TIMEOUT_MS_V1 + 1,
    )).rejects.toBeInstanceOf(SupabaseAuthUpstreamDeadlineConfigErrorV1);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
