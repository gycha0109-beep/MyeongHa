import { describe, expect, it } from 'vitest';
import {
  enforceSeyeonVercelFetchRevealFenceV1,
  createSeyeonVercelStaticPreflightDenialV1,
} from '../apps/api/src/seyeon-vercel-fetch-reveal-fence-v1.js';

const CANARY = 'NEVER_RETURN_PRIVATE_SEYEON_ASSISTANT_BODY';

describe('Vercel Fetch final SeYeon response fence', () => {
  it.each([200, 201, 503, 500])(
    'replaces status %i and any private response text with a hard no-store HOLD',
    async status => {
      const original = Response.json({ ok: true, assistantText: CANARY }, {
        status,
        headers: { 'Cache-Control': 'no-store' },
      });
      const actual = enforceSeyeonVercelFetchRevealFenceV1(original, 'r12-safe');
      const body = await actual.text();
      expect(actual.status).toBe(503);
      expect(actual.headers.get('cache-control')).toBe('no-store');
      expect(body).toContain('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
      expect(body).toContain('r12-safe');
      expect(body).not.toContain(CANARY);
    },
  );

  it('rejects streaming even when the caller assigns a nominal 403 status', async () => {
    const candidate = new Response(CANARY, {
      status: 403,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
    });
    const actual = enforceSeyeonVercelFetchRevealFenceV1(candidate, 'r12-stream');
    expect(actual.status).toBe(503);
    expect(await actual.text()).not.toContain(CANARY);
  });

  it('preserves pre-provider, no-store 401 validation without disclosing assistant text', async () => {
    const input = createSeyeonVercelStaticPreflightDenialV1({
      status: 401, code: 'AUTH_REQUIRED', messageKey: 'auth.required',
      retryable: false, requestId: 'r12-auth',
    });
    const result = enforceSeyeonVercelFetchRevealFenceV1(
      input, 'r12-auth',
    );
    expect(result).toBe(input);
    expect(result.status).toBe(401);
    expect((await result.json()) as object).toMatchObject({
      error: { code: 'AUTH_REQUIRED' },
    });
  });
  it('rejects a registered 4xx if headers change or its body was already consumed', async () => {
    const registered = createSeyeonVercelStaticPreflightDenialV1({
      status: 401, code: 'AUTH_REQUIRED', messageKey: 'auth.required',
      retryable: false, requestId: 'r13-auth',
    });
    registered.headers.set('X-Private-Assistant', CANARY);
    const mutated = enforceSeyeonVercelFetchRevealFenceV1(registered, 'r13-mutated');
    expect(mutated.status).toBe(503);
    expect(await mutated.text()).not.toContain(CANARY);

    const consumed = createSeyeonVercelStaticPreflightDenialV1({
      status: 401, code: 'AUTH_REQUIRED', messageKey: 'auth.required',
      retryable: false, requestId: 'r13-auth',
    });
    await consumed.text();
    const result = enforceSeyeonVercelFetchRevealFenceV1(consumed, 'r13-consumed');
    expect(result.status).toBe(503);
    expect((await result.json()).error.code).toBe('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
  });

  it('rejects arbitrary static error claims before a Response can be trusted', () => {
    for (const invalid of [
      { status: 403, code: 'AUTH_REQUIRED', messageKey: 'auth.required', retryable: false },
      { status: 401, code: 'AUTH_REQUIRED', messageKey: 'custom.secret', retryable: false },
      { status: 401, code: 'AUTH_REQUIRED', messageKey: 'auth.required', retryable: true },
    ]) {
      expect(() => createSeyeonVercelStaticPreflightDenialV1({
        ...invalid, requestId: 'r13-invalid',
      })).toThrow('Unapproved');
    }
  });

  it('blocks forged unregistered 401/403 errors carrying private assistant bytes', async () => {
    for (const status of [401, 403]) {
      const forged = Response.json(
        { ok: false, error: { code: 'AUTH_REQUIRED' }, assistantText: CANARY },
        { status, headers: { 'Cache-Control': 'no-store' } },
      );
      const result = enforceSeyeonVercelFetchRevealFenceV1(forged, 'r13-forged');
      expect(result.status).toBe(503);
      expect(await result.text()).not.toContain(CANARY);
    }
  });

});
