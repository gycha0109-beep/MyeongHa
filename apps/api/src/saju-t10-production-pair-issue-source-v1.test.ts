import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashSajuHeldSourceProofRequestV1 as hashJson } from './saju-held-source-proof-verifier-v1.js';
import { projectProductReadingResponseV2 } from '../../../packages/api-client/src/product-reading-display.js';
import { projectSignedSajuT10PairProductReadingV1 } from './saju-t10-pair-official-product-reading-v1.js';
import {
  verifySajuT10ProductionPairIssueV1,
} from './saju-t10-production-pair-issue-source-v1.js';

const VERSION = 'myeongha-t10-production-pair-issue-v1';
const DOMAIN = 'myeongha/saju/production-pair-issue/v1\0';

function fixture(offerId: 'first-counterpart' | 'additional-counterpart' |
  'relationship-plus-first' = 'first-counterpart') {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const purchaseIntentId = randomUUID();
  const executionAttemptId = randomUUID();
  const readingId = randomUUID();
  const request = { birth: { date: '1990-05-15' }, partnerBirth: { date: '1996-06-05' } };
  const scope = {
    birthRevisionId: randomUUID(), targetBirthRevisionId: randomUUID(),
    sourceBirthInputHash: 'sha256:v1:' + 'a'.repeat(64),
    targetBirthInputHash: 'sha256:v1:' + 'b'.repeat(64),
    admissionHash: 'approved-purchase-admission', releaseRef: 't10-release-v1',
    sourceRequestHash: hashJson(request), request,
    paidComparison: {
      offerId,
      counterpartOrder: offerId === 'additional-counterpart' ? 'additional' : 'first',
      targetPersonId: randomUUID(), useApprovalRef: 'actual-consent',
      requiredComponents: offerId === 'relationship-plus-first'
        ? ['relationship', 'compatibility'] : ['compatibility'],
      releaseRef: 't10-release-v1', authorizedForIssue: false,
    },
  } as unknown as Parameters<typeof verifySajuT10ProductionPairIssueV1>[0]['scope'];
  const units = [
    'T10-SERVICE-DAY-SIX-COMBINATION',
    'T10-SERVICE-DAY-STEM-NO-FIVE-COMBINATION',
    'T10-SERVICE-BOUNDED-SCOPE',
  ].map(ruleId => {
    const source = {
      ruleId, paragraph: '서로 연결해 살펴보되 미래 결과를 단정하지 않습니다.',
      observedFactPaths: [], calculationSourceIds: [], sourceDefinitionHashes: [],
    };
    return { unitId: 't10_unit_' + hashJson(source).slice(0, 24), ...source };
  });
  const material = {
    version: 'saju-t10-pair-reading-material-v1',
    policyId: 'myeongha-t10-internal-relational-explanation-v1',
    policyVersion: '2026-11-13', readingDomain: 'compatibility',
    interpretationOwner: 'myeongha_internal_service',
    sourceScope: 'two_canonical_natal_charts',
    charts: [
      { role: 'self', snapshotId: 'self-snapshot', calculationHash: 'c'.repeat(64) },
      { role: 'partner', snapshotId: 'partner-snapshot', calculationHash: 'd'.repeat(64) },
    ],
    units,
  };
  const body = {
    version: 'saju-t10-official-pair-reading-v1', state: 'issued', readingId,
    readingDomain: 'compatibility', policyId: material.policyId,
    policyVersion: material.policyVersion, sourceScope: material.sourceScope,
    charts: material.charts.map((chart, i) => ({
      ...chart,
      birthRevisionId: i === 0 ? scope.birthRevisionId : scope.targetBirthRevisionId,
      birthInputHash: i === 0 ? scope.sourceBirthInputHash : scope.targetBirthInputHash,
    })),
    chartDisplays: [
      { role: 'self', pillars: {
        year: { status: 'resolved', value: '庚午' }, month: { status: 'resolved', value: '辛巳' },
        day: { status: 'resolved', value: '庚辰' }, hour: { status: 'resolved', value: '癸未' },
      } },
      { role: 'partner', pillars: {
        year: { status: 'resolved', value: '丙子' }, month: { status: 'resolved', value: '甲午' },
        day: { status: 'resolved', value: '丁酉' }, hour: { status: 'unavailable' },
      } },
    ],
    units, materialHash: hashJson(material),
  };
  const acceptedAtMs = Date.now();
  const payload = {
    version: VERSION, issuer: 'saju', audience: 'myeongha', keyId: 'pair-key',
    engineVersion: 'test-engine', executionAttemptId, purchaseIntentId, offerId,
    counterpartOrder: scope.paidComparison.counterpartOrder,
    targetPersonId: scope.paidComparison.targetPersonId,
    useApprovalRef: scope.paidComparison.useApprovalRef,
    admissionHash: scope.admissionHash,
    birthRevisionId: scope.birthRevisionId,
    targetBirthRevisionId: scope.targetBirthRevisionId,
    sourceBirthInputHash: scope.sourceBirthInputHash,
    targetBirthInputHash: scope.targetBirthInputHash,
    sourceRequestHash: scope.sourceRequestHash,
    releaseRef: scope.releaseRef, readingId,
    materialHash: body.materialHash,
    responseBodyHash: hashJson(body), issuedAtMs: acceptedAtMs,
  };
  const signature = sign(null, Buffer.from(DOMAIN + hashJson(payload)), privateKey).toString('base64url');
  const input = {
    scope, purchaseIntentId, executionAttemptId, readingId, body,
    proof: { payload, signature },
    trust: { issuer: 'saju', audience: 'myeongha', keyId: 'pair-key',
      engineVersion: 'test-engine', verificationKey: publicKey },
    acceptedAtMs,
  };
  return input;
}

describe('official T10 two-chart signature and purchased pair verification', () => {
  it.each(['first-counterpart', 'additional-counterpart', 'relationship-plus-first'] as const)(
    'verifies the correct signed body and two independent birth revisions for %s',
    offerId => {
      const input = fixture(offerId);
      const result = verifySajuT10ProductionPairIssueV1(input);
      expect(result?.state).toBe('production_pair_source_verified');
      expect(result?.materialHash).toBe(input.body.materialHash);
      const projected = projectSignedSajuT10PairProductReadingV1(input);
      expect(projected?.state).toBe('verified_pair_display_candidate');
      expect(projected?.originalSignedBodyHash).toBe('sha256:v1:' + hashJson(input.body));
      const display = projectProductReadingResponseV2(projected?.response);
      expect(display.kind).toBe('delivered');
      if (display.kind === 'delivered') {
        expect(display.readingId).toBe(input.readingId);
        expect(display.steps[0]?.title).toBe('두 사람의 명식');
        expect(display.steps[1]?.primary).toBe(input.body.units[0]?.paragraph);
        expect(display.steps[1]?.supporting).toEqual(input.body.units.slice(1).map(unit => unit.paragraph));
      }

    },
  );
  it('rejects source tampering, another counterpart, admission drift, retry reuse and an expired signature', () => {
    const input = fixture();
    expect(verifySajuT10ProductionPairIssueV1({
      ...input, body: { ...input.body, state: 'held' },
    })).toBeNull();
    expect(projectSignedSajuT10PairProductReadingV1({
      ...input, body: { ...input.body, state: 'held' },
    })).toBeNull();

    expect(verifySajuT10ProductionPairIssueV1({
      ...input, scope: {
        ...input.scope, paidComparison: {
          ...input.scope.paidComparison, targetPersonId: randomUUID(),
        },
      },
    })).toBeNull();
    expect(verifySajuT10ProductionPairIssueV1({
      ...input, scope: { ...input.scope, admissionHash: 'updated-after-source-call' },
    })).toBeNull();
    expect(verifySajuT10ProductionPairIssueV1({
      ...input, executionAttemptId: randomUUID(),
    })).toBeNull();
    expect(verifySajuT10ProductionPairIssueV1({
      ...input, acceptedAtMs: input.acceptedAtMs + 120_001,
    })).toBeNull();
    expect(verifySajuT10ProductionPairIssueV1({
      ...input, proof: { ...input.proof,
        signature: 'A'.repeat(86) },
    })).toBeNull();
  });
});
