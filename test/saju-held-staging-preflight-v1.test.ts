import { describe, expect, it, vi } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  assessSajuHeldStagingPreflightV1,
  SAJU_HELD_STAGING_EXTERNAL_GATES_V1,
  type SajuHeldSourceIssuerWireDescriptorV1,
} from '../apps/api/src/saju-held-staging-preflight-v1.js';

function fixture() {
  const subjectConnect = vi.fn(async () => { throw Error('Subject DB must not connect'); });
  const nonceConnect = vi.fn(async () => { throw Error('Nonce DB must not connect'); });
  const fetchImpl = vi.fn(async () => { throw Error('Saju issuer must not be contacted'); });
  const subjectPool: PostgresSubjectPoolV1 = { connect: subjectConnect };
  const noncePool: PostgresSubjectPoolV1 = { connect: nonceConnect };
  const serviceBearer = 'staging-synthetic-bearer-not-an-active-secret';
  const keyBytes = Buffer.alloc(32, 73);
  const client = {
    subjectPool,
    proofTrust: {
      noncePool,
      serviceOrigin: 'https://preview-saju.example',
      serviceBearer,
      trustedIssuer: 'saju-preview-service',
      expectedAudience: 'myeongha-api-service',
      trustedKeyId: 'preview-key-v1',
      keyBytes,
      fetchImpl,
    },
  };
  const sourceDescriptor: SajuHeldSourceIssuerWireDescriptorV1 = {
    httpPath: '/api/internal/preview/source-readings',
    envelopeVersion: 'myeonghwa-source-reading-proof-http-v1',
    proofVersion: 'myeonghwa-source-reading-transport-proof-v1',
    issuer: 'saju-preview-service',
    audience: 'myeongha-api-service',
    keyId: 'preview-key-v1',
    ttlMs: 60_000,
  };
  return {
    client, sourceDescriptor, subjectPool, noncePool, subjectConnect, nonceConnect,
    fetchImpl, serviceBearer, keyBytes,
  };
}

describe('2B-3C-8C-2A protected staging preflight without activation', () => {
  it('validates server-owned wire contracts without I/O, secrets, or staging grant', () => {
    const f = fixture();
    const result = assessSajuHeldStagingPreflightV1({
      client: f.client, sourceDescriptor: f.sourceDescriptor,
    });
    expect(result).toEqual({
      version: 'myeongha-held-saju-staging-preflight-v1',
      configuration: 'VALID',
      checks: {
        server_only_trust_contract: 'PASS',
        dedicated_secret_separation: 'PASS',
        source_issuer_wire_descriptor: 'PASS',
      },
      externalGates: SAJU_HELD_STAGING_EXTERNAL_GATES_V1,
      stagingConnection: 'NOT_VERIFIED',
      stagingAdmission: 'HOLD',
      sourceAuthority: 'NOT_EVALUATED',
      releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false,
      canPublish: false,
      canSell: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.checks)).toBe(true);
    expect(f.subjectConnect).not.toHaveBeenCalled();
    expect(f.nonceConnect).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(f.serviceBearer);
    expect(JSON.stringify(result)).not.toContain(f.client.proofTrust.serviceOrigin);
    expect(JSON.stringify(result)).not.toContain(f.sourceDescriptor.issuer);
    expect(JSON.stringify(result)).not.toContain(f.keyBytes.toString('hex'));
  });

  it('keeps external staging proof explicitly unverified even with all synthetic contracts matched', () => {
    const f = fixture();
    const result = assessSajuHeldStagingPreflightV1({
      client: f.client, sourceDescriptor: f.sourceDescriptor,
    });
    expect(result.configuration).toBe('VALID');
    expect(result.stagingConnection).toBe('NOT_VERIFIED');
    expect(result.stagingAdmission).toBe('HOLD');
    expect(result.externalGates).toContain('nonce_database_runtime_login_role_membership_verified');
    expect(result.externalGates).toContain('real_http_replay_rotation_and_failover_evidence_recorded');
  });

  it.each([
    ['missing source contract', () => undefined],
    ['changed route', (s: SajuHeldSourceIssuerWireDescriptorV1) => ({ ...s, httpPath: '/api/readings' })],
    ['changed proof schema', (s: SajuHeldSourceIssuerWireDescriptorV1) =>
      ({ ...s, proofVersion: 'myeonghwa-source-reading-transport-proof-v2' })],
    ['mismatched audience', (s: SajuHeldSourceIssuerWireDescriptorV1) =>
      ({ ...s, audience: 'another-consumer' })],
    ['mismatched issuer', (s: SajuHeldSourceIssuerWireDescriptorV1) =>
      ({ ...s, issuer: 'unexpected-issuer' })],
    ['mismatched key ID', (s: SajuHeldSourceIssuerWireDescriptorV1) =>
      ({ ...s, keyId: 'wrong-key-id' })],
    ['zero TTL', (s: SajuHeldSourceIssuerWireDescriptorV1) => ({ ...s, ttlMs: 0 })],
    ['overlong TTL', (s: SajuHeldSourceIssuerWireDescriptorV1) => ({ ...s, ttlMs: 120_001 })],
    ['unreviewed extra field', (s: SajuHeldSourceIssuerWireDescriptorV1) =>
      ({ ...s, canSell: true })],
  ] as const)('rejects %s with HOLD', (_label, alter) => {
    const f = fixture();
    const sourceDescriptor = alter(f.sourceDescriptor);
    const result = assessSajuHeldStagingPreflightV1({ client: f.client, sourceDescriptor });
    expect(result.configuration).toBe('BLOCKED');
    expect(result.checks.source_issuer_wire_descriptor).toBe('BLOCKED');
    expect(result.stagingAdmission).toBe('HOLD');
    expect(result.canExecute).toBe(false);
    expect(result.canSell).toBe(false);
    expect(f.subjectConnect).not.toHaveBeenCalled();
    expect(f.nonceConnect).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects unsafe trust, identity-shared pools and reused Bearer/HMAC key', () => {
    const f = fixture();
    const badCases = [
      { client: { ...f.client, subjectPool: f.noncePool }, expected: 'server_only_trust_contract' },
      { client: { ...f.client, proofTrust: {
        ...f.client.proofTrust, serviceOrigin: 'http://preview-saju.example',
      } }, expected: 'server_only_trust_contract' },
      { client: { ...f.client, proofTrust: {
        ...f.client.proofTrust, keyBytes: Buffer.alloc(8),
      } }, expected: 'server_only_trust_contract' },
      { client: { ...f.client, proofTrust: {
        ...f.client.proofTrust,
        serviceBearer: 'z'.repeat(32), keyBytes: Buffer.from('z'.repeat(32)),
      } }, expected: 'dedicated_secret_separation' },
    ] as const;
    for (const item of badCases) {
      const report = assessSajuHeldStagingPreflightV1({
        client: item.client, sourceDescriptor: f.sourceDescriptor,
      });
      expect(report.configuration).toBe('BLOCKED');
      expect(report.checks[item.expected]).toBe('BLOCKED');
      expect(report.stagingConnection).toBe('NOT_VERIFIED');
      expect(report.stagingAdmission).toBe('HOLD');
    }
    expect(f.subjectConnect).not.toHaveBeenCalled();
    expect(f.nonceConnect).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
});
