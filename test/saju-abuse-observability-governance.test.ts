import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Saju abuse baseline observability governance', () => {
  it('wires the mounted calculation runtime through the observe-only identity verifier', () => {
    const runtime = source(
      'apps/api/src/production-current-subject-saju-calculation-runtime.ts',
    );

    expect(runtime).toContain('createSajuAbuseObservedIdentityVerifierV1');
    expect(runtime).toContain("routeId: 'api.me.saju.calculation'");
    expect(runtime).toContain('secret: userDataConfig.guestFingerprintSecret');
    expect(runtime).toContain(
      'identityEvidenceVerifier: observedIdentityEvidenceVerifier',
    );
  });

  it('wires the publicly rewritten Preview Reading runtime through the observe-only identity verifier', () => {
    const runtime = source(
      'apps/api/src/production-current-subject-saju-preview-reading-runtime.ts',
    );
    const vercel = source('vercel.json');
    const dispatcher = source('api/me.ts');

    expect(vercel).toContain('"source": "/api/me/saju/preview-reading"');
    expect(vercel).toContain(
      '"destination": "/api/me?__myeongha_saju_preview_reading=1"',
    );
    expect(dispatcher).toContain(
      "const SAJU_PREVIEW_READING_ROUTE = '/api/me/saju/preview-reading'",
    );
    expect(dispatcher).toContain(
      "return { kind: 'saju-preview-reading', route: SAJU_PREVIEW_READING_ROUTE };",
    );
    expect(runtime).toContain('createSajuAbuseObservedIdentityVerifierV1');
    expect(runtime).toContain("routeId: 'api.me.saju.preview-reading'");
    expect(runtime).toContain('secret: userDataConfig.guestFingerprintSecret');
    expect(runtime).toContain(
      'identityEvidenceVerifier: observedIdentityEvidenceVerifier',
    );
  });

  it('keeps the event schema privacy-scoped and observe-only', () => {
    const observation = source('apps/api/src/saju-abuse-observability.ts');

    for (const required of [
      'myeongha-saju-abuse-observation-v1',
      'myeongha-saju-abuse-client-hmac-sha256-v1',
      "mode: 'observe_only'",
      'subjectKind',
      'clientKey',
      'requestId',
      'occurredAt',
      'writeBestEffort',
    ]) {
      expect(observation).toContain(required);
    }

    for (const forbidden of [
      'authorization',
      'cookie',
      'birthDate',
      'request.body',
      'request.url',
      'databaseUrl',
      'error.message',
      'error.stack',
    ]) {
      expect(observation.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
