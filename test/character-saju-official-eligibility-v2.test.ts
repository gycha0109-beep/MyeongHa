import { describe, expect, it, vi } from 'vitest';
import {
  issueCharacterSajuOfficialStandardEligibilityV2,
  consumeCharacterSajuOfficialStandardEligibilityV2,
  CharacterSajuOfficialEligibilityErrorV2,
} from '../apps/api/src/character-saju-official-eligibility-v2.js';
import {
  prepareOfficialReadingReaderAdmissionV1,
} from '../apps/api/src/official-reading-reader-admission-v1.js';
import type { ProductReaderRuleLookupV1 } from '../apps/api/src/product-reader-eligibility-policy-v1.js';
import type { ContentReleaseRuntimeEntry } from '../packages/world-content/src/index.js';

const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const READING = '11111111-1111-4111-8111-111111111111';
const THREAD = '66666666-6666-4666-8666-666666666666';
const PRODUCT = '33333333-3333-4333-8333-333333333333';
const BUNDLE = '55555555-5555-4555-8555-555555555555';
const RELEASE = 'release-synthetic-reader';
const EFFECTIVE = '2026-10-09T08:00:00.000Z';

function standardPolicy(): ProductReaderRuleLookupV1 {
  return { status: 'approved', rule: {
    kind: 'standard_all_readers', productId: PRODUCT,
    productSpecVersion: 'standard-reading-v1', sajuDomain: 'general',
    ruleVersion: 'fixture-standard-rule', approvedPolicyRevision: 'fixture-approved-r1',
  }};
}

function fixture(reader = 'seyeon') {
  const readApprovedRule = vi.fn(async (): Promise<ProductReaderRuleLookupV1> => standardPolicy());
  const productAuthorityPort = { readApprovedRule };
  const access = {
    subjectId: SUBJECT, readingId: READING, readerCharacterId: reader,
    readerContentBundleId: BUNDLE,
    readingSessionId: '22222222-2222-4222-8222-222222222222',
    productId: PRODUCT, productSpecVersion: 'standard-reading-v1',
    topicKey: 'general', sajuDomain: 'general', readingPeriod: 'original',
    readingVariant: 'standard',
    sourceBirthRevisionId: '44444444-4444-4444-8444-444444444444',
    domainCapabilityVersion: 'general-v1',
    readingContractVersion: 'myeonghwa-product-reading-response-v2',
    sajuEngineVersion: 'saju-engine-v1',
    responseHash: 'sha256:v1:fixture-response-hash',
  };
  const input = {
    resolvedSubjectId: SUBJECT,
    threadId: THREAD,
    readingId: READING,
    effectiveAt: EFFECTIVE,
    contentEntry: {
      release: { releaseId: RELEASE, bundleId: BUNDLE },
      characters: { characters: [{ characterId: reader }] },
    } as unknown as ContentReleaseRuntimeEntry,
    threadBindingAuthorityPort: { readRuntimeBinding: vi.fn(async () => [{
      threadId: THREAD, status: 'active', activeContentReleaseId: RELEASE,
      activeContentBundleId: BUNDLE, contentRevision: 2,
      participantCharacterIds: [reader],
    }]) },
    accessAuthorityPort: { readAccessibleReadings: vi.fn(async () => [access]) },
    artifactAuthorityPort: { readArtifactSource: vi.fn(async () => [{
      readingId: READING, productId: PRODUCT, readerCharacterId: reader,
      readingContractVersion: 'myeonghwa-product-reading-response-v2',
      productResponseState: 'delivered',
      responseSnapshotJsonb: {
        responseVersion: 'myeonghwa-product-reading-response-v2',
        state: 'delivered',
        reading: {
          readingId: READING,
          sections: [{ sectionType: 'overview', title: '전체', blocks: [
            { type: 'paragraph', text: '공식 근거를 기반으로 설명합니다.' },
          ] }],
          disclosures: [],
          calculationSummary: {},
        },
      },
      responseHash: 'sha256:v1:fixture-response-hash',
      completedAt: '2026-10-09T07:30:00.000Z',
    }]) },
    productReaderEligibilityAuthorityPort: productAuthorityPort,
  };
  return { input, productAuthorityPort, readApprovedRule };
}

describe('A3-alpha — official standard Character Saju eligibility V2', () => {
  it.each(['seyeon', 'baekheon', 'yeoul', 'seorin', 'rahyeon', 'mira', 'taegyeom', 'yunho', 'doyun'])(
    'mints only after a real A2 ticket for the exact %s Reader and standard policy',
    async (reader) => {
      const f = fixture(reader);
      const prepared = await prepareOfficialReadingReaderAdmissionV1(f.input);
      const proof = await issueCharacterSajuOfficialStandardEligibilityV2({
        prepared, currentScope: prepared.scope, productAuthorityPort: f.productAuthorityPort,
      });
      expect(proof).toMatchObject({
        source: 'official_standard_product_rule',
        admittedDomain: 'general', productId: PRODUCT, readingRef: READING,
        subjectId: SUBJECT, readerCharacterId: reader,
        policyRevision: 'fixture-approved-r1',
      });
      expect(Object.isFrozen(proof)).toBe(true);
      expect(() => consumeCharacterSajuOfficialStandardEligibilityV2({
        proof, currentScope: prepared.scope,
      })).not.toThrow();
      expect(() => consumeCharacterSajuOfficialStandardEligibilityV2({
        proof, currentScope: prepared.scope,
      })).toThrow(CharacterSajuOfficialEligibilityErrorV2);
      await expect(issueCharacterSajuOfficialStandardEligibilityV2({
        prepared, currentScope: prepared.scope, productAuthorityPort: f.productAuthorityPort,
      })).rejects.toThrow(CharacterSajuOfficialEligibilityErrorV2);
    },
  );

  it('rejects a forged or cloned V2 proof and tampered scope', async () => {
    const f = fixture();
    const prepared = await prepareOfficialReadingReaderAdmissionV1(f.input);
    const proof = await issueCharacterSajuOfficialStandardEligibilityV2({
      prepared, currentScope: prepared.scope, productAuthorityPort: f.productAuthorityPort,
    });
    expect(() => consumeCharacterSajuOfficialStandardEligibilityV2({
      proof: { ...proof }, currentScope: prepared.scope,
    })).toThrow(CharacterSajuOfficialEligibilityErrorV2);
    expect(() => consumeCharacterSajuOfficialStandardEligibilityV2({
      proof, currentScope: { ...prepared.scope, readerCharacterId: 'baekheon' },
    })).toThrow(CharacterSajuOfficialEligibilityErrorV2);
    expect(() => consumeCharacterSajuOfficialStandardEligibilityV2({
      proof, currentScope: prepared.scope,
    })).toThrow(CharacterSajuOfficialEligibilityErrorV2);
  });

  it('does not mint standard eligibility from approved premium Reader eligibility', async () => {
    const f = fixture();
    const prepared = await prepareOfficialReadingReaderAdmissionV1(f.input);
    f.readApprovedRule.mockImplementationOnce(async () => ({
      status: 'approved', rule: {
        ...((standardPolicy() as Extract<ProductReaderRuleLookupV1, {status:'approved'}>).rule),
        kind: 'premium_restricted',
        allowedReaderIds: ['seyeon'],
      },
    }));
    await expect(issueCharacterSajuOfficialStandardEligibilityV2({
      prepared, currentScope: prepared.scope, productAuthorityPort: f.productAuthorityPort,
    })).rejects.toThrow(CharacterSajuOfficialEligibilityErrorV2);
  });

  it('rejects Product revision drift, policy hold and cloned A2 tickets', async () => {
    const f = fixture();
    const prepared = await prepareOfficialReadingReaderAdmissionV1(f.input);
    const changed = { ...prepared.scope, approvedPolicyRevision: 'stale' };
    await expect(issueCharacterSajuOfficialStandardEligibilityV2({
      prepared, currentScope: changed, productAuthorityPort: f.productAuthorityPort,
    })).rejects.toThrow(CharacterSajuOfficialEligibilityErrorV2);
    f.readApprovedRule.mockImplementationOnce(async () => ({
      status: 'withheld', reason: 'disabled',
    }));
    await expect(issueCharacterSajuOfficialStandardEligibilityV2({
      prepared, currentScope: prepared.scope, productAuthorityPort: f.productAuthorityPort,
    })).rejects.toThrow(CharacterSajuOfficialEligibilityErrorV2);
    expect(() => consumeCharacterSajuOfficialStandardEligibilityV2({
      proof: { source: 'official_standard_product_rule', admittedDomain: 'general',
        productId: PRODUCT, policyRevision: 'fixture-approved-r1',
        readingRef: READING, subjectId: SUBJECT, readerCharacterId: 'seyeon',
        threadId: THREAD, readerContentBundleId: BUNDLE, contentReleaseId: RELEASE,
        officialArtifactResponseHash: 'sha256:v1:fixture-response-hash' },
      currentScope: prepared.scope,
    })).toThrow(CharacterSajuOfficialEligibilityErrorV2);
  });
});
