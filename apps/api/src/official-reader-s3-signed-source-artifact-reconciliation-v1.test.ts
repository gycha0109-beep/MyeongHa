import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { hashProtectedSajuTextV1 } from '../../../packages/domain/src/index.js';
import type { CharacterStandardReadingKnowledgeSourceV1 } from './character-standard-reading-knowledge.js';
import type { OfficialReadingReaderAdmissionScopeV1 } from './official-reading-reader-admission-v1.js';
import {
  OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1,
} from './official-reader-s3-source-coverage-preflight-v1.js';
import {
  hashSajuHeldSourceProofRequestV1,
  type SajuHeldSourceProofVerifierTrustV1,
} from './saju-held-source-proof-verifier-v1.js';
import {
  reconcileOfficialReaderS3SignedSourceArtifactV1,
} from './official-reader-s3-signed-source-artifact-reconciliation-v1.js';

const KEY = Buffer.alloc(32, 73);
const REQUEST = { birth: { calendarType: 'solar', date: '2001-07-14', time: null },
  reading: { text: '전체 사주' } };
const NONCE = 'P'.repeat(24);
const NOW = 1_800_000_000_000;
const READING = '11111111-1111-4111-8111-111111111111';
const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORIGINAL = '비공개 원국 해설 원문';
const WARNING = '공식 유료 해설 고지';
const DOMAIN = 'myeongha/saju/source-transport-proof/v1\0';
const RESPONSE_ID = 'reading_response_' + 'c'.repeat(24);

function response() {
  const pillar = (label: string) => ({ label, status: 'resolved', value: '테스트' });
  return {
    responseVersion: 'myeonghwa-product-reading-response-v2',
    responseId: RESPONSE_ID,
    state: 'delivered', messageCode: 'READING_DELIVERED', requiredAction: 'none',
    reading: {
      readingId: READING,
      brand: { brandId: 'myeonghwa', displayName: '명화' },
      subject: { birthInputDisplay: {
        calendarType: 'solar', date: '2001-07-14', timeKnown: false,
      }, calculationState: 'resolved' },
      calculationSummary: { pillars: {
        year: pillar('년'), month: pillar('월'), day: pillar('일'), hour: pillar('시'),
      } },
      sections: [{ sectionType: 'overview', title: '전체 사주', state: 'complete',
        blocks: [{ type: 'paragraph', text: ORIGINAL }] }],
      disclosures: [{ type: 'scope_limitation', text: WARNING }],
      generatedAt: '2026-10-08T00:00:00Z',
    },
  };
}
function source(overrides: Partial<CharacterStandardReadingKnowledgeSourceV1> = {})
: CharacterStandardReadingKnowledgeSourceV1 {
  return {
    subjectId: SUBJECT, readingId: READING,
    readingSessionId: '22222222-2222-4222-8222-222222222222',
    productId: '33333333-3333-4333-8333-333333333333',
    readerCharacterId: 'baekheon',
    readerContentBundleId: '55555555-5555-4555-8555-555555555555',
    topicKey: 'general', sajuDomain: 'general',
    readingPeriod: 'original', readingVariant: 'standard',
    sourceBirthRevisionId: '44444444-4444-4444-8444-444444444444',
    productSpecVersion: 'standard-reading-v1',
    domainCapabilityVersion: 'general-v1',
    readingContractVersion: 'myeonghwa-product-reading-response-v2',
    sajuEngineVersion: 'saju-v1',
    responseHash: 'sha256:v1:official-reading-db-fingerprint',
    productResponseState: 'delivered',
    responseSnapshotJsonb: response(),
    completedAt: '2026-10-18T23:59:00Z',
    ...overrides,
  };
}
const SCOPE = {
  subjectId: SUBJECT, threadId: '66666666-6666-4666-8666-666666666666',
  contentRevision: 9, readingId: READING, readerCharacterId: 'baekheon',
  readerContentBundleId: source().readerContentBundleId,
  contentReleaseId: 'release-9',
  effectiveAt: '2026-10-19T00:00:00Z',
  productId: source().productId, productSpecVersion: 'standard-reading-v1',
  sajuDomain: 'general', readingContractVersion: 'myeonghwa-product-reading-response-v2',
  officialArtifactResponseHash: source().responseHash,
  productRuleVersion: 'general-reader-rule-v1', approvedPolicyRevision: 'policy-9',
} as OfficialReadingReaderAdmissionScopeV1;

function candidate() {
  return {
    schemaVersion: OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1,
    officialReadingId: READING,
    officialArtifactResponseHash: SCOPE.officialArtifactResponseHash,
    selectedUnits: [{
      sourceRef: 'response.reading.sections.0.blocks.0',
      contentHash: hashProtectedSajuTextV1(ORIGINAL),
    }],
    coPresentUnits: [],
    disclosureUnits: [{
      sourceRef: 'response.reading.disclosures.0',
      contentHash: hashProtectedSajuTextV1(WARNING),
    }],
    ambiguityHashes: [],
    semanticValidation: {
      state: 'passed', revision: 'synthetic-semantic', evidenceDigest: 'a'.repeat(64),
    },
    outputValidation: {
      state: 'passed', revision: 'synthetic-output', evidenceDigest: 'b'.repeat(64),
    },
  };
}
function envelope(signedResponse = response()) {
  const hash = hashSajuHeldSourceProofRequestV1;
  const material = {
    snapshotId: 'synthetic-snapshot',
    interpretationRunId: 'synthetic-interpretation',
    registrySnapshotId: 'synthetic-registry',
    executionId: 'synthetic-execution', preparationId: 'synthetic-preparation',
    selectionId: 'synthetic-selection',
    profileRef: { id: 'synthetic-profile', version: 'v1', contentHash: 'a'.repeat(64) },
    evidenceBundleHash: 'b'.repeat(64),
    readingId: signedResponse.reading.readingId,
    responseId: signedResponse.responseId, responseBodyHash: hash(signedResponse),
  };
  const payload = {
    version: 'myeonghwa-source-reading-transport-proof-v1',
    lifecycle: 'preview',
    issuer: 'saju-preview-service', audience: 'myeongha-api-service',
    keyId: 'preview-key-v1', nonce: NONCE,
    issuedAtMs: NOW, expiresAtMs: NOW + 60_000,
    requestBodyHash: hash(REQUEST), responseBodyHash: hash(signedResponse), material,
    productionInterpretationAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false, canPublish: false, canSell: false,
  };
  return {
    schemaVersion: 'myeonghwa-source-reading-proof-http-v1',
    lifecycle: 'preview', state: 'held',
    response: signedResponse,
    proof: { payload, signatureHex: createHmac('sha256', KEY)
      .update(DOMAIN).update(hash(payload)).digest('hex') },
    productionInterpretationAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false, canPublish: false, canSell: false,
  };
}
function trust(): SajuHeldSourceProofVerifierTrustV1 {
  const used = new Set<string>();
  return {
    trustedIssuer: 'saju-preview-service', expectedAudience: 'myeongha-api-service',
    trustedKeyId: 'preview-key-v1', keyBytes: KEY,
    claimNonceOnce: vi.fn(async (key: string) => {
      if (used.has(key)) return false;
      used.add(key);
      return true;
    }),
  };
}
function run(overrides: Partial<Parameters<typeof reconcileOfficialReaderS3SignedSourceArtifactV1>[0]> = {}) {
  return reconcileOfficialReaderS3SignedSourceArtifactV1({
    scope: SCOPE, source: source(), candidate: candidate(),
    previewEnvelope: envelope(), trust: trust(),
    context: { expectedNonce: NONCE, expectedRequestBody: REQUEST, nowMs: NOW + 1_000 },
    ...overrides,
  });
}
describe('S3: authentic Saju Preview envelope reconciled with DB-pinned official v2 response', () => {
  it('compares exact independent signed and stored bytes while withholding all paid authority', async () => {
    const result = await run();
    expect(result).toEqual({
      version: 'official-reader-s3-signed-source-reconciliation-v1',
      state: 'held', reason: 'signed_preview_source_consistent_only',
      transportIntegrity: 'VERIFIED',
      sourceAuthority: 'NOT_EVALUATED', semanticAuthority: 'NOT_EVALUATED',
      outputAuthority: 'NOT_EVALUATED', privacyApproval: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
      publicDisclosureAuthorized: false,
    });
    for (const text of [ORIGINAL, WARNING, SUBJECT, READING, RESPONSE_ID]) {
      expect(JSON.stringify(result)).not.toContain(text);
    }
  });

  it('rejects genuinely Saju-signed but differently generated response with same Reading ID', async () => {
    const changed = response();
    changed.reading.sections[0]!.blocks[0]!.text = '실제로 다른 계산에서 나온 서명된 응답';
    const result = await run({ previewEnvelope: envelope(changed) });
    expect(result).toMatchObject({ state: 'blocked', transportIntegrity: 'NOT_VERIFIED' });
    expect(JSON.stringify(result)).not.toContain(changed.reading.sections[0]!.blocks[0]!.text);
  });

  it('rejects a modified DB artifact even if the candidate is aligned to the old official source', async () => {
    const changed = structuredClone(response());
    changed.reading.sections[0]!.blocks[0]!.text = 'DB 원본 변조';
    const result = await run({ source: source({ responseSnapshotJsonb: changed }) });
    expect(result.state).toBe('blocked');
  });

  it('rejects the wrong verified Subject/Reader and the wrong submitted required disclosure before nonce use', async () => {
    for (const diff of [
      { source: source({ subjectId: 'different' }) },
      { source: source({ readerCharacterId: 'different' }) },
      { candidate: { ...candidate(), disclosureUnits: [] } },
    ]) {
      const t = trust();
      expect(await run({ ...diff, trust: t })).toMatchObject({
        state: 'blocked', canPublish: false, sourceAuthority: 'NOT_EVALUATED',
      });
      expect(t.claimNonceOnce).not.toHaveBeenCalled();
    }
  });

  it('blocks wrong verified nonce, altered signature, replay and absent shared ledger', async () => {
    expect(await run({ context: {
      expectedNonce: 'X'.repeat(24), expectedRequestBody: REQUEST, nowMs: NOW + 1_000,
    } })).toMatchObject({ state: 'blocked' });
    const tampered = envelope();
    tampered.proof.signatureHex = '0'.repeat(64);
    expect(await run({ previewEnvelope: tampered })).toMatchObject({ state: 'blocked' });
    const shared = trust();
    expect((await run({ trust: shared })).state).toBe('held');
    expect((await run({ trust: shared })).state).toBe('blocked');
    expect(await run({ trust: { ...trust(), claimNonceOnce: async () => false } }))
      .toMatchObject({ state: 'blocked' });
  });
});
