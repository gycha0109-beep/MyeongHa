import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SupabaseMemberIdentityEvidenceVerifierV1,
  SupabaseMemberIdentityVerifierErrorV1,
} from './supabase-member-identity-verifier.js';

const supabaseOrigin = 'https://example.supabase.co';
const supabaseApiKey = 'test-publishable-key-that-is-long-enough';

function memberRequest(): Request {
  return new Request('https://myeongha.example/api/me', {
    headers: { Authorization: 'Bearer header.payload.signature' },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Supabase Member identity verifier deadline', () => {
  it('passes a deadline signal and preserves a valid member identity response', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(`${supabaseOrigin}/auth/v1/user`);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.signal?.aborted).toBe(false);
      expect(init?.headers).toMatchObject({
        apikey: supabaseApiKey,
        authorization: 'Bearer header.payload.signature',
      });
      return Response.json({ id: '11111111-1111-4111-8111-111111111111' });
    });
    const verifier = new SupabaseMemberIdentityEvidenceVerifierV1({
      supabaseOrigin,
      supabaseApiKey,
      fetchImpl,
      timeoutMs: 25,
    });

    await expect(verifier.verifyRequestIdentity(memberRequest())).resolves.toEqual({
      kind: 'member',
      verifiedAuthUserId: '11111111-1111-4111-8111-111111111111',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('classifies a deadline abort as upstream failure rather than invalid identity', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    });
    const verifier = new SupabaseMemberIdentityEvidenceVerifierV1({
      supabaseOrigin,
      supabaseApiKey,
      fetchImpl,
      timeoutMs: 25,
    });

    const pending = verifier.verifyRequestIdentity(memberRequest());
    const rejection = expect(pending).rejects.toMatchObject({
      name: 'SupabaseMemberIdentityVerifierErrorV1',
      code: 'SUPABASE_MEMBER_VERIFIER_UPSTREAM_FAILED',
    });

    await vi.advanceTimersByTimeAsync(25);
    await rejection;

    expect(observedSignal?.aborted).toBe(true);
  });

  it('rejects an invalid deadline as verifier configuration', () => {
    expect(() => new SupabaseMemberIdentityEvidenceVerifierV1({
      supabaseOrigin,
      supabaseApiKey,
      fetchImpl: vi.fn(),
      timeoutMs: 0,
    })).toThrowError(SupabaseMemberIdentityVerifierErrorV1);
  });
});
