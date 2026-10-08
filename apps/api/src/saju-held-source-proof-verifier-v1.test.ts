import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  verifySajuHeldSourceProofV1,
  type SajuHeldSourceProofVerifierTrustV1,
} from './saju-held-source-proof-verifier-v1.js';

const keyBytes = Buffer.alloc(32, 73);
const issuedAtMs = 1_800_000_000_000;
const nonce = 'Q'.repeat(24);
const expectedRequest = {
  birth: { calendarType: 'solar', date: '2001-07-14', time: null },
  reading: { text: '전체 사주' },
};
const DOMAIN = 'myeongha/saju/source-transport-proof/v1\0';

function canonicalize(value: unknown): unknown {
  if (value === undefined) return { $undefined: true };
  if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) };
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  const r = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(r).sort().map(k => [k, canonicalize(r[k])]));
}
function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}
function readingResponse() {
  const fact = (label: string) => ({ label, status: 'resolved', value: '테스트' });
  return {
    responseVersion: 'myeonghwa-product-reading-response-v2',
    responseId: 'reading_response_' + 'c'.repeat(24),
    state: 'delivered', messageCode: 'READING_DELIVERED', requiredAction: 'none',
    reading: {
      readingId: 'synthetic-reading-natal',
      brand: { brandId: 'myeonghwa', displayName: '명화' },
      subject: {
        displayLabel: '합성 사용자',
        birthInputDisplay: { calendarType: 'solar', date: '2001-07-14', timeKnown: false },
        calculationState: 'resolved',
      },
      calculationSummary: { pillars: {
        year: fact('년'), month: fact('월'), day: fact('일'), hour: fact('시'),
      } },
      sections: [{ sectionType: 'overview', title: '테스트용 원국', state: 'complete',
        blocks: [{ type: 'paragraph', text: '출시 근거가 아님' }] }],
      disclosures: [{ type: 'scope_limitation', text: '합성 자료' }],
      generatedAt: '2026-10-08T00:00:00Z',
    },
  };
}
function envelope() {
  const response = readingResponse();
  const material = {
    snapshotId: 'synthetic-snapshot', interpretationRunId: 'synthetic-run',
    registrySnapshotId: 'synthetic-registry', executionId: 'synthetic-execution',
    preparationId: 'synthetic-preparation', selectionId: 'synthetic-selection',
    profileRef: { id: 'synthetic-profile', version: 'version-1', contentHash: 'a'.repeat(64) },
    evidenceBundleHash: 'b'.repeat(64),
    readingId: response.reading.readingId,
    responseId: response.responseId,
    responseBodyHash: hash(response),
  };
  const payload = {
    version: 'myeonghwa-source-reading-transport-proof-v1',
    lifecycle: 'preview',
    issuer: 'saju-preview-service', audience: 'myeongha-api-service',
    keyId: 'preview-key-v1', nonce, issuedAtMs, expiresAtMs: issuedAtMs + 60_000,
    requestBodyHash: hash(expectedRequest), responseBodyHash: hash(response), material,
    productionInterpretationAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false, canPublish: false, canSell: false,
  };
  const signatureHex = createHmac('sha256', keyBytes)
    .update(DOMAIN).update(hash(payload)).digest('hex');
  return {
    schemaVersion: 'myeonghwa-source-reading-proof-http-v1',
    lifecycle: 'preview', state: 'held', response,
    proof: { payload, signatureHex },
    productionInterpretationAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false, canPublish: false, canSell: false,
  };
}
function trust(): SajuHeldSourceProofVerifierTrustV1 {
  const consumed = new Set<string>();
  return {
    trustedIssuer: 'saju-preview-service',
    expectedAudience: 'myeongha-api-service',
    trustedKeyId: 'preview-key-v1',
    keyBytes,
    claimNonceOnce: vi.fn(async (replayKey: string) => {
      if (consumed.has(replayKey)) return false;
      consumed.add(replayKey);
      return true;
    }),
  };
}
function context() { return { expectedNonce: nonce, expectedRequestBody: expectedRequest, nowMs: issuedAtMs + 1_000 }; }
function mutate(source: unknown, path: readonly string[], value: unknown, remove = false) {
  let target: unknown = source;
  for (const key of path.slice(0, -1)) {
    if (target === null || typeof target !== 'object') throw Error('Invalid mutation path');
    target = (target as Record<string, unknown>)[key];
  }
  if (target === null || typeof target !== 'object') throw Error('Missing mutation target');
  const key = path[path.length - 1]!;
  if (remove) delete (target as Record<string, unknown>)[key];
  else (target as Record<string, unknown>)[key] = value;
}
describe('2B-3C-3 MyeongHa source proof verification, Preview HOLD only', () => {
  it('verifies Saju-compatible signed source payload without elevating authority', async () => {
    const source = envelope(), t = trust();
    const actual = await verifySajuHeldSourceProofV1(source, t, context());
    expect(actual).toMatchObject({
      state: 'held', transportIntegrity: 'VERIFIED',
      sourceAuthority: 'NOT_EVALUATED', releaseAuthorization: 'NOT_EVALUATED',
      canExecute: false, canPublish: false, canSell: false,
      verifiedSource: {
        readingId: source.response.reading.readingId,
        responseId: source.response.responseId,
        profileRef: source.proof.payload.material.profileRef,
        evidenceBundleHash: 'b'.repeat(64),
      },
    });
    expect(JSON.stringify(actual)).not.toContain('합성 사용자');
    expect(JSON.stringify(actual)).not.toContain('출시 근거가 아님');
    expect(t.claimNonceOnce).toHaveBeenCalledTimes(1);
    expect(await verifySajuHeldSourceProofV1(source, t, context()))
      .toMatchObject({ state: 'blocked', transportIntegrity: 'NOT_VERIFIED', canSell: false });
  });

  it.each([
    ['wrong nonce', 'context', ['expectedNonce'], 'X'.repeat(24), false],
    ['wrong request', 'context', ['expectedRequestBody'], { ...expectedRequest, reading: { text: '연애운' } }, false],
    ['expired proof', 'context', ['nowMs'], issuedAtMs + 61_000, false],
    ['future timestamp', 'context', ['nowMs'], issuedAtMs - 20_000, false],
    ['wrong issuer', 'trust', ['trustedIssuer'], 'other-service', false],
    ['wrong audience', 'trust', ['expectedAudience'], 'other-audience', false],
    ['wrong key', 'trust', ['keyBytes'], Buffer.alloc(32, 55), false],
    ['weak key', 'trust', ['keyBytes'], Buffer.alloc(8), false],
    ['modified signature', 'envelope', ['proof', 'signatureHex'], '0'.repeat(64), false],
    ['wrong key ID', 'envelope', ['proof', 'payload', 'keyId'], 'other-key', false],
    ['changed evidence hash', 'envelope', ['proof', 'payload', 'material', 'evidenceBundleHash'], 'e'.repeat(64), false],
    ['changed profile hash', 'envelope', ['proof', 'payload', 'material', 'profileRef', 'contentHash'], 'f'.repeat(64), false],
    ['changed response ID', 'envelope', ['response', 'responseId'], 'reading_response_'+'d'.repeat(24), false],
    ['changed reading text', 'envelope', ['response', 'reading', 'sections', '0', 'title'], '수정된 제목', false],
    ['changed lifecycle', 'envelope', ['lifecycle'], 'production', false],
    ['execution granted', 'envelope', ['proof', 'payload', 'canExecute'], true, false],
    ['sale granted', 'envelope', ['canSell'], true, false],
    ['unknown approval field', 'envelope', ['commerceEntitlement'], 'paid', false],
    ['missing proof material', 'envelope', ['proof', 'payload', 'material', 'readingId'], null, true],
    ['invalid ttl', 'envelope', ['proof', 'payload', 'expiresAtMs'], issuedAtMs + 240_000, false],
  ] as const)('blocks %s before nonce claim', async (_name, target, path, value, remove) => {
    const source = structuredClone(envelope());
    const t = trust();
    const ctx = context();
    const holder = target === 'trust' ? t : target === 'context' ? ctx : source;
    mutate(holder, path, value, remove);
    const checked = await verifySajuHeldSourceProofV1(source, t, ctx);
    expect(checked).toMatchObject({
      state: 'blocked', canExecute: false, canPublish: false, canSell: false,
    });
    expect(t.claimNonceOnce).not.toHaveBeenCalled();
  });

  it('fails closed when shared nonce claim is unavailable or rejects replay', async () => {
    for (const claim of [
      async () => false,
      async () => { throw Error('shared nonce store offline'); },
    ]) {
      const result = await verifySajuHeldSourceProofV1(
        envelope(), { ...trust(), claimNonceOnce: claim }, context(),
      );
      expect(result).toMatchObject({ state: 'blocked', canSell: false });
    }
  });
});
