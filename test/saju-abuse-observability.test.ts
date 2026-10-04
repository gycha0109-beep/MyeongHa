import { describe, expect, it, vi } from 'vitest';
import {
  SAJU_ABUSE_CLIENT_KEY_VERSION_V1,
  SAJU_ABUSE_OBSERVATION_SCHEMA_VERSION_V1,
  SAJU_ABUSE_OUTCOME_SCHEMA_VERSION_V1,
  createSajuAbuseObservedIdentityVerifierV1,
  fingerprintSajuAbuseClientV1,
  observeSajuAbuseOutcomeV1,
} from '../apps/api/src/saju-abuse-observability.js';

const SECRET = 'test-saju-abuse-observation-secret-at-least-thirty-two-bytes';

describe('Saju abuse observe-only telemetry', () => {
  it('emits a privacy-safe Member event without raw identity evidence', async () => {
    const verifiedAuthUserId = '22222222-2222-4222-8222-222222222222';
    const eventWriter = vi.fn();
    const verifier = createSajuAbuseObservedIdentityVerifierV1({
      delegate: {
        verifyRequestIdentity: vi.fn(async () => ({
          kind: 'member',
          verifiedAuthUserId,
        } as const)),
      },
      routeId: 'api.me.saju.calculation',
      requestId: 'request:saju-abuse:member',
      secret: SECRET,
      now: () => Date.parse('2026-10-03T00:30:00.000Z'),
      eventWriter,
    });

    const evidence = await verifier.verifyRequestIdentity(
      new Request('https://myeongha.example/api/me/saju/calculation', {
        method: 'POST',
      }),
    );

    expect(evidence).toEqual({ kind: 'member', verifiedAuthUserId });
    expect(eventWriter).toHaveBeenCalledTimes(1);
    const event = eventWriter.mock.calls[0]?.[0];
    expect(event).toEqual({
      schemaVersion: SAJU_ABUSE_OBSERVATION_SCHEMA_VERSION_V1,
      mode: 'observe_only',
      routeId: 'api.me.saju.calculation',
      subjectKind: 'member',
      clientKeyVersion: SAJU_ABUSE_CLIENT_KEY_VERSION_V1,
      clientKey: fingerprintSajuAbuseClientV1({
        evidence: { kind: 'member', verifiedAuthUserId },
        secret: SECRET,
      }),
      requestId: 'request:saju-abuse:member',
      occurredAt: '2026-10-03T00:30:00.000Z',
    });
    expect(JSON.stringify(event)).not.toContain(verifiedAuthUserId);
  });

  it('emits a distinct privacy-safe Guest key without logging the verified Guest hash', async () => {
    const verifiedGuestTokenHash =
      'myeongha-guest-bearer-hmac-sha256-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const eventWriter = vi.fn();
    const verifier = createSajuAbuseObservedIdentityVerifierV1({
      delegate: {
        verifyRequestIdentity: vi.fn(async () => ({
          kind: 'guest',
          verifiedGuestTokenHash,
        } as const)),
      },
      routeId: 'api.me.saju.preview-reading',
      requestId: 'request:saju-abuse:guest',
      secret: SECRET,
      eventWriter,
    });

    await verifier.verifyRequestIdentity(
      new Request('https://myeongha.example/api/me/saju/preview-reading', {
        method: 'POST',
      }),
    );

    const event = eventWriter.mock.calls[0]?.[0];
    expect(event.subjectKind).toBe('guest');
    expect(event.clientKey).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(event)).not.toContain(verifiedGuestTokenHash);
  });

  it('does not emit for rejected credentials', async () => {
    const eventWriter = vi.fn();
    const verifier = createSajuAbuseObservedIdentityVerifierV1({
      delegate: {
        verifyRequestIdentity: vi.fn(async () => null),
      },
      routeId: 'api.me.saju.calculation',
      requestId: 'request:saju-abuse:rejected',
      secret: SECRET,
      eventWriter,
    });

    await expect(
      verifier.verifyRequestIdentity(
        new Request('https://myeongha.example/api/me/saju/calculation', {
          method: 'POST',
        }),
      ),
    ).resolves.toBeNull();
    expect(eventWriter).not.toHaveBeenCalled();
  });

  it('skips an observation when the baseline clock is invalid without changing auth authority', async () => {
    const evidence = {
      kind: 'member',
      verifiedAuthUserId: '22222222-2222-4222-8222-222222222222',
    } as const;
    const eventWriter = vi.fn();
    const verifier = createSajuAbuseObservedIdentityVerifierV1({
      delegate: {
        verifyRequestIdentity: vi.fn(async () => evidence),
      },
      routeId: 'api.me.saju.calculation',
      requestId: 'request:saju-abuse:invalid-clock',
      secret: SECRET,
      now: () => Number.NaN,
      eventWriter,
    });

    await expect(
      verifier.verifyRequestIdentity(
        new Request('https://myeongha.example/api/me/saju/calculation', {
          method: 'POST',
        }),
      ),
    ).resolves.toEqual(evidence);
    expect(eventWriter).not.toHaveBeenCalled();
  });

  it('isolates observation-writer failure from authentication authority', async () => {
    const evidence = {
      kind: 'member',
      verifiedAuthUserId: '22222222-2222-4222-8222-222222222222',
    } as const;
    const verifier = createSajuAbuseObservedIdentityVerifierV1({
      delegate: {
        verifyRequestIdentity: vi.fn(async () => evidence),
      },
      routeId: 'api.me.saju.calculation',
      requestId: 'request:saju-abuse:writer-failure',
      secret: SECRET,
      eventWriter() {
        throw new Error('synthetic logging failure');
      },
    });

    await expect(
      verifier.verifyRequestIdentity(
        new Request('https://myeongha.example/api/me/saju/calculation', {
          method: 'POST',
        }),
      ),
    ).resolves.toEqual(evidence);
  });

  it('emits a request-correlatable outcome event without duplicating client identity', () => {
    const eventWriter = vi.fn();

    expect(() =>
      observeSajuAbuseOutcomeV1({
        routeId: 'api.me.saju.calculation',
        requestId: 'request:saju-abuse:outcome',
        httpStatus: 503,
        now: () => Date.parse('2026-10-03T00:31:00.000Z'),
        eventWriter,
      }),
    ).not.toThrow();

    expect(eventWriter).toHaveBeenCalledTimes(1);
    expect(eventWriter.mock.calls[0]?.[0]).toEqual({
      schemaVersion: SAJU_ABUSE_OUTCOME_SCHEMA_VERSION_V1,
      mode: 'observe_only',
      routeId: 'api.me.saju.calculation',
      requestId: 'request:saju-abuse:outcome',
      httpStatus: 503,
      completedAt: '2026-10-03T00:31:00.000Z',
    });
    expect(eventWriter.mock.calls[0]?.[0]).not.toHaveProperty('clientKey');
    expect(eventWriter.mock.calls[0]?.[0]).not.toHaveProperty('subjectKind');
  });

  it('keeps invalid clocks and writer failures outside request authority for outcomes', () => {
    const invalidClockWriter = vi.fn();

    expect(() =>
      observeSajuAbuseOutcomeV1({
        routeId: 'api.me.saju.preview-reading',
        requestId: 'request:saju-abuse:invalid-outcome-clock',
        httpStatus: 200,
        now: () => Number.POSITIVE_INFINITY,
        eventWriter: invalidClockWriter,
      }),
    ).not.toThrow();
    expect(invalidClockWriter).not.toHaveBeenCalled();

    expect(() =>
      observeSajuAbuseOutcomeV1({
        routeId: 'api.me.saju.preview-reading',
        requestId: 'request:saju-abuse:outcome-writer-failure',
        httpStatus: 200,
        eventWriter() {
          throw new Error('synthetic outcome logging failure');
        },
      }),
    ).not.toThrow();
  });

  it('domain-separates Member and Guest client keys', () => {
    const identifier = 'same-logical-value';
    const member = fingerprintSajuAbuseClientV1({
      evidence: { kind: 'member', verifiedAuthUserId: identifier },
      secret: SECRET,
    });
    const guest = fingerprintSajuAbuseClientV1({
      evidence: { kind: 'guest', verifiedGuestTokenHash: identifier },
      secret: SECRET,
    });

    expect(member).not.toBe(guest);
  });
});
