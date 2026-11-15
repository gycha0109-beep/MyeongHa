import { describe, expect, it, vi } from 'vitest';
import {
  prepareFourCharacterDynamicContextForTurnV1,
  type PrepareFourCharacterDynamicContextForTurnInputV1,
} from '../apps/api/src/four-character-dynamic-context-for-turn-v1.js';
import type {
  CharacterContextSegmentV1,
  CharacterContextSourceAdmissionPortV1,
} from '../packages/domain/src/character-dynamic-context-composer-v1.js';
import type {
  PublishedFourCharacterModelSourceV1,
} from '../apps/api/src/four-character-production-chat-executor-v1.js';

type SyntheticRequest = Readonly<{
  output: number;
  segments: readonly CharacterContextSegmentV1[];
}>;
const artifactHash = 'sha256:v1:' + 'a'.repeat(64);

function fixture(): PrepareFourCharacterDynamicContextForTurnInputV1<SyntheticRequest> {
  const published: PublishedFourCharacterModelSourceV1 = {
    status: 'published',
    characterId: 'baekheon',
    releaseId: 'release-pinned',
    bundleId: 'bundle-pinned',
    contentVersion: 'version-pinned',
    sourceDigest: artifactHash,
    bibleSourceRef: 'docs/character/approved-bible.md',
    runtimeSourceRef: 'docs/character/approved-runtime.md',
    assetManifestHash: 'sha256:v1:' + 'b'.repeat(64),
    cueSchemaVersion: 'fixture-cues',
    canonicalContext: JSON.stringify({ characterId: 'baekheon', approved: true }),
  };
  return {
    resolvedSubjectId: 'subject-a',
    characterId: 'baekheon',
    threadBinding: { threadId: 'thread-a', participantCharacterIds: ['baekheon'] },
    currentUserMessageRef: 'message-user-1',
    expectedRelationshipRevision: null,
    recentMessageLimit: 3,
    relationshipEventLimit: 2,
    now: '2026-11-08T00:00:00.000Z',
    limit: 3,
    capabilityGateInput: {
      needsSaju: false,
      characterCapabilityAllowed: true,
      userConsentAllowed: true,
      sajuDomainAvailability: 'not_requested',
      worldStateAllowed: true,
      entitlementAllowed: true,
      contentPolicyAllowed: true,
      clientCapabilityAllowed: true,
    },
    memoryAuthorityPort: { readGrantedMemories: vi.fn(async () => []) },
    nonMemoryAuthorityPort: {
      readGrantedLifeFacts: vi.fn(async () => []),
      readRelationshipEvents: vi.fn(async () => []),
      readRecentMessages: vi.fn(async () => [{
        messageId: 'message-user-1',
        sequenceNo: 1,
        senderType: 'user' as const,
        characterId: null,
        text: '이전에 나눴던 이야기 기억하세요?',
        createdAt: '2026-11-07T00:00:00.000Z',
      }]),
    },
    relationshipAuthorityPort: { readCurrentRelationship: vi.fn(async () => []) },
    publishedSourcePin: {
      releaseId: 'release-pinned',
      bundleId: 'bundle-pinned',
      contentVersion: 'version-pinned',
    },
    publication: {
      readPublishedSource: vi.fn(async () => published),
    },
    otherSourceAdmission: {
      admit: vi.fn(({
        scope, segment,
      }: Parameters<CharacterContextSourceAdmissionPortV1['admit']>[0]) =>
        scope.subjectId === 'subject-a' &&
        scope.threadId === 'thread-a' &&
        scope.characterId === 'baekheon' &&
        (
          segment.layer === 'system_safety_product' &&
          segment.sourceRef === 'policy:approved' &&
          segment.text === 'Approved policy.' ||
          segment.layer === 'response_task' &&
          segment.sourceRef === 'task:reply' &&
          segment.text === 'Respond to this User.'
        )),
    },
    systemSafety: { sourceRef: 'policy:approved', text: 'Approved policy.' },
    responseTask: { sourceRef: 'task:reply', text: 'Respond to this User.' },
    profile: {
      schemaVersion: 'model-token-budget-profile-v1',
      profileId: 'offline-fixture',
      policyVersion: 'offline-v1',
      providerKey: 'synthetic',
      modelKey: 'synthetic',
      pricingVersion: 'fixture-only',
      contextWindowTokens: 300,
      maximumInputTokens: 170,
      maximumOutputTokens: 40,
      reservedHeadroomTokens: 10,
      maximumSerializedRequestBytes: 20000,
      tokenCounter: {
        adapterId: 'fixture-adapter',
        adapterVersion: 'v1',
        supportedRequestFormat: 'synthetic-json-v1',
        inputBoundSemantics: 'certified_upper_bound_includes_reserved_headroom',
      },
    },
    adapter: {
      adapterId: 'fixture-adapter',
      adapterVersion: 'v1',
      providerKey: 'synthetic',
      modelKey: 'synthetic',
      supportedRequestFormat: 'synthetic-json-v1',
      reservedHeadroomTokens: 10,
      inputBoundSemantics: 'certified_upper_bound_includes_reserved_headroom',
      countExactRequest: vi.fn(({ serializedRequestBody }) => {
        const parsed = JSON.parse(serializedRequestBody) as SyntheticRequest;
        return parsed.segments.length * 20 + 10;
      }),
    },
    buildExactRequest: vi.fn(segments => {
      const request: SyntheticRequest = { output: 40, segments };
      return {
        request,
        requestFormat: 'synthetic-json-v1',
        serializedRequestBody: JSON.stringify(request),
        enforcedOutputTokenLimit: 40,
      };
    }),
  };
}

function fixtureWithGrantedMemory(granteeCharacterId = 'baekheon'):
  PrepareFourCharacterDynamicContextForTurnInputV1<SyntheticRequest> {
  const basic = fixture();
  return {
    ...basic,
    memoryAuthorityPort: {
      readGrantedMemories: vi.fn(async () => [{
        memoryItemId: 'memory-approved-a',
        memoryType: 'synthetic_recall',
        schemaVersion: 'fixture-v1',
        content: { summary: 'private canonical Memory payload' },
        createdByCharacterId: 'baekheon',
        createdAt: '2026-10-01T00:00:00.000Z',
        grantId: 'grant-approved-a',
        granteeCharacterId,
        grantReason: 'user_choice' as const,
        grantedAt: '2026-10-01T00:01:00.000Z',
        sourceKind: 'user_approved' as const,
        sourceTurnId: 'turn-authorized-a',
        sourceMessageId: 'source-message-authorized-a',
        sourceMergeActionId: null,
      }]),
    },
    projectors: [{
      recordKind: 'memory',
      recordType: 'synthetic_recall',
      schemaVersion: 'fixture-v1',
      projectorVersion: 'fixture-authorized-projector-v1',
      project: () => ({
        summary: '이전에 나눴던 이야기였습니다.',
        claimKind: 'character_interpretation' as const,
        relevance: 0.9,
        salience: 0.9,
      }),
    }],
  };
}

describe('four-Character source-bound turn -> offline composer', () => {
  it('checks turn rights then fetches exact published source and builds counted request', async () => {
    const input = fixture();
    const result = await prepareFourCharacterDynamicContextForTurnV1(input);
    expect(input.memoryAuthorityPort.readGrantedMemories).toHaveBeenCalledOnce();
    expect(input.publication.readPublishedSource).toHaveBeenCalledWith({
      subjectId: 'subject-a',
      threadId: 'thread-a',
      characterId: 'baekheon',
      ...input.publishedSourcePin,
    });
    expect(result.executionMode).toBe('offline_preflight_only');
    expect(result.trace.includedSourceRefs).toContain(
      'character:baekheon:published:' + 'a'.repeat(64),
    );
    expect(input.buildExactRequest).toHaveBeenCalledOnce();
    expect(input.adapter.countExactRequest).toHaveBeenCalledOnce();
    expect(result.exactRequest.serializedRequestBody).toContain('baekheon');
    expect(JSON.stringify(result.trace)).not.toContain('이전에 나눴던 이야기');
  });

  it('joins exact independently published Character core with only its granted Memory in the counted request', async () => {
    const request = fixtureWithGrantedMemory();
    const result = await prepareFourCharacterDynamicContextForTurnV1(request);
    const expectedMemoryRef = 'memory:memory-approved-a:grant:grant-approved-a';
    expect(request.memoryAuthorityPort.readGrantedMemories).toHaveBeenCalledWith({
      subjectId: 'subject-a', characterId: 'baekheon',
    });
    expect(request.publication.readPublishedSource).toHaveBeenCalledOnce();
    expect(result.trace.includedSourceRefs).toEqual(expect.arrayContaining([
      'character:baekheon:published:' + 'a'.repeat(64),
      expectedMemoryRef,
    ]));
    expect(result.segments.find(s => s.layer === 'retrieved_memory'))
      .toMatchObject({ sourceRef: expectedMemoryRef });
    expect(result.exactRequest.serializedRequestBody)
      .toContain('이전에 나눴던 이야기였습니다.');
    expect(result.exactRequest.serializedRequestBody)
      .toContain('baekheon');
    expect(request.buildExactRequest).toHaveBeenCalledOnce();
    expect(request.adapter.countExactRequest).toHaveBeenCalledOnce();
    expect(JSON.stringify(result.trace)).not.toContain('이전에 나눴던');
    expect(JSON.stringify(result.trace)).not.toContain('private canonical Memory payload');
  });

  it('denies a different Character grant before reading publication or building the request', async () => {
    const request = fixtureWithGrantedMemory('yeoul');
    await expect(prepareFourCharacterDynamicContextForTurnV1(request))
      .rejects.toMatchObject({ code: 'MEMORY_GRANT_SCOPE_MISMATCH' });
    expect(request.memoryAuthorityPort.readGrantedMemories).toHaveBeenCalledOnce();
    expect(request.publication.readPublishedSource).not.toHaveBeenCalled();
    expect(request.otherSourceAdmission.admit).not.toHaveBeenCalled();
    expect(request.buildExactRequest).not.toHaveBeenCalled();
    expect(request.adapter.countExactRequest).not.toHaveBeenCalled();
  });

  it('holds unsupported Character and malformed publication pins before any private source reads', async () => {
    for (const variant of ['unsupported-character', 'missing-version', 'bad-source-port']) {
      const request = fixtureWithGrantedMemory();
      const invalid = variant === 'unsupported-character'
        ? { ...request, characterId: 'seyeon' }
        : variant === 'missing-version'
          ? { ...request, publishedSourcePin: {
            ...request.publishedSourcePin, contentVersion: '',
          } }
          : { ...request,
            otherSourceAdmission: null as unknown as typeof request.otherSourceAdmission };
      await expect(prepareFourCharacterDynamicContextForTurnV1(invalid))
        .rejects.toMatchObject({
          code: 'PUBLISHED_CHARACTER_CONTEXT_SOURCE_HELD',
        });
      expect(request.memoryAuthorityPort.readGrantedMemories).not.toHaveBeenCalled();
      expect(request.nonMemoryAuthorityPort.readRecentMessages).not.toHaveBeenCalled();
      expect(request.nonMemoryAuthorityPort.readGrantedLifeFacts).not.toHaveBeenCalled();
      expect(request.relationshipAuthorityPort.readCurrentRelationship).not.toHaveBeenCalled();
      expect(request.publication.readPublishedSource).not.toHaveBeenCalled();
      expect(request.otherSourceAdmission.admit).not.toHaveBeenCalled();
      expect(request.buildExactRequest).not.toHaveBeenCalled();
      expect(request.adapter.countExactRequest).not.toHaveBeenCalled();
    }
  });

  it('rejects entitlement denial before any publication/Memory source read or request count', async () => {
    const input = fixture();
    await expect(prepareFourCharacterDynamicContextForTurnV1({
      ...input,
      capabilityGateInput: {
        ...input.capabilityGateInput,
        entitlementAllowed: false,
      },
    })).rejects.toMatchObject({ name: 'CharacterWorkingMemoryRetrievalGateErrorV1' });
    expect(input.memoryAuthorityPort.readGrantedMemories).not.toHaveBeenCalled();
    expect(input.publication.readPublishedSource).not.toHaveBeenCalled();
    expect(input.otherSourceAdmission.admit).not.toHaveBeenCalled();
    expect(input.adapter.countExactRequest).not.toHaveBeenCalled();
    expect(input.buildExactRequest).not.toHaveBeenCalled();
  });

  it('rejects a foreign publication or missing policy admission before request assembly', async () => {
    const foreign = fixture();
    const badPublication = vi.fn(async () => ({
      status: 'published' as const,
      characterId: 'yeoul' as const,
      releaseId: 'release-pinned',
      bundleId: 'bundle-pinned',
      contentVersion: 'version-pinned',
      sourceDigest: artifactHash,
      bibleSourceRef: 'docs/character/bible',
      runtimeSourceRef: 'docs/character/runtime',
      assetManifestHash: 'sha256:v1:' + 'b'.repeat(64),
      cueSchemaVersion: 'fixture-cues',
      canonicalContext: 'Unapproved data',
    }));
    await expect(prepareFourCharacterDynamicContextForTurnV1({
      ...foreign,
      publication: { readPublishedSource: badPublication },
    })).rejects.toMatchObject({ code: 'PUBLISHED_CHARACTER_CONTEXT_SOURCE_HELD' });
    expect(foreign.buildExactRequest).not.toHaveBeenCalled();
    expect(foreign.adapter.countExactRequest).not.toHaveBeenCalled();

    const policyDenied = fixture();
    await expect(prepareFourCharacterDynamicContextForTurnV1({
      ...policyDenied,
      otherSourceAdmission: { admit: () => false },
    })).rejects.toMatchObject({ code: 'SOURCE_ADMISSION_DENIED' });
    expect(policyDenied.publication.readPublishedSource).toHaveBeenCalledOnce();
    expect(policyDenied.buildExactRequest).not.toHaveBeenCalled();
    expect(policyDenied.adapter.countExactRequest).not.toHaveBeenCalled();
  });
});
