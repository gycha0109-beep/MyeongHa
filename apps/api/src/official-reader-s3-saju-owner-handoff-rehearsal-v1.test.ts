import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { hashProtectedSajuTextV1 } from '../../../packages/domain/src/index.js';
import type { OfficialReadingReaderAdmissionScopeV1 } from './official-reading-reader-admission-v1.js';
import type { CharacterStandardReadingProtectedSajuContextV1 } from './character-standard-reading-protected-context.js';
import {
  OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1,
} from './official-reader-s3-source-coverage-preflight-v1.js';
import {
  OFFICIAL_READER_S3_OWNER_HANDOFF_REHEARSAL_VERSION_V1 as V,
  rehearseOfficialReaderS3SajuOwnerHandoffV1,
  type OfficialReaderS3OwnerHandoffTrustV1,
} from './official-reader-s3-saju-owner-handoff-rehearsal-v1.js';

const DOMAIN = 'myeongha/official-reader/s3-owner-handoff-rehearsal/v1\0';
const KEY = Buffer.alloc(32, 83);
const NOW = 1_800_000_000_000;
const NONCE = 'N'.repeat(24);
const TEXT = '보호된 사주 원문: 일반 채팅 저장 금지';
const WARNING = '불확실한 계산 경고';
const READING = '11111111-1111-4111-8111-111111111111';
const scope = {
  subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  readingId: READING,
  readerCharacterId: 'seyeon',
  readerContentBundleId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  contentReleaseId: 'synthetic-release',
  sajuDomain: 'general',
  officialArtifactResponseHash: 'sha256:test-official-reading-artifact',
} as OfficialReadingReaderAdmissionScopeV1;
const source: CharacterStandardReadingProtectedSajuContextV1 = {
  readingRef: READING, domain: 'general', coverageState: 'complete',
  protectedSegments: [{
    segmentId: 'segment-1', sourceReadingRef: READING,
    sourceRef: 'response.reading.sections.0.blocks.0',
    contentHash: hashProtectedSajuTextV1(TEXT), text: TEXT,
  }],
  disclosures: [{
    segmentId: 'warning-1', sourceReadingRef: READING,
    sourceRef: 'response.reading.disclosures.0',
    contentHash: hashProtectedSajuTextV1(WARNING), text: WARNING,
  }],
  ambiguity: [],
};

function canonicalize(value: unknown): unknown {
  if (value === undefined) return { $undefined: true };
  if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) };
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(object).sort().map(k => [k, canonicalize(object[k])]));
}
function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}
function candidate() {
  return {
    schemaVersion: OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1,
    officialReadingId: READING,
    officialArtifactResponseHash: scope.officialArtifactResponseHash,
    selectedUnits: [{ sourceRef: source.protectedSegments[0]!.sourceRef, contentHash: source.protectedSegments[0]!.contentHash }],
    coPresentUnits: [], disclosureUnits: [{
      sourceRef: source.disclosures[0]!.sourceRef,
      contentHash: source.disclosures[0]!.contentHash,
    }],
    ambiguityHashes: [],
    semanticValidation: { state: 'passed', revision: 'synthetic', evidenceDigest: 'b'.repeat(64) },
    outputValidation: { state: 'passed', revision: 'synthetic', evidenceDigest: 'c'.repeat(64) },
  };
}
function signedEnvelope(proposal: unknown = candidate()) {
  const payload = {
    schemaVersion: V,
    lifecycle: 'synthetic_rehearsal_only',
    issuer: 'synthetic-saju-owner', audience: 'myeongha-s3-internal',
    keyId: 'rehearsal-owner-key',
    nonce: NONCE, issuedAtMs: NOW, expiresAtMs: NOW + 60_000,
    subjectId: scope.subjectId, readingId: scope.readingId,
    readerCharacterId: scope.readerCharacterId,
    readerContentBundleId: scope.readerContentBundleId,
    contentReleaseId: scope.contentReleaseId,
    officialArtifactResponseHash: scope.officialArtifactResponseHash,
    candidateDigest: hash(proposal),
  };
  return {
    schemaVersion: V, candidate: proposal,
    proof: {
      payload,
      signatureHex: createHmac('sha256', KEY).update(DOMAIN).update(hash(payload)).digest('hex'),
    },
  };
}
function trust(): OfficialReaderS3OwnerHandoffTrustV1 {
  const consumed = new Set<string>();
  return {
    trustedIssuer: 'synthetic-saju-owner',
    expectedAudience: 'myeongha-s3-internal',
    trustedKeyId: 'rehearsal-owner-key',
    keyBytes: KEY,
    claimNonceOnce: vi.fn(async (key: string) => {
      if (consumed.has(key)) return false;
      consumed.add(key);
      return true;
    }),
  };
}
function run(
  envelope: unknown,
  overrides: Partial<Parameters<typeof rehearseOfficialReaderS3SajuOwnerHandoffV1>[0]> = {},
) {
  return rehearseOfficialReaderS3SajuOwnerHandoffV1({
    scope, protectedSource: source, envelope,
    expectedNonce: NONCE, nowMs: NOW + 1_000, trust: trust(),
    ...overrides,
  });
}

describe('S3 Saju Owner signed handoff rehearsal: never a release issuer', () => {
  it('verifies a separate signed candidate, claims nonce, but never returns paid content or authorization', async () => {
    const t = trust();
    const proof = signedEnvelope();
    const first = await run(proof, { trust: t });
    expect(first).toEqual({
      version: V, state: 'held', reason: 'signed_candidate_rehearsal_only',
      sourceAuthority: 'NOT_EVALUATED', semanticAuthority: 'NOT_EVALUATED',
      outputAuthority: 'NOT_EVALUATED', privacyApproval: 'NOT_EVALUATED',
      canPublish: false, canSell: false, publicDisclosureAuthorized: false,
    });
    expect(t.claimNonceOnce).toHaveBeenCalledOnce();
    const serialized = JSON.stringify(first);
    for (const secret of [TEXT, WARNING, READING, scope.subjectId, proof.proof.signatureHex]) {
      expect(serialized).not.toContain(secret);
    }
    expect(await run(proof, { trust: t }))
      .toMatchObject({ state: 'blocked', publicDisclosureAuthorized: false });
  });

  it.each([
    ['Preview transport proof cannot become Owner S3 proof', () => ({
      schemaVersion: 'myeonghwa-source-reading-proof-http-v1',
      lifecycle: 'preview', state: 'held', canSell: false,
    })],
    ['wrong issuer even when signed', () => {
      const x = signedEnvelope(); x.proof.payload.issuer = 'preview-service'; return x;
    }],
    ['wrong Reading even when signed', () => {
      const x = signedEnvelope(); x.proof.payload.readingId = 'other-reading'; return x;
    }],
    ['wrong Subject even when signed', () => {
      const x = signedEnvelope(); x.proof.payload.subjectId = 'other-subject'; return x;
    }],
    ['wrong bundle even when signed', () => {
      const x = signedEnvelope(); x.proof.payload.readerContentBundleId = 'other-bundle'; return x;
    }],
    ['wrong Release even when signed', () => {
      const x = signedEnvelope(); x.proof.payload.contentReleaseId = 'other-release'; return x;
    }],
    ['wrong artifact hash', () => {
      const x = signedEnvelope(); x.proof.payload.officialArtifactResponseHash = 'spoofed'; return x;
    }],
    ['partial source coverage', () => signedEnvelope({ ...candidate(), disclosureUnits: [] })],
    ['tampered manifest after signing', () => {
      const x = signedEnvelope();
      // Keep source coverage structurally valid; alter a signed verdict digest
      // after signing to isolate the candidate fingerprint mismatch.
      x.candidate = {
        ...candidate(),
        outputValidation: { ...candidate().outputValidation, evidenceDigest: 'e'.repeat(64) },
      };
      return x;
    }],
    ['tampered HMAC', () => {
      const x = signedEnvelope(); x.proof.signatureHex = '0'.repeat(64); return x;
    }],
    ['lifecycle production privilege escalation', () => {
      const x = signedEnvelope(); x.proof.payload.lifecycle = 'production'; return x;
    }],
    ['schema extension claiming production authority', () => ({
      ...signedEnvelope(), canPublish: true,
    })],
  ])('rejects %s without a public result', async (_label, build) => {
    const result = await run(build());
    expect(result).toMatchObject({ state: 'blocked', canPublish: false, canSell: false });
    expect(JSON.stringify(result)).not.toContain(TEXT);
  });

  it('fails closed for expiration and unavailable shared replay storage', async () => {
    expect(await run(signedEnvelope(), { nowMs: NOW + 61_000 }))
      .toMatchObject({ state: 'blocked' });
    const denied = trust();
    expect(await run(signedEnvelope(), { trust: {
      ...denied, claimNonceOnce: async () => false,
    } })).toMatchObject({ state: 'blocked' });
    expect(await run(signedEnvelope(), { trust: {
      ...denied, claimNonceOnce: async () => { throw Error('shared store unavailable'); },
    } })).toMatchObject({ state: 'blocked' });
  });

  it('rejects an altered key and fails before consuming the nonce', async () => {
    const t = trust();
    const altered = { ...t, keyBytes: Buffer.alloc(32, 14) };
    expect(await run(signedEnvelope(), { trust: altered }))
      .toMatchObject({ state: 'blocked' });
    expect(t.claimNonceOnce).not.toHaveBeenCalled();
  });
});
