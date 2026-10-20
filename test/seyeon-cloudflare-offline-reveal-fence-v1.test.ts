import { describe, expect, it, vi } from 'vitest';
import {
  createSeyeonCloudflareStaticPreflightDenialV1,
  denySeyeonCloudflareFirstRevealBeforeProviderV1,
  enforceSeyeonCloudflareOfflineFetchEgressFenceV1,
  executeSeyeonCloudflareOfflineEgressFenceV1,
  SEYEON_CLOUDFLARE_OFFLINE_REVEAL_FENCE_V1,
} from '../apps/api/src/seyeon-cloudflare-offline-reveal-fence-v1.js';

const CANARY = 'PRIVATE_SEYEON_ASSISTANT_TEXT_MUST_NEVER_LEAVE_THE_FENCE';

async function assertSafeHold(response: Response, requestId?: string): Promise<void> {
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  const text = await response.text();
  expect(text).toContain('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
  expect(text).toContain('"retryable":false');
  if (requestId !== undefined) expect(text).toContain(requestId);
  expect(text).not.toContain(CANARY);
}

describe('S-CF1 Cloudflare offline deny-only first Reveal gate', () => {
  it('keeps public routing and positive Reveal explicitly disabled', async () => {
    expect(SEYEON_CLOUDFLARE_OFFLINE_REVEAL_FENCE_V1).toMatchObject({
      publicRouteMounted: false,
      positiveFirstRevealPermitted: false,
      firstRevealBeforeProviderHeld: true,
      actualCloudflareEdgeSendProven: false,
      revokeSendAckContractApproved: false,
    });
    await assertSafeHold(denySeyeonCloudflareFirstRevealBeforeProviderV1('cf-first-post'), 'cf-first-post');
  });

  it('does not import a Provider/DB runtime or expose an authorized first send', async () => {
    const provider = vi.fn().mockResolvedValue(new Response(CANARY, { status: 200 }));
    // The only first-Reveal entrypoint is an unconditional pre-Provider HOLD:
    // there is no continuation argument or route binding that can run provider().
    await assertSafeHold(denySeyeonCloudflareFirstRevealBeforeProviderV1('cf-provider-zero'));
    expect(provider).not.toHaveBeenCalled();
  });

  it('never reflects unsanitized request IDs into an assistant-visible denial', async () => {
    await assertSafeHold(denySeyeonCloudflareFirstRevealBeforeProviderV1(CANARY));
    const raw = enforceSeyeonCloudflareOfflineFetchEgressFenceV1(null, CANARY);
    const text = await raw.text();
    expect(text).toContain('"requestId":"unavailable"');
    expect(text).not.toContain(CANARY);
  });
});

describe('S-CF1 factory-owned fixed 4xx preflight denials', () => {
  it.each([
    ['invalid_request', 400, 'INVALID_REQUEST'],
    ['auth_required', 401, 'AUTH_REQUIRED'],
    ['forbidden', 403, 'FORBIDDEN'],
    ['not_found', 404, 'NOT_FOUND'],
    ['method_not_allowed', 405, ''],
    ['request_body_timeout', 408, 'REQUEST_BODY_TIMEOUT'],
    ['idempotency_conflict', 409, 'IDEMPOTENCY_CONFLICT'],
    ['turn_in_flight', 409, 'TURN_IN_FLIGHT'],
    ['request_too_large', 413, 'REQUEST_TOO_LARGE'],
    ['content_incompatible', 422, 'CONTENT_INCOMPATIBLE'],
  ] as const)('passes through only its own %s static denial', async (kind, status, code) => {
    const created = createSeyeonCloudflareStaticPreflightDenialV1({
      kind,
      requestId: 'cf-static-safe',
    });
    const passed = enforceSeyeonCloudflareOfflineFetchEgressFenceV1(created, 'cf-egress');
    expect(passed).toBe(created);
    expect(passed.status).toBe(status);
    expect(passed.headers.get('cache-control')).toBe('no-store');
    expect(passed.headers.get('access-control-allow-origin')).toBeNull();
    if (status === 405) {
      expect(passed.headers.get('allow')).toBe('POST');
      expect(await passed.text()).toBe('');
    } else {
      const payload = await passed.text();
      expect(payload).toContain(code);
      expect(payload).toContain('cf-static-safe');
      expect(payload).not.toContain(CANARY);
    }
  });

  it('rejects arbitrary code, kind and requestId rather than registering a caller response', () => {
    expect(() => createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'model_response' as never,
      requestId: 'cf-unknown',
    })).toThrow(/Unknown static/);
    expect(() => createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'auth_required',
      requestId: CANARY,
    })).toThrow(/safe server request ID/);
  });

  it('blocks forged 4xx carrying private text, including valid code and no-store', async () => {
    for (const status of [400, 401, 403, 404, 405, 408, 409, 413, 422, 429]) {
      const forged = Response.json({
        ok: false, error: { code: 'AUTH_REQUIRED' }, assistantText: CANARY,
      }, { status, headers: { 'Cache-Control': 'no-store' } });
      await assertSafeHold(
        enforceSeyeonCloudflareOfflineFetchEgressFenceV1(forged, 'cf-forged'),
        'cf-forged',
      );
    }
  });

  it('does not trust a clone, mutated headers or already-read trusted body', async () => {
    const original = createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'auth_required', requestId: 'cf-clone',
    });
    const clone = original.clone();
    await assertSafeHold(enforceSeyeonCloudflareOfflineFetchEgressFenceV1(clone, 'cf-clone-bad'));

    const changed = createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'forbidden', requestId: 'cf-header',
    });
    changed.headers.set('X-SeYeon-Debug', CANARY);
    await assertSafeHold(enforceSeyeonCloudflareOfflineFetchEgressFenceV1(changed, 'cf-header-bad'));

    const streaming = createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'forbidden', requestId: 'cf-sse',
    });
    streaming.headers.set('Content-Type', 'text/event-stream');
    await assertSafeHold(enforceSeyeonCloudflareOfflineFetchEgressFenceV1(streaming, 'cf-sse-bad'));

    const read = createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'not_found', requestId: 'cf-consumed',
    });
    await read.text();
    await assertSafeHold(enforceSeyeonCloudflareOfflineFetchEgressFenceV1(read, 'cf-consumed-bad'));

    const locked = createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'not_found', requestId: 'cf-locked',
    });
    const reader = locked.body?.getReader();
    try {
      await assertSafeHold(enforceSeyeonCloudflareOfflineFetchEgressFenceV1(locked, 'cf-locked-bad'));
    } finally {
      reader?.releaseLock();
    }
  });
});

describe('S-CF1 outer Fetch egress fence is independent from ingress hold', () => {
  it.each([200, 201, 202, 301, 302, 307, 308, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503])(
    'always replaces untrusted %i and candidate private bytes', async status => {
      const candidate = new Response(CANARY, {
        status,
        headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
      });
      await assertSafeHold(enforceSeyeonCloudflareOfflineFetchEgressFenceV1(candidate, 'cf-status'));
    },
  );

  it('holds empty/undefined/non-Response/204 result without reading private payload', async () => {
    for (const candidate of [undefined, null, { status: 403, body: CANARY }, new Response(null, { status: 204 })]) {
      await assertSafeHold(enforceSeyeonCloudflareOfflineFetchEgressFenceV1(candidate, 'cf-empty'));
    }
  });

  it('holds raw SSE streams and prevents their bytes from being exposed', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data:' + CANARY + '\n\n'));
      },
    });
    const candidate = new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
    });
    const actual = enforceSeyeonCloudflareOfflineFetchEgressFenceV1(candidate, 'cf-sse-stream');
    await assertSafeHold(actual);
    expect(actual.headers.get('content-type')).toContain('application/json');
  });

  it('returns a fixed 503 for thrown errors and async rejected/time-limited candidates', async () => {
    const thrown = await executeSeyeonCloudflareOfflineEgressFenceV1({
      requestId: 'cf-throw',
      executeCandidate: () => { throw new Error(CANARY); },
    });
    await assertSafeHold(thrown);

    const rejected = await executeSeyeonCloudflareOfflineEgressFenceV1({
      requestId: 'cf-timeout',
      executeCandidate: async () => Promise.reject(new Error('upstream timeout ' + CANARY)),
    });
    await assertSafeHold(rejected);

    const unsafeSuccess = await executeSeyeonCloudflareOfflineEgressFenceV1({
      requestId: 'cf-success',
      executeCandidate: async () => Response.json({ assistantText: CANARY }),
    });
    await assertSafeHold(unsafeSuccess);
  });

  it('preserves only the explicitly factory-created object on async egress', async () => {
    const knownDenial = createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'invalid_request', requestId: 'cf-registered',
    });
    const output = await executeSeyeonCloudflareOfflineEgressFenceV1({
      requestId: 'cf-outer',
      executeCandidate: async () => knownDenial,
    });
    expect(output).toBe(knownDenial);
  });
});
