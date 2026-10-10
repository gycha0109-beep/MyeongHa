import { describe, expect, it, vi } from 'vitest';
import {
  resolveOfficialReadingReaderThreadV1,
  OfficialReadingReaderThreadResolutionErrorV1,
} from '../apps/api/src/official-reading-reader-thread-resolution-v1.js';
import type {
  CharacterStandardReadingAccessAuthorityRowV1,
} from '../apps/api/src/character-standard-reading-knowledge.js';
import type { ProductReaderRuleLookupV1 } from '../apps/api/src/product-reader-eligibility-policy-v1.js';

const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const READING = '11111111-1111-4111-8111-111111111111';
const THREAD = '66666666-6666-4666-8666-666666666666';
const BUNDLE = '55555555-5555-4555-8555-555555555555';
const PRODUCT = '33333333-3333-4333-8333-333333333333';
const TIME = '2026-10-09T08:00:00.000Z';

function accessRow(): CharacterStandardReadingAccessAuthorityRowV1 {
  return {
    subjectId: SUBJECT,
    readingId: READING,
    readerCharacterId: 'seyeon',
    readerContentBundleId: BUNDLE,
    readingSessionId: '22222222-2222-4222-8222-222222222222',
    productId: PRODUCT,
    topicKey: 'general',
    sajuDomain: 'general',
    readingPeriod: 'original',
    readingVariant: 'standard',
    sourceBirthRevisionId: '44444444-4444-4444-8444-444444444444',
    productSpecVersion: 'standard-reading-v1',
    domainCapabilityVersion: 'general-v1',
    readingContractVersion: 'myeonghwa-product-reading-response-v2',
    sajuEngineVersion: 'saju-engine-v1',
    responseHash: 'sha256:v1:official-reading-hash',
  };
}
const approved = (): ProductReaderRuleLookupV1 => ({
  status: 'approved',
  rule: {
    kind: 'standard_all_readers',
    productId: PRODUCT,
    productSpecVersion: 'standard-reading-v1',
    sajuDomain: 'general',
    ruleVersion: 'synthetic-rule',
    approvedPolicyRevision: 'synthetic-policy',
  },
});

function fixture(options: {
  subjectKind?: 'member' | 'guest';
  accessRows?: readonly CharacterStandardReadingAccessAuthorityRowV1[];
  laterAccessRows?: readonly CharacterStandardReadingAccessAuthorityRowV1[];
  policy?: ProductReaderRuleLookupV1;
  laterPolicy?: ProductReaderRuleLookupV1;
  candidates?: readonly { threadId: string }[];
  candidateFailure?: boolean;
  threadReader?: string;
  threadBundle?: string;
  threadParticipants?: readonly string[];
  threadRevisionDrift?: boolean;
  threadFailure?: boolean;
} = {}) {
  const events: string[] = [];
  let accessReads = 0;
  let policyReads = 0;
  let threadReads = 0;
  const readAccessibleReadings = vi.fn(async (input: {
    subjectId: string; readerCharacterId: string; effectiveAt: string;
  }) => {
    events.push('access');
    accessReads++;
    expect(input).toEqual({
      subjectId: SUBJECT, readerCharacterId: 'seyeon', effectiveAt: TIME,
    });
    return accessReads === 1
      ? (options.accessRows ?? [accessRow()])
      : (options.laterAccessRows ?? options.accessRows ?? [accessRow()]);
  });
  const readApprovedRule = vi.fn(async () => {
    events.push('policy');
    policyReads++;
    return policyReads > 1 && options.laterPolicy
      ? options.laterPolicy : (options.policy ?? approved());
  });
  const readActiveMemberSingleCharacterThreads = vi.fn(async (input: {
    subjectId: string; readerCharacterId: string;
  }) => {
    events.push('locator');
    expect(input).toEqual({ subjectId: SUBJECT, readerCharacterId: 'seyeon' });
    if (options.candidateFailure) throw new Error('unavailable');
    return options.candidates ?? [{ threadId: THREAD }];
  });
  const readRuntimeBinding = vi.fn(async (input: {
    subjectId: string; threadId: string;
  }) => {
    events.push('thread');
    threadReads++;
    expect(input).toEqual({ subjectId: SUBJECT, threadId: THREAD });
    if (options.threadFailure) throw new Error('unavailable');
    return [{
      threadId: THREAD,
      status: 'active',
      activeContentReleaseId: 'synthetic-release',
      activeContentBundleId: options.threadBundle ?? BUNDLE,
      contentRevision: options.threadRevisionDrift && threadReads > 1 ? 9 : 2,
      participantCharacterIds: options.threadParticipants ?? [options.threadReader ?? 'seyeon'],
    }];
  });
  const input = {
    resolvedSubjectId: SUBJECT,
    resolvedSubjectKind: options.subjectKind ?? 'member',
    readingId: READING,
    readerCharacterId: 'seyeon',
    effectiveAt: TIME,
    accessAuthorityPort: { readAccessibleReadings },
    productReaderEligibilityAuthorityPort: { readApprovedRule },
    threadLocatorAuthorityPort: { readActiveMemberSingleCharacterThreads },
    threadBindingAuthorityPort: { readRuntimeBinding },
  };
  return { input, events, readAccessibleReadings, readApprovedRule,
    readActiveMemberSingleCharacterThreads, readRuntimeBinding };
}

async function expectDenied(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error('expected denied');
  } catch (error) {
    expect(error).toBeInstanceOf(OfficialReadingReaderThreadResolutionErrorV1);
    expect((error as OfficialReadingReaderThreadResolutionErrorV1).code).toBe(code);
    expect((error as Error).message).not.toContain(SUBJECT);
    expect((error as Error).message).not.toContain(READING);
  }
}

describe('D-05 dormant server-owned existing Member Reader thread lookup', () => {
  it('returns one correctly pinned existing thread without creating or reading a raw artifact', async () => {
    const f = fixture();
    const resolved = await resolveOfficialReadingReaderThreadV1(f.input);
    expect(resolved).toEqual({
      subjectId: SUBJECT, readingId: READING, readerCharacterId: 'seyeon',
      threadId: THREAD, activeContentReleaseId: 'synthetic-release',
      activeContentBundleId: BUNDLE, contentRevision: 2,
      sourceResponseHash: 'sha256:v1:official-reading-hash',
      productRuleVersion: 'synthetic-rule',
      approvedPolicyRevision: 'synthetic-policy',
    });
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(f.events).toEqual([
      'access', 'policy', 'locator', 'thread', 'access', 'policy', 'thread',
    ]);
    expect(f.readActiveMemberSingleCharacterThreads).toHaveBeenCalledTimes(1);
  });

  it('requires authenticated canonical Member before ANY authority lookup', async () => {
    for (const override of [
      { resolvedSubjectId: undefined },
      { resolvedSubjectId: ' ' },
      { resolvedSubjectKind: 'guest' as const },
      { readingId: '' },
      { readerCharacterId: '' },
      { effectiveAt: 'nonsense' },
    ]) {
      const f = fixture();
      await expectDenied(resolveOfficialReadingReaderThreadV1({
        ...f.input, ...override,
      }), 'ACCESS_DENIED');
      expect(f.events).toEqual([]);
    }
  });

  it.each([
    ['absent Grant', [], 'ACCESS_DENIED'],
    ['another Reading', [{ ...accessRow(), readingId: 'another-reading' }], 'ACCESS_DENIED'],
    ['another Reader', [{ ...accessRow(), readerCharacterId: 'baekheon' }], 'ACCESS_DENIED'],
    ['another Subject', [{ ...accessRow(), subjectId: 'other-subject' }], 'ACCESS_DENIED'],
    ['multiple Bundles', [accessRow(), { ...accessRow(), readerContentBundleId: 'different-bundle' }], 'ACCESS_DENIED'],
    ['duplicate access', [accessRow(), accessRow()], 'ACCESS_DENIED'],
  ] as const)('%s rejects unadmitted access BEFORE consulting policy or threads',
    async (_label, rows, code) => {
      const f = fixture({ accessRows: rows });
      await expectDenied(resolveOfficialReadingReaderThreadV1(f.input), code);
      expect(f.events).toEqual(['access']);
    });

  it.each([
    ['withheld', { status: 'withheld', reason: 'disabled' } as const],
    ['excluded', { status: 'approved', rule: {
      kind: 'premium_restricted', productId: PRODUCT,
      productSpecVersion: 'standard-reading-v1', sajuDomain: 'general',
      ruleVersion: 'synthetic-restricted', approvedPolicyRevision: 'synthetic-policy',
      allowedReaderIds: ['baekheon'],
    }} as const],
  ])('%s policy prevents even finding a thread', async (_label, policy) => {
    const f = fixture({ policy });
    await expectDenied(resolveOfficialReadingReaderThreadV1(f.input), 'POLICY_HOLD');
    expect(f.events).toEqual(['access', 'policy']);
  });

  it.each([
    ['none', [], 'THREAD_UNAVAILABLE'],
    ['two', [{ threadId: THREAD }, { threadId: 'other-thread' }], 'THREAD_AMBIGUOUS'],
    ['duplicate', [{ threadId: THREAD }, { threadId: THREAD }], 'THREAD_AMBIGUOUS'],
    ['invalid', [{ threadId: '' }], 'THREAD_INCOMPATIBLE'],
  ] as const)('%s candidate set is never guessed or auto-created', async (_label, candidates, code) => {
    const f = fixture({ candidates });
    await expectDenied(resolveOfficialReadingReaderThreadV1(f.input), code);
    expect(f.events).toEqual(['access', 'policy', 'locator']);
  });

  it('fails closed on locator or binding failures', async () => {
    const a = fixture({ candidateFailure: true });
    await expectDenied(resolveOfficialReadingReaderThreadV1(a.input), 'THREAD_UNAVAILABLE');
    expect(a.events).toEqual(['access', 'policy', 'locator']);
    const b = fixture({ threadFailure: true });
    await expectDenied(resolveOfficialReadingReaderThreadV1(b.input), 'THREAD_UNAVAILABLE');
    expect(b.events).toEqual(['access', 'policy', 'locator', 'thread']);
  });

  it.each([
    ['other Reader', { threadReader: 'baekheon' }],
    ['other Bundle', { threadBundle: 'other-bundle' }],
    ['multi Character', { threadParticipants: ['seyeon', 'baekheon'] }],
  ])('%s active thread is rejected without reading an artifact', async (_label, opts) => {
    const f = fixture(opts);
    await expectDenied(resolveOfficialReadingReaderThreadV1(f.input), 'THREAD_INCOMPATIBLE');
    expect(f.events).toEqual(['access', 'policy', 'locator', 'thread']);
  });

  it('rejects access revocation or source change during lookup', async () => {
    for (const laterAccessRows of [
      [],
      [{ ...accessRow(), responseHash: 'changed-official-source' }],
      [{ ...accessRow(), readerContentBundleId: 'changed-bundle' }],
    ]) {
      const f = fixture({ laterAccessRows });
      await expectDenied(resolveOfficialReadingReaderThreadV1(f.input), 'ACCESS_DENIED');
      expect(f.events).toEqual(['access', 'policy', 'locator', 'thread', 'access']);
    }
  });

  it('rejects Product revision or thread revision drift', async () => {
    const f = fixture({ laterPolicy: {
      status: 'approved',
      rule: {
        kind: 'standard_all_readers',
        productId: PRODUCT, productSpecVersion: 'standard-reading-v1',
        sajuDomain: 'general', ruleVersion: 'changed-rule',
        approvedPolicyRevision: 'synthetic-policy',
      },
    } });
    await expectDenied(resolveOfficialReadingReaderThreadV1(f.input), 'POLICY_HOLD');
    expect(f.events).toEqual(['access', 'policy', 'locator', 'thread', 'access', 'policy']);

    const g = fixture({ threadRevisionDrift: true });
    await expectDenied(resolveOfficialReadingReaderThreadV1(g.input), 'THREAD_INCOMPATIBLE');
    expect(g.events).toEqual(['access', 'policy', 'locator', 'thread', 'access', 'policy', 'thread']);
  });

  it('one lookup remains read-only across repeated calls', async () => {
    const f = fixture();
    await resolveOfficialReadingReaderThreadV1(f.input);
    await resolveOfficialReadingReaderThreadV1(f.input);
    expect(f.readActiveMemberSingleCharacterThreads).toHaveBeenCalledTimes(2);
    expect(f.readAccessibleReadings).toHaveBeenCalledTimes(4);
    expect(f.readRuntimeBinding).toHaveBeenCalledTimes(4);
  });
});
