import { describe, expect, it, vi } from 'vitest';
import { admitSajuAbuseHttpRequestV1, type SajuAbuseAdmissionGateV1 } from '../apps/api/src/saju-abuse-admission-http.js';
import { handleCurrentSubjectSajuCalculationRequestV1 } from '../apps/api/src/current-subject-saju-calculation-http.js';
import { handleCurrentSubjectSajuPreviewReadingRequestV1 } from '../apps/api/src/current-subject-saju-preview-reading-http.js';
import { fingerprintSajuAbuseClientV1 } from '../apps/api/src/saju-abuse-observability.js';
import { executeSecurityObservedRequestV1, type SecurityEventV1 } from '../apps/api/src/security-observability.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';

const NOW = Date.parse('2026-10-24T00:00:00Z');
const SECRET = 'synthetic-admission-secret-over-thirty-two-bytes';
const MEMBER = { kind: 'member', verifiedAuthUserId: 'synthetic-member' } as const;
const GUEST = { kind: 'guest', verifiedGuestTokenHash: 'synthetic-guest' } as const;
const policy = { policyVersion: 'synthetic-v1', policyHash: 'a'.repeat(64), windowSeconds: 60, requestLimit: 3, blockedCountSaturation: 4, retryAfterMaximumSeconds: 60, cleanupRetentionSeconds: 60 };
const gate = (overrides: Partial<SajuAbuseAdmissionGateV1> = {}): SajuAbuseAdmissionGateV1 => ({
  secret: SECRET,
  admissionPort: { admit: vi.fn(async () => ({ policy, allowed: false, requestCount: 4, resetAt: new Date(NOW + 30_500).toISOString(), evaluatedAt: new Date(NOW).toISOString() })) },
  ...overrides,
});
const routes = ['api.me.saju.calculation', 'api.me.saju.preview-reading'] as const;
const request = (route: typeof routes[number]) => new Request(`https://example.test/${route.replace(/^api\.me\.saju\./u, 'api/me/saju/')}`, {
  method: 'POST', ...(route.endsWith('preview-reading') ? { body: JSON.stringify({ readingText: '전체 사주' }) } : {}),
});

describe('Saju admission on actual HTTP consumers', () => {
  it.each(routes)('denies %s before Subject DB and upstream work, with existing RATE_LIMITED logging', async (routeId) => {
    const req = request(routeId);
    const connect = vi.fn(async () => { throw new Error('must not reach DB'); });
    const calculate = vi.fn();
    const requestReading = vi.fn();
    const currentGate = gate();
    const events: SecurityEventV1[] = [];
    const response = await executeSecurityObservedRequestV1({
      request: req, routeId, requestIdFactory: () => 'admission-test', now: () => NOW, eventWriter: (event) => events.push(event),
      execute: async () => {
        const common = { request: req, requestId: 'admission-test', serverTime: new Date(NOW).toISOString(), identityEvidenceVerifier: { verifyRequestIdentity: () => MEMBER }, pool: { connect }, sajuAbuseAdmission: currentGate };
        return routeId.endsWith('calculation')
          ? handleCurrentSubjectSajuCalculationRequestV1({ ...common, sajuAdapter: { calculate } })
          : handleCurrentSubjectSajuPreviewReadingRequestV1({ ...common, sajuAdapter: { requestReading } });
      },
    });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('31');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(connect).not.toHaveBeenCalled();
    expect(calculate).not.toHaveBeenCalled();
    expect(requestReading).not.toHaveBeenCalled();
    expect(events).toMatchObject([{ eventCode: 'RATE_LIMITED', status: 429, routeId }]);
    expect(JSON.stringify(events)).not.toContain('synthetic-member');
  });

  it.each([MEMBER, GUEST])('uses the canonical pseudonymous key for $kind without raw identity as the bucket', async (evidence) => {
    const currentGate = gate();
    await admitSajuAbuseHttpRequestV1({ request: request(routes[0]), requestId: 'req-1', routeId: routes[0], evidence, gate: currentGate });
    expect(currentGate.admissionPort.admit).toHaveBeenCalledWith({ routeId: routes[0], evidence, clientKey: fingerprintSajuAbuseClientV1({ evidence, secret: SECRET }) });
  });

  it('fails closed on unavailable storage, never retries admission and hides failure detail', async () => {
    const admit = vi.fn(async () => { throw new Error('private-db-url-and-token'); });
    const response = await admitSajuAbuseHttpRequestV1({ request: request(routes[0]), requestId: 'req-1', routeId: routes[0], evidence: MEMBER, gate: gate({ admissionPort: { admit } }) });
    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({ error: { code: 'SAJU_ADMISSION_UNAVAILABLE' } });
    expect(admit).toHaveBeenCalledTimes(1);
  });

  it.each([
    { allowed: true, requestCount: 4, resetAt: new Date(NOW + 1000).toISOString(), evaluatedAt: new Date(NOW).toISOString() },
    { allowed: false, requestCount: 4, resetAt: 'invalid' },
    { allowed: false, requestCount: 4, resetAt: new Date(NOW - 1000).toISOString() },
    { allowed: false, requestCount: 4, resetAt: new Date(NOW + 61_000).toISOString() },
  ])('rejects inconsistent store authority', async (result) => {
    const response = await admitSajuAbuseHttpRequestV1({ request: request(routes[0]), requestId: 'req-1', routeId: routes[0], evidence: MEMBER, gate: gate({ admissionPort: { admit: async () => ({ ...result, policy, evaluatedAt: new Date(NOW).toISOString() }) } }) });
    expect(response?.status).toBe(503);
  });

  it('rejects malformed numeric policy returned by the authoritative store', async () => {
    const currentGate = gate({ admissionPort: { admit: vi.fn(async () => ({ allowed: true, requestCount: 1, resetAt: new Date(NOW + 1000).toISOString(), evaluatedAt: new Date(NOW).toISOString(), policy: { ...policy, windowSeconds: NaN } })) } });
    const response = await admitSajuAbuseHttpRequestV1({ request: request(routes[0]), requestId: 'req-1', routeId: routes[0], evidence: MEMBER, gate: currentGate });
    expect(response?.status).toBe(503);
    expect(currentGate.admissionPort.admit).toHaveBeenCalledTimes(1);
  });

  it('returns success from admission only for consistent allowed authority', async () => {
    const response = await admitSajuAbuseHttpRequestV1({ request: request(routes[0]), requestId: 'req-1', routeId: routes[0], evidence: MEMBER, gate: gate({ admissionPort: { admit: async () => ({ policy, allowed: true, requestCount: 1, resetAt: new Date(NOW + 1000).toISOString(), evaluatedAt: new Date(NOW).toISOString() }) } }) });
    expect(response).toBeNull();
  });

  it('preserves 401 when the store rejects an inactive Guest session before allocating a bucket', async () => {
    const response = await admitSajuAbuseHttpRequestV1({ request: request(routes[1]), requestId: 'req-guest', routeId: routes[1], evidence: GUEST, gate: gate({ admissionPort: { admit: async () => null } }) });
    expect(response?.status).toBe(401);
    expect(await response?.json()).toMatchObject({ error: { code: 'AUTH_REQUIRED', messageKey: 'auth.required' } });
  });

  it.each(routes)('does not call admission before successful authentication on %s', async (routeId) => {
    const currentGate = gate();
    const common = { request: request(routeId), requestId: 'req-1', serverTime: new Date(NOW).toISOString(), identityEvidenceVerifier: { verifyRequestIdentity: (): VerifiedSubjectIdentityEvidenceV1 | null => null }, pool: { connect: vi.fn() }, sajuAbuseAdmission: currentGate };
    const response = routeId.endsWith('calculation')
      ? await handleCurrentSubjectSajuCalculationRequestV1({ ...common, sajuAdapter: { calculate: vi.fn() } })
      : await handleCurrentSubjectSajuPreviewReadingRequestV1({ ...common, sajuAdapter: { requestReading: vi.fn() } });
    expect(response.status).toBe(401);
    expect(currentGate.admissionPort.admit).not.toHaveBeenCalled();
  });

});
