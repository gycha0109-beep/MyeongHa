import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runOfficialReaderPrivateSourceBoundT1T2V1,
  OfficialReaderSourceBoundT1T2ErrorV1,
} from '../apps/api/src/official-reader-private-source-bound-t1-t2-v1.js';
import { commitPrivateOfficialReaderPaidAnswerV1 } from
  '../apps/api/src/official-reader-private-paid-answer-commit-v1.js';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const READING = '22222222-2222-4222-8222-222222222222';
const GRANT = '33333333-3333-4333-8333-333333333333';
const TURN = '44444444-4444-4444-8444-444444444444';
const ATTEMPT = '55555555-5555-4555-8555-555555555555';
const BODY = '66666666-6666-4666-8666-666666666666';
const MARKER = '77777777-7777-4777-8777-777777777777';
const DB_CLOCK = '2026-10-26T00:00:00.000Z';
const CANDIDATE = Object.freeze({ sourceUnits: ['trusted_preview_inventory'] });

vi.mock('../apps/api/src/postgres-subject-execution.js', () => ({
  executePostgresSubjectTransactionV1: vi.fn(async (input: {
    execute: (scope: unknown) => Promise<unknown>;
  }) => input.execute({
    resolvedSubject: { subjectId: SUBJECT, subjectKind: 'member' },
    client: {
      query: async () => ({ rows: [{ effectiveAt: DB_CLOCK }] }),
    },
  })),
}));
vi.mock('../apps/api/src/official-reader-private-exact-verified-purchase-guard-v1.js', () => ({
  createOfficialReaderPrivateCurrentPurchaseAuthorityPortV1: () => ({
    assertCurrentVerifiedPurchase: async () => undefined,
  }),
  assertOfficialReaderPrivateCurrentVerifiedPurchaseV1: async () => undefined,
}));
vi.mock('../apps/api/src/official-reader-private-s3-source-binding-v1.js', () => ({
  prepareOfficialReaderS3BoundPreviewSourceV1: async () => Object.freeze({
    version: 'official-reader-s3-bound-preview-source-v1',
    lifecycle: 'preview',
    canPersist: false,
    canDisclose: false,
  }),
}));
vi.mock('../apps/api/src/saju-held-source-proof-verifier-v1.js', () => ({
  hashSajuHeldSourceProofRequestV1: () => 'a'.repeat(64),
}));
vi.mock('../apps/api/src/official-reader-private-paid-answer-commit-v1.js', () => ({
  commitPrivateOfficialReaderPaidAnswerV1: vi.fn(async () => Object.freeze({
    contractVersion: 'official-reader-s5-protected-answer-commit-v1',
    bodyId: BODY,
    safeMessageId: MARKER,
    turnId: TURN,
    attemptId: ATTEMPT,
    committedAt: DB_CLOCK,
    replayed: false,
  })),
}));

function productionStaging() {
  return {
    turnId: TURN,
    attemptId: ATTEMPT,
    bodyId: BODY,
    safeMessageId: MARKER,
    originatingGrantId: GRANT,
    productionSource: {
      sourceAttestationRef: 'saju-production-owner-issued-ref',
      sourceResponseHash: 'sha256:v1:' + 'a'.repeat(64),
      semanticGuardVersion: 'owner-semantic-contract',
      outputGuardVersion: 'owner-output-contract',
    },
  };
}

function harness() {
  const prepareAdmission = vi.fn(async (_scope: unknown, effectiveAt: string) => ({
    scope: {
      subjectId: SUBJECT,
      readingId: READING,
      effectiveAt,
    },
    source: {
      responseSnapshotJsonb: { exactStoredSource: 'db-owned' },
    },
    ticket: Object.freeze({ scopeTicket: 't1-only' }),
  }));
  const prepareSignedSource = vi.fn(async () => ({
    candidate: CANDIDATE,
    signedPreviewEnvelope: Object.freeze({ preview: true }),
    trust: {} as never,
    context: {} as never,
  }));
  const generatePrivate = vi.fn(async () => ({ privateBody: 'PRIVATE_GENERATED_TEXT' }));
  const prepareProductionCommitStaging = vi.fn(async () => productionStaging());
  const base = {
    pool: {} as never,
    verifiedEvidence: { kind: 'member' as const, verifiedAuthUserId: SUBJECT },
    key: {} as never,
    prepareAdmission: prepareAdmission as never,
    prepareSignedSource: prepareSignedSource as never,
    generatePrivate,
  };
  return { base, generatePrivate, prepareProductionCommitStaging,
    prepareSignedSource, prepareAdmission };
}

beforeEach(() => vi.clearAllMocks());

describe('S3 Preview -> S5 server-only Production staging cannot be supplied by model text', () => {
  it('halts before paid generation if the independent Production issuer port is absent', async () => {
    const f = harness();
    await expect(runOfficialReaderPrivateSourceBoundT1T2V1(f.base))
      .rejects.toBeInstanceOf(OfficialReaderSourceBoundT1T2ErrorV1);
    expect(f.prepareAdmission).toHaveBeenCalledTimes(1);
    // A missing Production issuer must not consume a one-use Saju Preview
    // nonce or invoke the model, despite a valid current purchase.
    expect(f.prepareSignedSource).not.toHaveBeenCalled();
    expect(f.generatePrivate).not.toHaveBeenCalled();
    expect(commitPrivateOfficialReaderPaidAnswerV1).not.toHaveBeenCalled();
  });

  it('denies mismatched DB source hash before invoking the private generator', async () => {
    const f = harness();
    const fakeProof = {
      ...productionStaging(),
      productionSource: {
        ...productionStaging().productionSource,
        sourceResponseHash: 'sha256:v1:' + 'b'.repeat(64),
      },
    };
    await expect(runOfficialReaderPrivateSourceBoundT1T2V1({
      ...f.base,
      prepareProductionCommitStaging: async () => fakeProof,
    })).rejects.toBeInstanceOf(OfficialReaderSourceBoundT1T2ErrorV1);
    expect(f.generatePrivate).not.toHaveBeenCalled();
    expect(commitPrivateOfficialReaderPaidAnswerV1).not.toHaveBeenCalled();
  });

  it.each([
    { title: 'AI-provided Production proof', added: { productionSource: productionStaging().productionSource } },
    { title: 'AI-selected paid Grant', added: { originatingGrantId: GRANT } },
    { title: 'AI-selected message UUID', added: { safeMessageId: MARKER } },
    { title: 'AI-supplied ACK proof', added: { deliveredAt: DB_CLOCK } },
  ])('rejects $title rather than merging untrusted generation metadata', async ({ added }) => {
    const f = harness();
    const generatePrivate = vi.fn(async () => ({
      privateBody: 'PRIVATE_GENERATED_TEXT',
      ...added,
    }));
    await expect(runOfficialReaderPrivateSourceBoundT1T2V1({
      ...f.base, generatePrivate: generatePrivate as never,
      prepareProductionCommitStaging: f.prepareProductionCommitStaging,
    })).rejects.toBeInstanceOf(OfficialReaderSourceBoundT1T2ErrorV1);
    expect(commitPrivateOfficialReaderPaidAnswerV1).not.toHaveBeenCalled();
  });

  it('passes only independently sourced IDs/proof and plain generated text to held S5 Writer', async () => {
    const f = harness();
    const result = await runOfficialReaderPrivateSourceBoundT1T2V1({
      ...f.base,
      prepareProductionCommitStaging: f.prepareProductionCommitStaging,
    });
    expect(result).toMatchObject({ bodyId: BODY, replayed: false });
    expect(f.prepareProductionCommitStaging).toHaveBeenCalledTimes(1);
    expect(f.generatePrivate).toHaveBeenCalledTimes(1);
    expect(commitPrivateOfficialReaderPaidAnswerV1).toHaveBeenCalledTimes(1);
    const call = vi.mocked(commitPrivateOfficialReaderPaidAnswerV1).mock.calls[0]?.[0];
    expect(call?.staged).toMatchObject({
      turnId: TURN,
      attemptId: ATTEMPT,
      bodyId: BODY,
      safeMessageId: MARKER,
      originatingGrantId: GRANT,
      privateBody: 'PRIVATE_GENERATED_TEXT',
      productionSource: productionStaging().productionSource,
      sourceCoverageCandidate: CANDIDATE,
    });
    expect(Object.keys(call?.staged ?? {}).sort()).toEqual([
      'turnId','attemptId','bodyId','safeMessageId','originatingGrantId',
      'privateBody','productionSource','sourceCoverageCandidate',
      'originalAdmission','boundSignedPreviewSource',
    ].sort());
    expect(JSON.stringify(result)).not.toContain('PRIVATE_GENERATED_TEXT');
  });

  it('rejects synthetic staging with surplus browser-controlled fields before generation', async () => {
    const f = harness();
    await expect(runOfficialReaderPrivateSourceBoundT1T2V1({
      ...f.base,
      prepareProductionCommitStaging: async () => ({
        ...productionStaging(), paidReadReleaseEnabled: true,
      }),
    })).rejects.toBeInstanceOf(OfficialReaderSourceBoundT1T2ErrorV1);
    expect(f.generatePrivate).not.toHaveBeenCalled();
  });
});
