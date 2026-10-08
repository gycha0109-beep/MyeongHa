import { describe, expect, it, vi } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  assessSajuHeldStagingPreflightV1,
  SAJU_HELD_STAGING_EXTERNAL_GATES_V1,
  type SajuHeldSourceIssuerWireDescriptorV1,
} from '../apps/api/src/saju-held-staging-preflight-v1.js';

function fixture() {
  const subjectConnect = vi.fn(async () => { throw Error('No Subject I/O'); });
  const nonceConnect = vi.fn(async () => { throw Error('No nonce I/O'); });
  const fetchImpl = vi.fn(async () => { throw Error('No HTTP I/O'); });
  const subjectPool: PostgresSubjectPoolV1 = { connect: subjectConnect };
  const noncePool: PostgresSubjectPoolV1 = { connect: nonceConnect };
  const serviceBearer = 'synthetic-only-bearer-not-deployed';
  const keyBytes = Buffer.alloc(32, 73);
  const client = {
    subjectPool,
    proofTrust: {
      noncePool, serviceOrigin: 'https://preview-saju.example',
      serviceBearer, trustedIssuer: 'saju-preview-service',
      expectedAudience: 'myeongha-api-service', trustedKeyId: 'preview-key-v1',
      keyBytes, fetchImpl,
    },
  };
  const sourceDescriptor: SajuHeldSourceIssuerWireDescriptorV1 = {
    httpPath: '/api/internal/preview/source-readings',
    envelopeVersion: 'myeonghwa-source-reading-proof-http-v1',
    proofVersion: 'myeonghwa-source-reading-transport-proof-v1',
    issuer: 'saju-preview-service', audience: 'myeongha-api-service',
    keyId: 'preview-key-v1', ttlMs: 60_000,
  };
  return { client, sourceDescriptor, noncePool, subjectConnect,
    nonceConnect, fetchImpl, serviceBearer, keyBytes };
}

describe('2B-3C-8C-2A staging preflight, no grant', () => {
  it('checks non-secret wire contract with zero I/O and never activates staging', () => {
    const f = fixture();
    const report = assessSajuHeldStagingPreflightV1({
      client: f.client, sourceDescriptor: f.sourceDescriptor,
    });
    expect(report.configuration).toBe('VALID');
    expect(report.checks).toEqual({
      server_only_trust_contract: 'PASS',
      dedicated_secret_separation: 'PASS',
      source_issuer_wire_descriptor: 'PASS',
    });
    expect(report.externalGates).toEqual(SAJU_HELD_STAGING_EXTERNAL_GATES_V1);
    expect(report.externalGates).toContain('nonce_database_runtime_login_role_membership_verified');
    expect(report.stagingConnection).toBe('NOT_VERIFIED');
    expect(report.stagingAdmission).toBe('HOLD');
    expect(report.sourceAuthority).toBe('NOT_EVALUATED');
    expect(report.releaseAuthorization).toBe('NOT_EVALUATED');
    expect(report.canExecute).toBe(false);
    expect(report.canPublish).toBe(false);
    expect(report.canSell).toBe(false);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.checks)).toBe(true);
    expect(f.subjectConnect).not.toHaveBeenCalled();
    expect(f.nonceConnect).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
    const output = JSON.stringify(report);
    expect(output).not.toContain(f.serviceBearer);
    expect(output).not.toContain(f.client.proofTrust.serviceOrigin);
    expect(output).not.toContain(f.sourceDescriptor.issuer);
    expect(output).not.toContain(f.keyBytes.toString('hex'));
  });

  it('treats a missing issuer descriptor as blocked', () => {
    const f = fixture();
    const report = assessSajuHeldStagingPreflightV1({ client: f.client });
    expect(report.configuration).toBe('BLOCKED');
    expect(report.checks.source_issuer_wire_descriptor).toBe('BLOCKED');
    expect(report.stagingAdmission).toBe('HOLD');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['path', { httpPath: '/api/readings' }],
    ['proof version', { proofVersion: 'myeonghwa-source-reading-transport-proof-v2' }],
    ['envelope version', { envelopeVersion: 'untrusted-envelope-v2' }],
    ['issuer', { issuer: 'untrusted-service' }],
    ['audience', { audience: 'other-service' }],
    ['key ID', { keyId: 'unknown-key-v1' }],
    ['TTL zero', { ttlMs: 0 }],
    ['TTL overlong', { ttlMs: 120_001 }],
    ['unreviewed field', { canSell: true }],
  ] as const)('blocks source contract drift: %s', (_name, changed) => {
    const f = fixture();
    const report = assessSajuHeldStagingPreflightV1({
      client: f.client,
      sourceDescriptor: { ...f.sourceDescriptor, ...changed },
    });
    expect(report.configuration).toBe('BLOCKED');
    expect(report.checks.source_issuer_wire_descriptor).toBe('BLOCKED');
    expect(report.stagingAdmission).toBe('HOLD');
    expect(report.canSell).toBe(false);
    expect(f.subjectConnect).not.toHaveBeenCalled();
    expect(f.nonceConnect).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it('blocks invalid client trust and identical HMAC/Bearer material', () => {
    const f = fixture();
    const bad = [
      { client: { ...f.client, subjectPool: f.noncePool }, check: 'server_only_trust_contract' },
      { client: { ...f.client, proofTrust: { ...f.client.proofTrust,
        serviceOrigin: 'http://preview-saju.example' } }, check: 'server_only_trust_contract' },
      { client: { ...f.client, proofTrust: { ...f.client.proofTrust,
        keyBytes: Buffer.alloc(8) } }, check: 'server_only_trust_contract' },
      { client: { ...f.client, proofTrust: { ...f.client.proofTrust,
        serviceBearer: 'x'.repeat(32), keyBytes: Buffer.from('x'.repeat(32)) } },
        check: 'dedicated_secret_separation' },
    ] as const;
    for (const item of bad) {
      const report = assessSajuHeldStagingPreflightV1({
        client: item.client, sourceDescriptor: f.sourceDescriptor,
      });
      expect(report.configuration).toBe('BLOCKED');
      expect(report.checks[item.check]).toBe('BLOCKED');
      expect(report.stagingConnection).toBe('NOT_VERIFIED');
      expect(report.stagingAdmission).toBe('HOLD');
    }
    expect(f.subjectConnect).not.toHaveBeenCalled();
    expect(f.nonceConnect).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
});
