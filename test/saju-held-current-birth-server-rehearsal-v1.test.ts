import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSajuHeldCurrentBirthServerRehearsalV1,
} from '../apps/api/src/saju-held-current-birth-server-rehearsal-v1.js';
import {
  bindCurrentSubjectSajuHeldProofV1,
  type SajuHeldRevisionBindingResultV1,
} from '../apps/api/src/saju-held-source-proof-revision-binding-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

vi.mock('../apps/api/src/saju-held-source-proof-revision-binding-v1.js', () => ({
  bindCurrentSubjectSajuHeldProofV1: vi.fn(),
}));

const bind = vi.mocked(bindCurrentSubjectSajuHeldProofV1);
const evidence = {
  kind: 'member' as const,
  verifiedAuthUserId: '22222222-2222-4222-8222-222222222222',
};
const held: SajuHeldRevisionBindingResultV1 = {
  version: 'myeongha-held-source-proof-revision-binding-v1',
  state: 'held',
  reason: 'source_transport_integrity_verified_only',
  sourceAuthority: 'NOT_EVALUATED',
  releaseAuthorization: 'NOT_EVALUATED',
  canExecute: false,
  canPublish: false,
  canSell: false,
  binding: {
    subjectId: '11111111-1111-4111-8111-111111111111',
    birthProfileId: '33333333-3333-4333-8333-333333333333',
    birthRevisionId: '44444444-4444-4444-8444-444444444444',
    birthRevisionNo: 7,
    readingId: 'synthetic-reading-natal',
    responseId: 'synthetic-response-natal',
    requestBodyHash: 'a'.repeat(64),
    responseBodyHash: 'b'.repeat(64),
  },
};
const blocked: SajuHeldRevisionBindingResultV1 = {
  version: 'myeongha-held-source-proof-revision-binding-v1',
  state: 'blocked',
  reason: 'source_proof_invalid',
  sourceAuthority: 'NOT_EVALUATED',
  releaseAuthorization: 'NOT_EVALUATED',
  canExecute: false,
  canPublish: false,
  canSell: false,
};

function fixture() {
  const subjectConnect = vi.fn(async () => { throw new Error('subject connection must not open'); });
  const nonceConnect = vi.fn(async () => { throw new Error('nonce connection must not open'); });
  const fetchImpl = vi.fn(async () => { throw new Error('HTTP must not execute'); });
  const subjectPool: PostgresSubjectPoolV1 = { connect: subjectConnect };
  const noncePool: PostgresSubjectPoolV1 = { connect: nonceConnect };
  return {
    subjectConnect, nonceConnect, fetchImpl, subjectPool, noncePool,
    options: {
      subjectPool,
      proofTrust: {
        serviceOrigin: 'https://saju-proof.example',
        serviceBearer: 'synthetic-service-bearer',
        trustedIssuer: 'saju-preview-service',
        expectedAudience: 'myeongha-api-service',
        trustedKeyId: 'preview-key-v1',
        keyBytes: Buffer.alloc(32, 73),
        noncePool,
        fetchImpl,
      },
    },
  };
}

beforeEach(() => {
  bind.mockReset();
});

describe('2B-3C-8B current Birth server-only Preview proof rehearsal', () => {
  it('assembles a fixed General Natal caller without making I/O or exposing secrets', async () => {
    const f = fixture();
    bind.mockResolvedValue(held);
    const runtime = createSajuHeldCurrentBirthServerRehearsalV1(f.options);
    expect(f.subjectConnect).not.toHaveBeenCalled();
    expect(f.nonceConnect).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(Object.keys(runtime)).toEqual(['version', 'rehearse']);
    expect(JSON.stringify(runtime)).not.toContain('synthetic-service-bearer');

    const result = await runtime.rehearse(evidence);
    expect(result).toEqual(held);
    expect(bind).toHaveBeenCalledOnce();
    expect(bind).toHaveBeenCalledWith({
      verifiedEvidence: evidence,
      pool: f.subjectPool,
      issuePort: expect.objectContaining({ issuePreviewProof: expect.any(Function) }),
      verifierTrust: expect.objectContaining({
        trustedIssuer: 'saju-preview-service',
        expectedAudience: 'myeongha-api-service',
        trustedKeyId: 'preview-key-v1',
        keyBytes: expect.any(Uint8Array),
        claimNonceOnce: expect.any(Function),
      }),
    });
    const input = bind.mock.calls[0]?.[0];
    expect(input).not.toHaveProperty('readingText');
    expect(input).not.toHaveProperty('nonceFactory');
    expect(result).toMatchObject({
      state: 'held', sourceAuthority: 'NOT_EVALUATED',
      releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
    });
  });

  it('preserves the existing binder rejection without upgrading Source authority', async () => {
    const f = fixture();
    bind.mockResolvedValue(blocked);
    const runtime = createSajuHeldCurrentBirthServerRehearsalV1(f.options);
    expect(await runtime.rehearse(evidence)).toEqual(blocked);
    expect(bind).toHaveBeenCalledOnce();
  });

  it('rejects shared Subject/nonce pool and invalid trust configuration before I/O', () => {
    const f = fixture();
    expect(() => createSajuHeldCurrentBirthServerRehearsalV1({
      subjectPool: f.noncePool,
      proofTrust: f.options.proofTrust,
    })).toThrow(TypeError);
    expect(() => createSajuHeldCurrentBirthServerRehearsalV1({
      ...f.options, subjectPool: {} as PostgresSubjectPoolV1,
    })).toThrow(TypeError);
    expect(() => createSajuHeldCurrentBirthServerRehearsalV1({
      ...f.options,
      proofTrust: { ...f.options.proofTrust, keyBytes: Buffer.alloc(8) },
    })).toThrow(TypeError);
    expect(() => createSajuHeldCurrentBirthServerRehearsalV1({
      ...f.options,
      proofTrust: { ...f.options.proofTrust, serviceOrigin: 'http://saju-proof.example' },
    })).toThrow(TypeError);
    expect(bind).not.toHaveBeenCalled();
    expect(f.subjectConnect).not.toHaveBeenCalled();
    expect(f.nonceConnect).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
});
