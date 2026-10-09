import { describe, expect, it, vi } from 'vitest';
import {
  OFFICIAL_READER_ADMISSION_VERSION_V1,
  OfficialReadingReaderAdmissionErrorV1,
  prepareOfficialReadingReaderAdmissionV1,
  consumeOfficialReadingReaderAdmissionV1,
  type OfficialReadingReaderAdmissionScopeV1,
  type OfficialReadingReaderAdmissionTicketV1,
} from '../apps/api/src/official-reading-reader-admission-v1.js';
import type {
  ChatThreadRuntimeBindingReadAuthorityPortV1,
} from '../apps/api/src/chat-thread-runtime-binding-read.js';
import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
  CharacterStandardReadingAccessAuthorityRowV1,
  CharacterStandardReadingArtifactAuthorityRowV1,
} from '../apps/api/src/character-standard-reading-knowledge.js';
import type {
  ProductReaderEligibilityAuthorityPortV1,
  ProductReaderRuleLookupV1,
} from '../apps/api/src/product-reader-eligibility-policy-v1.js';
import type { ContentReleaseRuntimeEntry } from '../packages/world-content/src/index.js';

const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const READING = '11111111-1111-4111-8111-111111111111';
const THREAD = '66666666-6666-4666-8666-666666666666';
const PRODUCT = '33333333-3333-4333-8333-333333333333';
const BUNDLE = '55555555-5555-4555-8555-555555555555';
const RELEASE = 'released-synthetic-character-v1';
const TIME = '2026-10-09T08:00:00.000Z';

function accessRow(reader = 'seyeon') {
  return {
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
    responseHash: 'sha256:v1:official-reading-hash',
  };
}
function artifactRow(reader = 'seyeon') {
  return {
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
    responseHash: 'sha256:v1:official-reading-hash',
    completedAt: '2026-10-09T07:30:00.000Z',
  };
}
function approved(readerIds?: readonly ('seyeon' | 'baekheon')[]): ProductReaderRuleLookupV1 {
  return {
    status: 'approved',
    rule: readerIds ? {
      kind: 'premium_restricted', productId: PRODUCT,
      productSpecVersion: 'standard-reading-v1',
      sajuDomain: 'general', ruleVersion: 'synthetic-premium-rule',
      approvedPolicyRevision: 'synthetic-policy-revision',
      allowedReaderIds: readerIds,
    } : {
      kind: 'standard_all_readers', productId: PRODUCT,
      productSpecVersion: 'standard-reading-v1',
      sajuDomain: 'general', ruleVersion: 'synthetic-standard-rule',
      approvedPolicyRevision: 'synthetic-policy-revision',
    },
  };
}
function fixtures(options: {
  threadReader?: string;
  threadParticipants?: string[];
  accessRows?: CharacterStandardReadingAccessAuthorityRowV1[];
  artifactRows?: CharacterStandardReadingArtifactAuthorityRowV1[];
  policy?: ProductReaderRuleLookupV1;
  pinnedBundle?: string;
  failPolicy?: boolean;
  changeThreadOnRecheck?: boolean;
  responseState?: string;
} = {}) {
  const reader = options.threadReader ?? 'seyeon';
  const events: string[] = [];
  let threadReadCount = 0;
  const readRuntimeBinding = vi.fn(async (_input: { subjectId: string; threadId: string }) => {
    events.push('thread');
    threadReadCount += 1;
    const changed = options.changeThreadOnRecheck && threadReadCount > 1;
    return [{
      threadId: THREAD,
      status: 'active',
      activeContentReleaseId: RELEASE,
      activeContentBundleId: options.pinnedBundle ?? BUNDLE,
      contentRevision: changed ? 3 : 2,
      participantCharacterIds: options.threadParticipants ?? [reader],
    }];
  });
  const readAccessibleReadings = vi.fn(async (_input: {
    subjectId: string; readerCharacterId: string; effectiveAt: string;
  }) => {
    events.push('access');
    return options.accessRows ?? [accessRow(reader)];
  });
  const readApprovedRule = vi.fn(async (_input: Parameters<
    ProductReaderEligibilityAuthorityPortV1['readApprovedRule']
  >[0]) => {
    events.push('policy');
    if (options.failPolicy) throw new Error('policy unavailable');
    return options.policy ?? approved();
  });
  const readArtifactSource = vi.fn(async (_input: {
    subjectId: string; readingId: string; readerCharacterId: string;
    effectiveAt: string;
  }) => {
    events.push('artifact');
    return options.artifactRows ?? [{
      ...artifactRow(reader),
      ...(options.responseState ? { productResponseState: options.responseState } : {}),
    }];
  });
  const contentEntry = {
    release: { releaseId: RELEASE, bundleId: BUNDLE },
    characters: { characters: [{ characterId: reader }] },
  } as unknown as ContentReleaseRuntimeEntry;
  const input = {
    resolvedSubjectId: SUBJECT,
    threadId: THREAD,
    readingId: READING,
    effectiveAt: TIME,
    contentEntry,
    threadBindingAuthorityPort: { readRuntimeBinding } satisfies
      ChatThreadRuntimeBindingReadAuthorityPortV1,
    accessAuthorityPort: { readAccessibleReadings } satisfies
      CharacterStandardReadingAccessAuthorityPortV1,
    artifactAuthorityPort: { readArtifactSource } satisfies
      CharacterStandardReadingArtifactAuthorityPortV1,
    productReaderEligibilityAuthorityPort: { readApprovedRule } satisfies
      ProductReaderEligibilityAuthorityPortV1,
  };
  return { input, events, readRuntimeBinding, readAccessibleReadings,
    readApprovedRule, readArtifactSource };
}

describe('A2-beta server-only Reading × Reader admission', () => {
  it('enforces thread -> exact Reader access -> Product policy -> artifact -> thread recheck', async () => {
    const f = fixtures();
    const result = await prepareOfficialReadingReaderAdmissionV1(f.input);
    expect(f.events).toEqual(['thread', 'access', 'policy', 'artifact', 'thread']);
    expect(f.readAccessibleReadings).toHaveBeenCalledWith({
      subjectId: SUBJECT, readerCharacterId: 'seyeon', effectiveAt: TIME,
    });
    expect(f.readApprovedRule).toHaveBeenCalledWith({
      productId: PRODUCT, productSpecVersion: 'standard-reading-v1',
      sajuDomain: 'general', effectiveAt: TIME,
    });
    expect(f.readArtifactSource).toHaveBeenCalledWith({
      subjectId: SUBJECT, readingId: READING,
      readerCharacterId: 'seyeon', effectiveAt: TIME,
    });
    expect(result.scope).toMatchObject({
      subjectId: SUBJECT, readerCharacterId: 'seyeon', readingId: READING,
      threadId: THREAD, contentReleaseId: RELEASE, readerContentBundleId: BUNDLE,
      officialArtifactResponseHash: 'sha256:v1:official-reading-hash',
      productRuleVersion: 'synthetic-standard-rule',
    });
    expect(Object.keys(result.ticket)).toEqual(['kind']);
    expect(result.ticket.kind).toBe(OFFICIAL_READER_ADMISSION_VERSION_V1);
    expect(JSON.stringify(result.ticket)).not.toContain(SUBJECT);
    expect(JSON.stringify(result.ticket)).not.toContain(READING);
    expect(JSON.stringify(result.ticket)).not.toContain('공식');
    expect(Object.isFrozen(result.ticket)).toBe(true);
    consumeOfficialReadingReaderAdmissionV1({
      ticket: result.ticket, expectedScope: result.scope,
    });
    expect(() => consumeOfficialReadingReaderAdmissionV1({
      ticket: result.ticket, expectedScope: result.scope,
    })).toThrow(OfficialReadingReaderAdmissionErrorV1);
  });

  it.each([
    { label: 'absent', rows: [] },
    { label: 'only another Reader', rows: [accessRow('baekheon')] },
    { label: 'only another Subject', rows: [{ ...accessRow(), subjectId: 'other-subject' }] },
    { label: 'duplicate', rows: [accessRow(), accessRow()] },
    { label: 'other Reading', rows: [{ ...accessRow(), readingId: 'other-reading' }] },
    { label: 'other bundle', rows: [{ ...accessRow(), readerContentBundleId: 'other-bundle' }] },
  ])('blocks $label access BEFORE policy or artifact', async ({ rows }) => {
    const f = fixtures({ accessRows: rows });
    await expect(prepareOfficialReadingReaderAdmissionV1(f.input)).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
    });
    expect(f.events).toEqual(['thread', 'access']);
    expect(f.readApprovedRule).not.toHaveBeenCalled();
    expect(f.readArtifactSource).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'unclassified', policy: { status: 'withheld', reason: 'unclassified' } as const },
    { label: 'disabled', policy: { status: 'withheld', reason: 'disabled' } as const },
    { label: 'malformed', policy: { status: 'approved', rule: { kind: 'standard_all_readers' } } as unknown as ProductReaderRuleLookupV1 },
    { label: 'wrong spec', policy: {
      status: 'approved', rule: { ...((approved() as Extract<
        ProductReaderRuleLookupV1, { status: 'approved' }>).rule),
        productSpecVersion: 'forged-spec',
      },
    } as ProductReaderRuleLookupV1 },
    { label: 'premium excludes Reader', policy: approved(['baekheon']) },
  ])('holds $label Product policy before raw artifact', async ({ policy }) => {
    const f = fixtures({ policy });
    await expect(prepareOfficialReadingReaderAdmissionV1(f.input)).rejects.toMatchObject({
      code: 'POLICY_HOLD',
    });
    expect(f.events).toEqual(['thread', 'access', 'policy']);
    expect(f.readArtifactSource).not.toHaveBeenCalled();
  });

  it('fails closed when Product policy authority throws, without artifact read', async () => {
    const f = fixtures({ failPolicy: true });
    await expect(prepareOfficialReadingReaderAdmissionV1(f.input)).rejects.toMatchObject({
      code: 'POLICY_HOLD',
    });
    expect(f.events).toEqual(['thread', 'access', 'policy']);
  });

  it('future approved Premium allowlist can support one Reader without granting the others', async () => {
    const allowed = fixtures({ policy: approved(['seyeon']) });
    const success = await prepareOfficialReadingReaderAdmissionV1(allowed.input);
    expect(success.scope.readerCharacterId).toBe('seyeon');
    const denied = fixtures({ threadReader: 'baekheon', policy: approved(['seyeon']) });
    await expect(prepareOfficialReadingReaderAdmissionV1(denied.input))
      .rejects.toMatchObject({ code: 'POLICY_HOLD' });
    expect(denied.readArtifactSource).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'hash drift', rows: [{ ...artifactRow(), responseHash: 'forged' }] },
    { label: 'product drift', rows: [{ ...artifactRow(), productId: 'wrong-product' }] },
    { label: 'Reader drift', rows: [artifactRow('baekheon')] },
    { label: 'wrong snapshot', rows: [{
      ...artifactRow(), responseSnapshotJsonb: { responseVersion: 'forged' },
    }] },
    { label: 'not delivered', rows: [{
      ...artifactRow(), productResponseState: 'pending',
    }] },
  ])('denies $label artifact before mint', async ({ rows }) => {
    const f = fixtures({ artifactRows: rows });
    await expect(prepareOfficialReadingReaderAdmissionV1(f.input))
      .rejects.toMatchObject({ code: 'SOURCE_CONFLICT' });
    expect(f.events).toEqual(['thread', 'access', 'policy', 'artifact']);
  });

  it('rejects non-single Reader Thread before metadata access', async () => {
    const f = fixtures({ threadParticipants: ['seyeon', 'baekheon'] });
    await expect(prepareOfficialReadingReaderAdmissionV1(f.input))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.events).toEqual(['thread']);
  });

  it('rejects a stale pinned Character bundle before metadata access', async () => {
    const f = fixtures({ pinnedBundle: 'stale-content-bundle' });
    await expect(prepareOfficialReadingReaderAdmissionV1(f.input))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.events).toEqual(['thread']);
  });

  it('rejects Thread content revision change between metadata and final mint', async () => {
    const f = fixtures({ changeThreadOnRecheck: true });
    await expect(prepareOfficialReadingReaderAdmissionV1(f.input))
      .rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(f.events).toEqual(['thread', 'access', 'policy', 'artifact', 'thread']);
  });

  it('prevents forged, cloned, scope-swapped and reused tickets', async () => {
    const f = fixtures();
    const approvedRun = await prepareOfficialReadingReaderAdmissionV1(f.input);
    const fake = { ...approvedRun.ticket } as OfficialReadingReaderAdmissionTicketV1;
    expect(() => consumeOfficialReadingReaderAdmissionV1({
      ticket: fake, expectedScope: approvedRun.scope,
    })).toThrow(OfficialReadingReaderAdmissionErrorV1);

    for (const changed of [
      { subjectId: 'other-subject' }, { threadId: 'other-thread' },
      { contentRevision: 999 }, { readingId: 'another-reading' },
      { readerCharacterId: 'baekheon' }, { readerContentBundleId: 'another-bundle' },
      { contentReleaseId: 'another-release' }, { effectiveAt: 'another-time' },
      { productId: 'another-product' }, { productSpecVersion: 'another-spec' },
      { sajuDomain: 'wealth' as const }, { readingContractVersion: 'another-version' },
      { officialArtifactResponseHash: 'another-hash' },
      { productRuleVersion: 'another-rule' },
      { approvedPolicyRevision: 'another-revision' },
    ]) {
      const run = await prepareOfficialReadingReaderAdmissionV1(fixtures().input);
      const changedScope: OfficialReadingReaderAdmissionScopeV1 =
        { ...run.scope, ...changed };
      expect(() => consumeOfficialReadingReaderAdmissionV1({
        ticket: run.ticket, expectedScope: changedScope,
      })).toThrow(OfficialReadingReaderAdmissionErrorV1);
      expect(() => consumeOfficialReadingReaderAdmissionV1({
        ticket: run.ticket, expectedScope: run.scope,
      })).toThrow(OfficialReadingReaderAdmissionErrorV1);
    }

    consumeOfficialReadingReaderAdmissionV1({
      ticket: approvedRun.ticket, expectedScope: approvedRun.scope,
    });
    expect(() => consumeOfficialReadingReaderAdmissionV1({
      ticket: approvedRun.ticket, expectedScope: approvedRun.scope,
    })).toThrow(OfficialReadingReaderAdmissionErrorV1);
  });
});
