import { describe, expect, it, vi } from 'vitest';

import {
  prepareCharacterDynamicContextForTurnV1,
  type PrepareCharacterDynamicContextForTurnInputV1,
} from '../apps/api/src/character-dynamic-context-for-turn-v1.js';
import type { CharacterContextSegmentV1 } from '../packages/domain/src/character-dynamic-context-composer-v1.js';

type SyntheticRequest = Readonly<{
  output: number;
  segments: readonly CharacterContextSegmentV1[];
}>;

function input(): PrepareCharacterDynamicContextForTurnInputV1<SyntheticRequest> {
  return {
    resolvedSubjectId: 'subject-a',
    characterId: 'seyeon',
    threadBinding: { threadId: 'thread-a', participantCharacterIds: ['seyeon'] },
    currentUserMessageRef: 'user-message-a',
    expectedRelationshipRevision: null,
    recentMessageLimit: 4,
    relationshipEventLimit: 2,
    now: '2026-11-07T00:00:00.000Z',
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
    memoryAuthorityPort: {
      readGrantedMemories: vi.fn(async () => [{
        memoryItemId: 'memory-a',
        memoryType: 'synthetic_recall',
        schemaVersion: 'fixture-v1',
        content: { text: '퇴사 고민' },
        createdByCharacterId: 'seyeon',
        createdAt: '2026-10-01T00:00:00.000Z',
        grantId: 'memory-grant-a',
        granteeCharacterId: 'seyeon',
        grantReason: 'user_choice' as const,
        grantedAt: '2026-10-01T00:01:00.000Z',
        sourceKind: 'user_approved' as const,
        sourceTurnId: 'turn-old',
        sourceMessageId: 'message-old',
        sourceMergeActionId: null,
      }]),
    },
    nonMemoryAuthorityPort: {
      readGrantedLifeFacts: vi.fn(async () => []),
      readRelationshipEvents: vi.fn(async () => []),
      readRecentMessages: vi.fn(async () => [{
        messageId: 'user-message-a',
        sequenceNo: 1,
        senderType: 'user' as const,
        characterId: null,
        text: '지난번 퇴사 고민 기억하세요?',
        createdAt: '2026-11-07T00:00:00.000Z',
      }]),
    },
    relationshipAuthorityPort: { readCurrentRelationship: vi.fn(async () => []) },
    projectors: [{
      recordKind: 'memory',
      recordType: 'synthetic_recall',
      schemaVersion: 'fixture-v1',
      projectorVersion: 'fixture-projector-v1',
      project: () => ({
        summary: '지난번 퇴사 고민을 이야기했습니다.',
        claimKind: 'character_interpretation' as const,
        relevance: 0.9,
        salience: 0.9,
      }),
    }],
    systemSafety: { sourceRef: 'policy:approved', text: 'Approved safety constraints.' },
    characterCore: { sourceRef: 'character:seyeon:approved', text: 'Approved persona.' },
    profile: {
      schemaVersion: 'model-token-budget-profile-v1',
      profileId: 'fixture-profile',
      policyVersion: 'fixture-policy',
      providerKey: 'synthetic',
      modelKey: 'fixture-model',
      pricingVersion: 'fixture-price',
      contextWindowTokens: 300,
      maximumInputTokens: 150,
      maximumOutputTokens: 50,
      reservedHeadroomTokens: 10,
      maximumSerializedRequestBytes: 10000,
      tokenCounter: {
        adapterId: 'fixture-counter',
        adapterVersion: 'v1',
        supportedRequestFormat: 'fixture-json-v1',
        inputBoundSemantics: 'certified_upper_bound_includes_reserved_headroom',
      },
    },
    adapter: {
      adapterId: 'fixture-counter',
      adapterVersion: 'v1',
      providerKey: 'synthetic',
      modelKey: 'fixture-model',
      supportedRequestFormat: 'fixture-json-v1',
      reservedHeadroomTokens: 10,
      inputBoundSemantics: 'certified_upper_bound_includes_reserved_headroom',
      countExactRequest: vi.fn(({ serializedRequestBody }) => {
        const request = JSON.parse(serializedRequestBody) as SyntheticRequest;
        return request.segments.length * 20 + 10;
      }),
    },
    buildExactRequest: vi.fn((segments) => {
      const request: SyntheticRequest = { output: 50, segments };
      return {
        request,
        requestFormat: 'fixture-json-v1',
        serializedRequestBody: JSON.stringify(request),
        enforcedOutputTokenLimit: 50,
      };
    }),
  };
}

describe('Character dynamic context server offline orchestration v1', () => {
  it('uses the same authorized thread snapshot for retrieval and exact-request assembly', async () => {
    const fixture = input();
    const result = await prepareCharacterDynamicContextForTurnV1(fixture);
    expect(result.executionMode).toBe('offline_preflight_only');
    expect(result.trace.includedSourceRefs).toEqual([
      'policy:approved',
      'character:seyeon:approved',
      'message:user-message-a',
      'memory:memory-a:grant:memory-grant-a',
    ]);
    expect(fixture.memoryAuthorityPort.readGrantedMemories).toHaveBeenCalledOnce();
    expect(fixture.buildExactRequest).toHaveBeenCalledOnce();
    expect(result.exactRequest.serializedRequestBody).toContain('지난번 퇴사 고민');
    expect(JSON.stringify(result.trace)).not.toContain('지난번 퇴사 고민');
  });

  it('rejects failed entitlement before any source read, count, or exact-request build', async () => {
    const fixture = input();
    const denied: PrepareCharacterDynamicContextForTurnInputV1<SyntheticRequest> = {
      ...fixture,
      capabilityGateInput: { ...fixture.capabilityGateInput, entitlementAllowed: false },
    };
    await expect(prepareCharacterDynamicContextForTurnV1(denied)).rejects.toMatchObject({
      name: 'CharacterWorkingMemoryRetrievalGateErrorV1',
    });
    expect(fixture.memoryAuthorityPort.readGrantedMemories).not.toHaveBeenCalled();
    expect(fixture.nonMemoryAuthorityPort.readRecentMessages).not.toHaveBeenCalled();
    expect(fixture.adapter.countExactRequest).not.toHaveBeenCalled();
    expect(fixture.buildExactRequest).not.toHaveBeenCalled();
  });
});
