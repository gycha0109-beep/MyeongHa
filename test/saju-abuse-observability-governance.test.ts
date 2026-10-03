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

  it('pre-wires the Preview Reading runtime before any public route activation', () => {
    const runtime = source(
      'apps/api/src/production-current-subject-saju-preview-reading-runtime.ts',
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
