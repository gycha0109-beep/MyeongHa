import { describe, expect, it, vi } from 'vitest';
import {
  createSeyeonCloudflareStaticPreflightDenialV1,
  denySeyeonCloudflareFirstRevealBeforeProviderV1,
  enforceSeyeonCloudflareOfflineFetchEgressFenceV1,
  executeSeyeonCloudflareOfflineEgressFenceV1,
  executeSeyeonCloudflareOfflineFirstRevealV1,
  SEYEON_CLOUDFLARE_OFFLINE_REVEAL_FENCE_V1,
} from '../apps/api/src/seyeon-cloudflare-offline-reveal-fence-v1.js';

const CANARY = 'PRIVATE_SEYEON_ASSISTANT_TEXT_MUST_NEVER_LEAVE_THE_FENCE';
const SERVER_REQUEST_ID = '00000000-0000-4000-8000-000000000001';

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
    await assertSafeHold(denySeyeonCloudflareFirstRevealBeforeProviderV1(SERVER_REQUEST_ID), SERVER_REQUEST_ID);
  });

  it('does not invoke an explicitly supplied Provider/DB continuation', async () => {
    const provider = vi.fn().mockResolvedValue(new Response(CANARY, { status: 200 }));
    const result = await executeSeyeonCloudflareOfflineFirstRevealV1({
      requestId: SERVER_REQUEST_ID,
      executeProtectedCandidate: provider,
    });
    await assertSafeHold(result, SERVER_REQUEST_ID);
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
      requestId: SERVER_REQUEST_ID,
    });
    const passed = enforceSeyeonCloudflareOfflineFetchEgressFenceV1(created, SERVER_REQUEST_ID);
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
      expect(payload).toContain(SERVER_REQUEST_ID);
      expect(payload).not.toContain(CANARY);
    }
  });

  it('rejects arbitrary code, kind and requestId rather than registering a caller response', () => {
    expect(() => createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'model_response' as never,
      requestId: SERVER_REQUEST_ID,
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
        enforceSeyeonCloudflareOfflineFetchEgressFenceV1(forged, SERVER_REQUEST_ID),
        SERVER_REQUEST_ID,
      );
    }
  });

  it('does not trust a clone, mutated headers or already-read trusted body', async () => {
    const original = createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'auth_required', requestId: SERVER_REQUEST_ID,
    });
    const clone = original.clone();
    await assertSafeHold(enforceSeyeonCloudflareOfflineFetchEgressFenceV1(clone, SERVER_REQUEST_ID));

    const changed = createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'forbidden', requestId: SERVER_REQUEST_ID,
    });
    changed.headers.set('X-SeYeon-Debug', CANARY);
    await assertSafeHold(enforceSeyeonCloudflareOfflineFetchEgressFenceV1(changed, SERVER_REQUEST_ID));

    const streaming = createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'forbidden', requestId: SERVER_REQUEST_ID,
    });
    streaming.headers.set('Content-Type', 'text/event-stream');
    await assertSafeHold(enforceSeyeonCloudflareOfflineFetchEgressFenceV1(streaming, SERVER_REQUEST_ID));

    const read = createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'not_found', requestId: SERVER_REQUEST_ID,
    });
    await read.text();
    await assertSafeHold(enforceSeyeonCloudflareOfflineFetchEgressFenceV1(read, SERVER_REQUEST_ID));

    const locked = createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'not_found', requestId: SERVER_REQUEST_ID,
    });
    const reader = locked.body?.getReader();
    try {
      await assertSafeHold(enforceSeyeonCloudflareOfflineFetchEgressFenceV1(locked, SERVER_REQUEST_ID));
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
      await assertSafeHold(enforceSeyeonCloudflareOfflineFetchEgressFenceV1(candidate, SERVER_REQUEST_ID));
    },
  );

  it('holds empty/undefined/non-Response/204 result without reading private payload', async () => {
    for (const candidate of [undefined, null, { status: 403, body: CANARY }, new Response(null, { status: 204 })]) {
      await assertSafeHold(enforceSeyeonCloudflareOfflineFetchEgressFenceV1(candidate, SERVER_REQUEST_ID));
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
    const actual = enforceSeyeonCloudflareOfflineFetchEgressFenceV1(candidate, SERVER_REQUEST_ID);
    await assertSafeHold(actual);
    expect(actual.headers.get('content-type')).toContain('application/json');
  });

  it('returns a fixed 503 for thrown errors and async rejected/time-limited candidates', async () => {
    const thrown = await executeSeyeonCloudflareOfflineEgressFenceV1({
      requestId: SERVER_REQUEST_ID,
      executeCandidate: () => { throw new Error(CANARY); },
    });
    await assertSafeHold(thrown);

    const rejected = await executeSeyeonCloudflareOfflineEgressFenceV1({
      requestId: SERVER_REQUEST_ID,
      executeCandidate: async () => Promise.reject(new Error('upstream timeout ' + CANARY)),
    });
    await assertSafeHold(rejected);

    const unsafeSuccess = await executeSeyeonCloudflareOfflineEgressFenceV1({
      requestId: SERVER_REQUEST_ID,
      executeCandidate: async () => Response.json({ assistantText: CANARY }),
    });
    await assertSafeHold(unsafeSuccess);
  });

  it('preserves only the explicitly factory-created object on async egress', async () => {
    const knownDenial = createSeyeonCloudflareStaticPreflightDenialV1({
      kind: 'invalid_request', requestId: SERVER_REQUEST_ID,
    });
    const output = await executeSeyeonCloudflareOfflineEgressFenceV1({
      requestId: SERVER_REQUEST_ID,
      executeCandidate: async () => knownDenial,
    });
    expect(output).toBe(knownDenial);
  });
});
