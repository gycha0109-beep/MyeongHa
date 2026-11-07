import { describe, expect, it, vi } from 'vitest';

import {
  buildCharacterWorkingMemoryProjectionV1,
  type CharacterWorkingMemoryRecordProjectorV1,
} from '../packages/domain/src/character-working-memory-projection-v1.js';
import {
  retrieveCharacterWorkingMemoryV1,
} from '../packages/domain/src/character-memory-retrieval-v1.js';
import {
  composeCharacterDynamicContextV1,
  type CharacterDynamicContextComposerInputV1,
  type CharacterContextSegmentV1,
} from '../packages/domain/src/character-dynamic-context-composer-v1.js';
import type {
  ModelTokenBudgetProfileV1,
  ModelTokenCountAdapterV1,
} from '../packages/domain/src/model-token-budget-profile-v1.js';

type SyntheticRequest = Readonly<{
  output: number;
  segments: readonly CharacterContextSegmentV1[];
}>;

const scope = Object.freeze({
  subjectId: 'subject-a',
  characterId: 'seyeon',
  threadId: 'thread-a',
});

function contextAndRetrieval() {
  const projector: CharacterWorkingMemoryRecordProjectorV1 = {
    recordKind: 'memory',
    recordType: 'synthetic_recall',
    schemaVersion: 'test-v1',
    projectorVersion: 'fixture-projector-v1',
    project: () => ({
      summary: '지난번 퇴사 고민을 나누었습니다.',
      claimKind: 'character_interpretation' as const,
      relevance: 0.8,
      salience: 0.9,
    }),
  };
  const projection = buildCharacterWorkingMemoryProjectionV1({
    scope: {
      ...scope,
      relationshipRevision: null,
      authorizedThreadCharacterIds: ['seyeon'],
    },
    currentUserMessageRef: 'current-user',
    lifeFacts: [],
    memories: [{
      memoryItemId: 'memory-a',
      memoryType: 'synthetic_recall',
      schemaVersion: 'test-v1',
      content: { value: 'fixture' },
      createdByCharacterId: 'seyeon',
      createdAt: '2026-11-01T00:00:00.000Z',
      grantId: 'grant-a',
      granteeCharacterId: 'seyeon',
      grantReason: 'user_choice',
      grantedAt: '2026-11-01T00:01:00.000Z',
      sourceKind: 'user_approved',
      sourceTurnId: 'turn-old',
      sourceMessageId: 'message-old',
      sourceMergeActionId: null,
    }],
    relationship: null,
    relationshipEvents: [],
    recentMessages: [{
      messageId: 'message-old-1',
      sequenceNo: 1,
      senderType: 'user',
      characterId: null,
      text: '지난 주 일을 이야기했어요.',
      createdAt: '2026-11-01T00:00:00.000Z',
    }, {
      messageId: 'message-recent',
      sequenceNo: 2,
      senderType: 'assistant',
      characterId: 'seyeon',
      text: '그 이야기를 계속해 봐요.',
      createdAt: '2026-11-02T00:00:00.000Z',
    }, {
      messageId: 'current-user',
      sequenceNo: 3,
      senderType: 'user',
      characterId: null,
      text: '퇴사 고민에 대해 기억하세요?',
      createdAt: '2026-11-07T00:00:00.000Z',
    }],
    projectors: [projector],
  });
  return {
    context: projection,
    retrieval: retrieveCharacterWorkingMemoryV1({
      projection,
      expectedScope: scope,
      now: '2026-11-07T00:00:00.000Z',
      limit: 5,
    }),
  };
}

function syntheticProfile(maximumInputTokens = 220): ModelTokenBudgetProfileV1 {
  return {
    schemaVersion: 'model-token-budget-profile-v1',
    profileId: 'offline-fixture-profile',
    policyVersion: 'offline-v1',
    providerKey: 'synthetic',
    modelKey: 'synthetic-only',
    pricingVersion: 'synthetic-price-v1',
    contextWindowTokens: 500,
    maximumInputTokens,
    maximumOutputTokens: 120,
    reservedHeadroomTokens: 20,
    maximumSerializedRequestBytes: 50000,
    tokenCounter: {
      adapterId: 'synthetic-exact',
      adapterVersion: 'v1',
      supportedRequestFormat: 'synthetic-json-v1',
      inputBoundSemantics: 'certified_upper_bound_includes_reserved_headroom',
    },
  };
}

function syntheticAdapter(): ModelTokenCountAdapterV1<SyntheticRequest> {
  return {
    adapterId: 'synthetic-exact',
    adapterVersion: 'v1',
    providerKey: 'synthetic',
    modelKey: 'synthetic-only',
    supportedRequestFormat: 'synthetic-json-v1',
    reservedHeadroomTokens: 20,
    inputBoundSemantics: 'certified_upper_bound_includes_reserved_headroom',
    countExactRequest: vi.fn((input) => {
      const parsed = JSON.parse(input.serializedRequestBody) as SyntheticRequest;
      expect(input.serializedRequestBodyBytes).toBe(
        new TextEncoder().encode(input.serializedRequestBody).byteLength,
      );
      return parsed.segments.length * 30 + 20;
    }),
  };
}

function input(maximumInputTokens = 220): CharacterDynamicContextComposerInputV1<SyntheticRequest> {
  return {
    expectedScope: scope,
    ...contextAndRetrieval(),
    systemSafety: { sourceRef: 'policy:approved', text: 'Do not invent private facts.' },
    characterCore: { sourceRef: 'character:seyeon:core', text: 'Canonical Character identity.' },
    bibleCore: [{ sourceRef: 'bible:approved-core', text: 'Approved character canon.' }],
    unresolvedCausalEvents: [{
      sourceRef: 'event:unresolved-a',
      text: 'Verified unresolved event.',
    }],
    resolvedLowSalienceEvents: [{
      sourceRef: 'event:resolved-a',
      text: 'Already resolved event.',
    }],
    redundantBibleExamples: [{
      sourceRef: 'bible:example-a',
      text: 'Redundant illustration.',
    }],
    trivia: [{
      sourceRef: 'trivia:a',
      text: 'Low-value detail.',
    }],
    profile: syntheticProfile(maximumInputTokens),
    adapter: syntheticAdapter(),
    buildExactRequest: (segments) => {
      const request: SyntheticRequest = { output: 120, segments };
      return {
        request,
        requestFormat: 'synthetic-json-v1',
        serializedRequestBody: JSON.stringify(request),
        enforcedOutputTokenLimit: 120,
      };
    },
  };
}

describe('Character dynamic context composer offline v1', () => {
  it('keeps safety, Character, current turn, latest dialogue, Bible core, and unresolved events under pressure', async () => {
    const result = await composeCharacterDynamicContextV1(input(220));
    const included = result.trace.includedSourceRefs;
    expect(included).toEqual([
      'policy:approved',
      'character:seyeon:core',
      'bible:approved-core',
      'event:unresolved-a',
      'message:message-recent',
      'message:current-user',
    ]);
    expect(result.trace.dropped.map((entry) => entry.layer)).toEqual([
      'trivia',
      'bible_example',
      'resolved_low_salience_event',
      'older_dialogue',
      'retrieved_memory',
    ]);
    expect(result.budgetReceipt.certifiedInputTokenUpperBound).toBe(200);
    expect(result.executionMode).toBe('offline_preflight_only');
  });

  it('includes selected memory only with its original record and grant source reference', async () => {
    const result = await composeCharacterDynamicContextV1(input(400));
    expect(result.trace.dropped).toEqual([]);
    expect(result.trace.includedSourceRefs).toContain('memory:memory-a:grant:grant-a');
    expect(result.segments.find((item) => item.layer === 'retrieved_memory')?.text)
      .toBe('지난번 퇴사 고민을 나누었습니다.');
    expect(result.exactRequest.serializedRequestBodyBytes).toBe(
      new TextEncoder().encode(result.exactRequest.serializedRequestBody).byteLength,
    );
  });

  it('has deterministic decisions and a redacted trace with no private content', async () => {
    const first = await composeCharacterDynamicContextV1(input(220));
    const second = await composeCharacterDynamicContextV1(input(220));
    expect(first.trace).toEqual(second.trace);
    expect(JSON.stringify(first.trace)).not.toContain('지난번 퇴사');
    expect(JSON.stringify(first.trace)).not.toContain('Do not invent private facts');
    expect(JSON.stringify(first.trace)).not.toContain('Canonical Character identity');
  });

  it('rejects a cross-Subject retrieval before counting or request building', async () => {
    const fixture = input();
    const countExactRequest = vi.fn(() => 20);
    const buildExactRequest = vi.fn(fixture.buildExactRequest);
    await expect(composeCharacterDynamicContextV1({
      ...fixture,
      expectedScope: { ...scope, subjectId: 'subject-b' },
      adapter: { ...fixture.adapter, countExactRequest },
      buildExactRequest,
    })).rejects.toMatchObject({
      name: 'CharacterDynamicContextComposerErrorV1',
      code: 'SCOPE_MISMATCH',
    });
    expect(countExactRequest).not.toHaveBeenCalled();
    expect(buildExactRequest).not.toHaveBeenCalled();
  });

  it('never drops a protected source when the mandatory request exceeds budget', async () => {
    await expect(composeCharacterDynamicContextV1(input(150))).rejects.toMatchObject({
      name: 'ModelTokenBudgetErrorV1',
      code: 'INPUT_BUDGET_EXCEEDED',
    });
  });

  it('fails closed for an unavailable exact count instead of using a length heuristic', async () => {
    const fixture = input();
    await expect(composeCharacterDynamicContextV1({
      ...fixture,
      adapter: { ...fixture.adapter, countExactRequest: () => null },
    })).rejects.toMatchObject({
      name: 'ModelTokenBudgetErrorV1',
      code: 'TOKEN_COUNT_UNAVAILABLE',
    });
  });

  it('rejects duplicate source references before assembling a request', async () => {
    const fixture = input();
    await expect(composeCharacterDynamicContextV1({
      ...fixture,
      trivia: [{ sourceRef: 'policy:approved', text: 'should be rejected' }],
    })).rejects.toMatchObject({
      name: 'CharacterDynamicContextComposerErrorV1',
      code: 'DUPLICATE_SOURCE',
    });
  });
});
