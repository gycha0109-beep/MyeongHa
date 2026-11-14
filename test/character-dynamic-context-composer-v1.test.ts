import { describe, expect, it, vi } from 'vitest';
import {
  evaluateCharacterMemoryContextOfflineV1,
  type CharacterMemoryContextOfflineEvalCaseV1,
} from '../packages/domain/src/character-memory-context-offline-evaluation-v1.js';
import {
  evaluateCharacterMemoryMultiSessionOfflineV1,
} from '../packages/domain/src/character-memory-multi-session-offline-evaluation-v1.js';

import {
  buildCharacterWorkingMemoryProjectionV1,
  type CharacterWorkingMemoryRecordProjectorV1,
} from '../packages/domain/src/character-working-memory-projection-v1.js';
import {
  countCharacterMemoryQueryTokensV1,
  retrieveCharacterWorkingMemoryV1,
} from '../packages/domain/src/character-memory-retrieval-v1.js';
import {
  composeCharacterDynamicContextV1,
  type CharacterDynamicContextComposerInputV1,
  type CharacterContextSegmentV1,
  type CharacterContextSourceAdmissionPortV1,
} from '../packages/domain/src/character-dynamic-context-composer-v1.js';
import type {
  ModelTokenBudgetProfileV1,
  ModelTokenCountAdapterV1,
} from '../packages/domain/src/model-token-budget-profile-v1.js';

type SyntheticRequest = Readonly<{
  output: number;
  segments: readonly CharacterContextSegmentV1[];
}>;

const inspectSyntheticRequest: CharacterMemoryContextOfflineEvalCaseV1<SyntheticRequest>['inspectSerializedRequestSegments'] =
  ({ requestFormat, serializedRequestBody }) => {
    if (requestFormat !== 'synthetic-json-v1') return null;
    const value: unknown = JSON.parse(serializedRequestBody);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).segments : null;
  };

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
      senderType: 'character',
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
    contextWindowTokens: 600,
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

function input(maximumInputTokens = 280): CharacterDynamicContextComposerInputV1<SyntheticRequest> {
  const approved = [
    { layer: 'system_safety_product', sourceRef: 'policy:approved', text: 'Do not invent private facts.' },
    { layer: 'character_core', sourceRef: 'character:seyeon:core', text: 'Canonical Character identity.' },
    { layer: 'response_task', sourceRef: 'task:approved-reply', text: 'Answer only the current user turn.' },
    { layer: 'bible_core', sourceRef: 'bible:approved-core', text: 'Approved character canon.' },
    { layer: 'unresolved_causal_event', sourceRef: 'event:unresolved-a', text: 'Verified unresolved event.' },
    { layer: 'resolved_low_salience_event', sourceRef: 'event:resolved-a', text: 'Already resolved event.' },
    { layer: 'bible_example', sourceRef: 'bible:example-a', text: 'Redundant illustration.' },
    { layer: 'trivia', sourceRef: 'trivia:a', text: 'Low-value detail.' },
  ] satisfies CharacterContextSegmentV1[];
  return {
    expectedScope: scope,
    ...contextAndRetrieval(),
    systemSafety: { sourceRef: 'policy:approved', text: 'Do not invent private facts.' },
    characterCore: { sourceRef: 'character:seyeon:core', text: 'Canonical Character identity.' },
    responseTask: { sourceRef: 'task:approved-reply', text: 'Answer only the current user turn.' },
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
    sourceAdmission: {
      admit: vi.fn(({ scope: selectedScope, segment }) =>
        selectedScope.subjectId === scope.subjectId &&
        selectedScope.characterId === scope.characterId &&
        selectedScope.threadId === scope.threadId &&
        approved.some((source) =>
          source.layer === segment.layer &&
          source.sourceRef === segment.sourceRef &&
          source.text === segment.text)),
    },
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


/**
 * Independent synthetic gold from the original, source-pinned fixture input.
 * Never derive this from the result being evaluated or its serialized body.
 */
function expectedProtectedFromFixture(
  fixture: CharacterDynamicContextComposerInputV1<SyntheticRequest>,
): readonly CharacterContextSegmentV1[] {
  const protectedGold: CharacterContextSegmentV1[] = [
    { layer: 'system_safety_product', ...fixture.systemSafety },
    { layer: 'character_core', ...fixture.characterCore },
  ];
  if (fixture.context.relationship !== null) {
    const relationship = fixture.context.relationship;
    protectedGold.push({
      layer: 'current_relationship',
      sourceRef: 'relationship:' + relationship.stateId + ':revision:' + relationship.revision,
      text: JSON.stringify(relationship),
    });
  }
  protectedGold.push(...(fixture.bibleCore ?? []).map(source =>
    ({ layer: 'bible_core' as const, ...source })));
  protectedGold.push(...(fixture.unresolvedCausalEvents ?? []).map(source =>
    ({ layer: 'unresolved_causal_event' as const, ...source })));
  const recent = [...fixture.context.recentConversation].sort(
    (a, b) => a.sequenceNo - b.sequenceNo,
  );
  const latest = recent.at(-1);
  if (latest !== undefined) {
    protectedGold.push({
      layer: 'immediate_dialogue',
      sourceRef: 'message:' + latest.messageId,
      text: JSON.stringify({
        role: latest.role,
        speakerCharacterId: latest.speakerCharacterId,
        createdAt: latest.createdAt,
        text: latest.text,
      }),
    });
  }
  const turn = fixture.context.currentUserMessage;
  protectedGold.push({
    layer: 'current_turn_state',
    sourceRef: 'turn:' + turn.messageId + ':state',
    text: JSON.stringify({
      messageId: turn.messageId,
      role: turn.role,
      sequenceNo: turn.sequenceNo,
      createdAt: turn.createdAt,
      relationshipRevision: fixture.context.scope.relationshipRevision,
    }),
  });
  protectedGold.push(...(fixture.integrityClaimDecisions ?? []).map(source =>
    ({ layer: 'integrity_claim_decision' as const, ...source })));
  if (fixture.disclosureDecision !== undefined) {
    protectedGold.push({ layer: 'disclosure_decision', ...fixture.disclosureDecision });
  }
  protectedGold.push(
    { layer: 'current_turn', sourceRef: 'message:' + turn.messageId, text: turn.text },
    { layer: 'response_task', ...fixture.responseTask },
  );
  return protectedGold;
}

/**
 * Trusted fixture source truth is captured from the ORIGINAL authorized
 * retrieval before test mutations. Never build gold from the item being
 * evaluated after changing its retrieval, context or final request.
 */
/**
 * Independent source truth for canonical earlier dialogue, captured from the
 * original server-pinned fixture before any response or request tampering.
 */
function expectedOriginalDialogueFromFixture(
  fixture: CharacterDynamicContextComposerInputV1<SyntheticRequest>,
) {
  return fixture.context.recentConversation.map(message => ({
    messageId: message.messageId,
    sequenceNo: message.sequenceNo,
    role: message.role,
    speakerCharacterId: message.speakerCharacterId,
    createdAt: message.createdAt,
    text: message.text,
  }));
}

/**
 * Event metadata gold comes from the original pinned read, not from the
 * composed segment, tracing metadata, or decoded provider request.
 */
function expectedOriginalRelationshipEventsFromFixture(
  fixture: CharacterDynamicContextComposerInputV1<SyntheticRequest>,
) {
  return fixture.context.relationshipEventIndex.events.map(event => ({
    eventType: event.eventType,
    eventSchemaVersion: event.eventSchemaVersion,
    stateRevisionAfter: event.stateRevisionAfter,
    policyVersion: event.policyVersion,
    appliedAt: event.appliedAt,
  }));
}

function expectedRetrievedMemoryClaimsFromFixture(
  fixture: CharacterDynamicContextComposerInputV1<SyntheticRequest>,
) {
  return fixture.retrieval.records.map(({ record, signals }) => ({
    sourceRef: record.sourceRef,
    recordKind: record.recordKind,
    claimKind: record.claimKind,
    sourceKind: record.sourceKind,
    effectiveAt: signals.effectiveAt,
    summary: record.summary,
    recordId: record.recordId,
    recordType: record.recordType,
    schemaVersion: record.schemaVersion,
    projectorVersion: record.projectorVersion,
    grantId: record.grantId,
    granteeCharacterId: record.granteeCharacterId,
    grantReason: record.grantReason,
    grantedAt: record.grantedAt,
    sourceTurnId: record.sourceTurnId,
    sourceMessageId: record.sourceMessageId,
    sourceMergeActionId: record.sourceMergeActionId,
    createdAt: record.createdAt,
    createdByCharacterId: record.createdByCharacterId,
    confirmedAt: record.confirmedAt,
    validFrom: record.validFrom,
    validTo: record.validTo,
  }));
}

describe('Character dynamic context composer offline v1', () => {
  it('keeps safety, Character, current turn, latest dialogue, Bible core, and unresolved events under pressure', async () => {
    const result = await composeCharacterDynamicContextV1(input(280));
    const included = result.trace.includedSourceRefs;
    expect(included).toEqual([
      'policy:approved',
      'character:seyeon:core',
      'bible:approved-core',
      'event:unresolved-a',
      'message:message-recent',
      'turn:current-user:state',
      'message:current-user',
      'task:approved-reply',
    ]);
    expect(result.trace.dropped.map((entry) => entry.layer)).toEqual([
      'trivia',
      'bible_example',
      'resolved_low_salience_event',
      'older_dialogue',
      'retrieved_memory',
    ]);
    expect(result.budgetReceipt.certifiedInputTokenUpperBound).toBe(260);
    expect(result.executionMode).toBe('offline_preflight_only');
  });

  it('rejects retrieval bound to another turn of the same thread before serialization or counting', async () => {
    const fixture = input(450);
    for (const field of ['messageId', 'sequenceNo', 'createdAt', 'text'] as const) {
      const poisoned = {
        messageId: 'another-user-message',
        sequenceNo: fixture.context.currentUserMessage.sequenceNo + 1,
        createdAt: '2026-11-08T00:00:00.000Z',
        text: '지난번에 다른 기록을 말했나요?',
      }[field];
      const buildExactRequest = vi.fn(fixture.buildExactRequest);
      const countExactRequest = vi.fn(fixture.adapter.countExactRequest);
      await expect(composeCharacterDynamicContextV1({
        ...fixture,
        retrieval: {
          ...fixture.retrieval,
          querySourceTurn: {
            ...fixture.retrieval.querySourceTurn,
            [field]: poisoned,
          },
        },
        buildExactRequest,
        adapter: { ...fixture.adapter, countExactRequest },
      })).rejects.toMatchObject({ code: 'INVALID_RETRIEVAL' });
      expect(buildExactRequest).not.toHaveBeenCalled();
      expect(countExactRequest).not.toHaveBeenCalled();
    }
  });

  it('rejects forged callback/search trace metadata before source admission and exact token counting', async () => {
    const fixture = input(450);
    const original = fixture.retrieval.records[0]!;
    const trace = fixture.retrieval.trace;
    // The original canonical '기억하세요?' question is now explicit recall.
    // Prevent a negative candidate from silently equaling valid source gold.
    expect(trace.explicitCallbackRequested).toBe(true);
    expect(trace.callbackFallbackUsed).toBe(false);
    const invalidRetrievals = [
      { ...fixture.retrieval,
        schemaVersion: 'invented-retrieval-v2' as unknown as typeof fixture.retrieval.schemaVersion },
      { ...fixture.retrieval,
        retrievalMode: 'semantic-graph' as unknown as typeof fixture.retrieval.retrievalMode },
      { ...fixture.retrieval,
        trace: { ...trace, queryTokenCount: 0 } },
      { ...fixture.retrieval,
        // The canonical User's polite recall question is now detected, and
        // false is an explicitly supported caller suppression. Exercise the
        // invalid runtime type instead; do not label a valid suppression bad.
        trace: { ...trace,
          explicitCallbackRequested: 'not-a-boolean' as unknown as boolean } },
      { ...fixture.retrieval,
        trace: { ...trace, callbackFallbackUsed: true } },
      { ...fixture.retrieval,
        trace: { ...trace, candidateCount: 0 } },
      { ...fixture.retrieval,
        trace: { ...trace, matchedCandidateCount: 0 } },
      { ...fixture.retrieval,
        trace: { ...trace, unsupportedSchemaCount: -1 } },
      { ...fixture.retrieval,
        records: [{ ...original, signals: {
          ...original.signals, explicitCallbackMatch: !original.signals.explicitCallbackMatch,
        } }] },
      { ...fixture.retrieval,
        records: [{ ...original, signals: {
          ...original.signals, callbackFallbackUsed: !original.signals.callbackFallbackUsed,
        } }] },
      { ...fixture.retrieval,
        records: [{ ...original, signals: {
          ...original.signals, lexicalCoverage: 0,
        } }] },
    ];
    for (const retrieval of invalidRetrievals) {
      // Every negative case must actually differ from the valid fixture.
      // An unchanged suppression flag is not a forged retrieval result.
      expect(retrieval).not.toEqual(fixture.retrieval);
      const admit = vi.fn(fixture.sourceAdmission.admit);
      const buildExactRequest = vi.fn(fixture.buildExactRequest);
      const countExactRequest = vi.fn(fixture.adapter.countExactRequest);
      await expect(composeCharacterDynamicContextV1({
        ...fixture, retrieval,
        sourceAdmission: { admit }, buildExactRequest,
        adapter: { ...fixture.adapter, countExactRequest },
      })).rejects.toMatchObject({ code: 'INVALID_RETRIEVAL' });
      expect(admit).not.toHaveBeenCalled();
      expect(buildExactRequest).not.toHaveBeenCalled();
      expect(countExactRequest).not.toHaveBeenCalled();
    }
    expect((await composeCharacterDynamicContextV1(fixture)).executionMode)
      .toBe('offline_preflight_only');
  });

  it('does not accept a fabricated explicit callback absent from the canonical User text', async () => {
    const fixture = input(450);
    const ordinaryTurn = '오늘 점심으로 카레라이스를 먹었어요.';
    const admit = vi.fn(fixture.sourceAdmission.admit);
    const buildExactRequest = vi.fn(fixture.buildExactRequest);
    const countExactRequest = vi.fn(fixture.adapter.countExactRequest);
    await expect(composeCharacterDynamicContextV1({
      ...fixture,
      context: {
        ...fixture.context,
        currentUserMessage: {
          ...fixture.context.currentUserMessage, text: ordinaryTurn,
        },
      },
      retrieval: {
        ...fixture.retrieval,
        querySourceTurn: { ...fixture.retrieval.querySourceTurn, text: ordinaryTurn },
        trace: {
          ...fixture.retrieval.trace,
          queryTokenCount: countCharacterMemoryQueryTokensV1(ordinaryTurn),
          explicitCallbackRequested: true,
          callbackFallbackUsed: false,
        },
      },
      sourceAdmission: { admit }, buildExactRequest,
      adapter: { ...fixture.adapter, countExactRequest },
    })).rejects.toMatchObject({ code: 'INVALID_RETRIEVAL' });
    expect(admit).not.toHaveBeenCalled();
    expect(buildExactRequest).not.toHaveBeenCalled();
    expect(countExactRequest).not.toHaveBeenCalled();
  });

  it('rejects a retrieved Memory whose source timestamps changed after the canonical turn', async () => {
    const fixture = input(450);
    const original = fixture.retrieval.records[0]!;
    const postTurn = '2026-11-08T00:00:00.000Z';
    const invalidRecords = [
      { ...original.record, createdAt: postTurn },
      { ...original.record, grantedAt: postTurn },
      { ...original.record, createdAt: 'not-a-timestamp' },
    ];
    for (const record of invalidRecords) {
      const buildExactRequest = vi.fn(fixture.buildExactRequest);
      const countExactRequest = vi.fn(fixture.adapter.countExactRequest);
      await expect(composeCharacterDynamicContextV1({
        ...fixture,
        retrieval: {
          ...fixture.retrieval,
          records: [{ ...original, record }],
        },
        buildExactRequest,
        adapter: { ...fixture.adapter, countExactRequest },
      })).rejects.toMatchObject({ code: 'INVALID_RETRIEVAL' });
      expect(buildExactRequest).not.toHaveBeenCalled();
      expect(countExactRequest).not.toHaveBeenCalled();
    }
  });

  it('rejects a forged effective timestamp in retrieval before constructing a request', async () => {
    const fixture = input(450);
    const original = fixture.retrieval.records[0]!;
    const buildExactRequest = vi.fn(fixture.buildExactRequest);
    const countExactRequest = vi.fn(fixture.adapter.countExactRequest);
    await expect(composeCharacterDynamicContextV1({
      ...fixture,
      retrieval: {
        ...fixture.retrieval,
        records: [{
          ...original,
          signals: {
            ...original.signals,
            effectiveAt: '2026-11-06T00:00:00.000Z',
          },
        }],
      },
      buildExactRequest,
      adapter: { ...fixture.adapter, countExactRequest },
    })).rejects.toMatchObject({ code: 'INVALID_RETRIEVAL' });
    expect(buildExactRequest).not.toHaveBeenCalled();
    expect(countExactRequest).not.toHaveBeenCalled();
  });

  it('rejects an injected Life Fact whose validity window excludes the current User turn', async () => {
    const fixture = input(450);
    const original = fixture.retrieval.records[0]!;
    const factRef = 'life_fact:' + original.record.recordId +
      ':grant:' + original.record.grantId;
    const invalidWindows = [
      { validFrom: '2026-11-08T00:00:00.000Z', validTo: null },
      { validFrom: null, validTo: '2026-11-06T00:00:00.000Z' },
      { validFrom: 'not-a-date', validTo: null },
    ];
    for (const window of invalidWindows) {
      const buildExactRequest = vi.fn(fixture.buildExactRequest);
      const countExactRequest = vi.fn(fixture.adapter.countExactRequest);
      await expect(composeCharacterDynamicContextV1({
        ...fixture,
        retrieval: {
          ...fixture.retrieval,
          records: [{
            ...original,
            record: {
              ...original.record,
              recordKind: 'life_fact' as const,
              sourceRef: factRef,
              ...window,
            },
          }],
          trace: {
            ...fixture.retrieval.trace,
            selectedSourceRefs: [factRef],
          },
        },
        buildExactRequest,
        adapter: { ...fixture.adapter, countExactRequest },
      })).rejects.toMatchObject({ code: 'INVALID_RETRIEVAL' });
      expect(buildExactRequest).not.toHaveBeenCalled();
      expect(countExactRequest).not.toHaveBeenCalled();
    }
  });

  it('fails closed on forged Memory source kinds, claim categories or ranking metadata before admission', async () => {
    const fixture = input(450);
    const original = fixture.retrieval.records[0]!;
    const invalidRecords = [
      {
        ...original,
        record: { ...original.record, sourceKind: 'profile_edit' as const },
      },
      {
        ...original,
        record: {
          ...original.record,
          claimKind: 'fabricated_claim' as unknown as typeof original.record.claimKind,
        },
      },
      {
        ...original,
        record: {
          ...original.record,
          grantReason: 'fabricated_grant' as unknown as typeof original.record.grantReason,
        },
      },
      {
        ...original,
        record: { ...original.record, relevance: 1.2 },
        signals: { ...original.signals, relevance: 1.2 },
      },
      {
        ...original,
        signals: { ...original.signals, salience: original.signals.salience / 2 },
      },
      {
        ...original,
        signals: { ...original.signals, lexicalCoverage: Number.NaN },
      },
    ];
    for (const poisoned of invalidRecords) {
      const admit = vi.fn(fixture.sourceAdmission.admit);
      const buildExactRequest = vi.fn(fixture.buildExactRequest);
      const countExactRequest = vi.fn(fixture.adapter.countExactRequest);
      await expect(composeCharacterDynamicContextV1({
        ...fixture,
        retrieval: { ...fixture.retrieval, records: [poisoned] },
        sourceAdmission: { admit },
        buildExactRequest,
        adapter: { ...fixture.adapter, countExactRequest },
      })).rejects.toMatchObject({ code: 'INVALID_RETRIEVAL' });
      expect(admit).not.toHaveBeenCalled();
      expect(buildExactRequest).not.toHaveBeenCalled();
      expect(countExactRequest).not.toHaveBeenCalled();
    }
  });

  it('rejects a Life Fact relabeled as Character interpretation rather than a source-owned fact', async () => {
    const fixture = input(450);
    const original = fixture.retrieval.records[0]!;
    const factRef = 'life_fact:' + original.record.recordId +
      ':grant:' + original.record.grantId;
    const admit = vi.fn(fixture.sourceAdmission.admit);
    const buildExactRequest = vi.fn(fixture.buildExactRequest);
    await expect(composeCharacterDynamicContextV1({
      ...fixture,
      retrieval: {
        ...fixture.retrieval,
        records: [{
          ...original,
          record: {
            ...original.record,
            recordKind: 'life_fact' as const,
            claimKind: 'character_interpretation' as const,
            sourceKind: 'user_explicit' as const,
            sourceRef: factRef,
            confirmedAt: original.record.createdAt,
          },
        }],
        trace: {
          ...fixture.retrieval.trace,
          selectedSourceRefs: [factRef],
        },
      },
      sourceAdmission: { admit },
      buildExactRequest,
    })).rejects.toMatchObject({ code: 'INVALID_RETRIEVAL' });
    expect(admit).not.toHaveBeenCalled();
    expect(buildExactRequest).not.toHaveBeenCalled();
  });

  it('includes selected memory only with its original record and grant source reference', async () => {
    const result = await composeCharacterDynamicContextV1(input(450));
    expect(result.trace.dropped).toEqual([]);
    expect(result.trace.includedSourceRefs).toContain('memory:memory-a:grant:grant-a');
    const memoryText = result.segments.find(
      (item) => item.layer === 'retrieved_memory',
    )?.text;
    expect(memoryText).toBeDefined();
    expect(JSON.parse(memoryText!)).toEqual({
      recordKind: 'memory',
      claimKind: 'character_interpretation',
      sourceKind: 'user_approved',
      effectiveAt: '2026-11-01T00:00:00.000Z',
      summary: '지난번 퇴사 고민을 나누었습니다.',
    });
    expect(JSON.parse(result.exactRequest.serializedRequestBody).segments)
      .toContainEqual(expect.objectContaining({ text: memoryText }));
    expect(result.exactRequest.serializedRequestBodyBytes).toBe(
      new TextEncoder().encode(result.exactRequest.serializedRequestBody).byteLength,
    );
  });

  it('preserves authoritative speaker attribution and timestamps in recent dialogue', async () => {
    const result = await composeCharacterDynamicContextV1(input(450));
    const immediate = result.segments.find((item) => item.layer === 'immediate_dialogue');
    const older = result.segments.find((item) => item.layer === 'older_dialogue');
    expect(JSON.parse(immediate!.text)).toEqual({
      role: 'assistant',
      speakerCharacterId: 'seyeon',
      createdAt: '2026-11-02T00:00:00.000Z',
      text: '그 이야기를 계속해 봐요.',
    });
    expect(JSON.parse(older!.text)).toEqual({
      role: 'user',
      speakerCharacterId: null,
      createdAt: '2026-11-01T00:00:00.000Z',
      text: '지난 주 일을 이야기했어요.',
    });
    expect(JSON.parse(result.segments.find(
      (item) => item.layer === 'current_turn_state',
    )!.text)).toMatchObject({ role: 'user', messageId: 'current-user' });
  });

  it('rejects a tampered canonical dialogue chronology or speaker before source admission and counting', async () => {
    const fixture = input(450);
    const dialogue = fixture.context.recentConversation;
    const first = dialogue[0]!;
    const second = dialogue[1]!;
    const poisonedDialogues: readonly (typeof dialogue)[] = [
      dialogue.map(item => item.messageId === second.messageId
        ? { ...item, speakerCharacterId: 'baekheon' } : item),
      dialogue.map(item => item.messageId === first.messageId
        ? { ...item, createdAt: '2026-11-09T00:00:00.000Z' } : item),
      dialogue.map(item => item.messageId === second.messageId
        ? { ...item, sequenceNo: first.sequenceNo } : item),
      dialogue.map(item => item.messageId === first.messageId
        ? { ...item, messageId: fixture.context.currentUserMessage.messageId } : item),
      dialogue.map(item => item.messageId === second.messageId
        ? { ...item, createdAt: '2026-10-31T00:00:00.000Z' } : item),
      dialogue.map(item => item.messageId === first.messageId
        ? { ...item, speakerCharacterId: 'seyeon' } : item),
      [...dialogue].reverse(),
    ];
    for (const recentConversation of poisonedDialogues) {
      const admit = vi.fn(fixture.sourceAdmission.admit);
      const buildExactRequest = vi.fn(fixture.buildExactRequest);
      const countExactRequest = vi.fn(fixture.adapter.countExactRequest);
      await expect(composeCharacterDynamicContextV1({
        ...fixture,
        context: { ...fixture.context, recentConversation },
        sourceAdmission: { admit },
        buildExactRequest,
        adapter: { ...fixture.adapter, countExactRequest },
      })).rejects.toMatchObject({ code: 'INVALID_AUTHORITY' });
      expect(admit).not.toHaveBeenCalled();
      expect(buildExactRequest).not.toHaveBeenCalled();
      expect(countExactRequest).not.toHaveBeenCalled();
    }
  });

  it('retains equal-timestamp source dialogue when canonical sequence and speaker remain valid', async () => {
    const fixture = input(450);
    const recentConversation = fixture.context.recentConversation.map(message => ({
      ...message,
      createdAt: fixture.context.currentUserMessage.createdAt,
    }));
    const result = await composeCharacterDynamicContextV1({
      ...fixture,
      context: { ...fixture.context, recentConversation },
    });
    expect(result.segments.filter(segment =>
      segment.layer === 'older_dialogue' || segment.layer === 'immediate_dialogue'))
      .toHaveLength(recentConversation.length);
    expect(result.executionMode).toBe('offline_preflight_only');
  });

  it('denies unapproved Character or event source before request/count even when optional', async () => {
    const fixture = input(280);
    const buildExactRequest = vi.fn(fixture.buildExactRequest);
    const countExactRequest = vi.fn(fixture.adapter.countExactRequest);
    await expect(composeCharacterDynamicContextV1({
      ...fixture,
      trivia: [{ sourceRef: 'trivia:foreign-character', text: 'Unauthorized secret.' }],
      buildExactRequest,
      adapter: { ...fixture.adapter, countExactRequest },
    })).rejects.toMatchObject({
      name: 'CharacterDynamicContextComposerErrorV1',
      code: 'SOURCE_ADMISSION_DENIED',
    });
    expect(buildExactRequest).not.toHaveBeenCalled();
    expect(countExactRequest).not.toHaveBeenCalled();
  });

  it('rejects source-ref replay with modified text and never exposes it in errors', async () => {
    const fixture = input();
    const buildExactRequest = vi.fn(fixture.buildExactRequest);
    const secret = 'Not an approved canon statement';
    let caught: unknown;
    try {
      await composeCharacterDynamicContextV1({
        ...fixture,
        characterCore: { sourceRef: 'character:seyeon:core', text: secret },
        buildExactRequest,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      name: 'CharacterDynamicContextComposerErrorV1',
      code: 'SOURCE_ADMISSION_DENIED',
    });
    expect(String(caught)).not.toContain(secret);
    expect(buildExactRequest).not.toHaveBeenCalled();
  });

  it('fails closed on missing or throwing source admission', async () => {
    const fixture = input();
    const buildExactRequest = vi.fn(fixture.buildExactRequest);
    for (const sourceAdmission of [
      undefined,
      { admit: () => { throw new Error('Sensitive authority exception'); } },
    ]) {
      await expect(composeCharacterDynamicContextV1({
        ...fixture,
        sourceAdmission: sourceAdmission as CharacterDynamicContextComposerInputV1<SyntheticRequest>['sourceAdmission'],
        buildExactRequest,
      })).rejects.toMatchObject({
        name: 'CharacterDynamicContextComposerErrorV1',
        code: 'SOURCE_ADMISSION_DENIED',
      });
    }
    expect(buildExactRequest).not.toHaveBeenCalled();
  });

  it('keeps source-admitted Integrity and Disclosure decisions under pressure but drops repetition hints', async () => {
    const fixture = input(350);
    const protectedSources: readonly CharacterContextSegmentV1[] = [
      { layer: 'integrity_claim_decision', sourceRef: 'integrity:current-user:1',
        text: '{"claimKind":"USER_SELF_REPORT","result":"USER_ASSERTED","verifiedFactAllowed":false}' },
      { layer: 'disclosure_decision', sourceRef: 'disclosure:current-user',
        text: '{"result":"BOUNDARY","privateSourceContentIncluded":false}' },
      { layer: 'repetition_suppression_hint', sourceRef: 'repetition:approved-1',
        text: 'Avoid repeating an already used phrase.' },
    ];
    const sourceAdmission: CharacterContextSourceAdmissionPortV1 = {
      admit: async ({ scope, segment }: Parameters<CharacterContextSourceAdmissionPortV1['admit']>[0]) =>
        protectedSources.some(x => x.layer === segment.layer &&
          x.sourceRef === segment.sourceRef && x.text === segment.text) ||
        await fixture.sourceAdmission.admit({ scope, segment }),
    };
    const result = await composeCharacterDynamicContextV1({
      ...fixture,
      integrityClaimDecisions: protectedSources.slice(0, 1),
      disclosureDecision: protectedSources[1]!,
      repetitionSuppressionHints: protectedSources.slice(2),
      sourceAdmission,
    });
    expect(result.trace.includedSourceRefs).toEqual(expect.arrayContaining([
      'integrity:current-user:1', 'disclosure:current-user',
    ]));
    expect(result.trace.dropped).toContainEqual(expect.objectContaining({
      sourceRef: 'repetition:approved-1',
      layer: 'repetition_suppression_hint',
    }));
    expect(result.trace.certifiedInputTokenUpperBound).toBeLessThanOrEqual(350);
    expect(JSON.stringify(result.trace)).not.toContain('USER_ASSERTED');
    expect(JSON.stringify(result.trace)).not.toContain('BOUNDARY');
  });

  it('retains metadata-only relationship chronology without inventing event narratives', async () => {
    const fixture = input(450);
    const revision = 3;
    const context = {
      ...fixture.context,
      scope: { ...fixture.context.scope, relationshipRevision: revision },
      relationship: {
        stateId: 'rel-approved',
        characterId: 'seyeon',
        closeness: 1,
        trust: 1,
        friction: 0,
        relationshipStage: 'FAMILIAR',
        policyVersion: 'fixture-v1',
        revision,
        lastInteractionAt: null,
        updatedAt: '2026-11-05T00:00:00.000Z',
      },
      relationshipEventIndex: {
        exposure: 'metadata_only' as const,
        events: [{
          eventType: 'REPAIR_MARKER',
          eventSchemaVersion: 'fixture-v1',
          stateRevisionAfter: 2,
          policyVersion: 'fixture-v1',
          appliedAt: '2026-11-04T00:00:00.000Z',
        }],
      },
    };
    const retrieval = {
      ...fixture.retrieval,
      scope: { ...fixture.retrieval.scope, relationshipRevision: revision },
    };
    const result = await composeCharacterDynamicContextV1({
      ...fixture, context, retrieval,
    });
    const metadata = result.segments.find(s => s.layer === 'relationship_event_metadata');
    expect(metadata).toBeDefined();
    expect(metadata!.sourceRef).toBe('relationship-event:revision:2');
    expect(JSON.parse(metadata!.text)).toEqual({
      exposure: 'metadata_only_no_causal_evidence',
      eventType: 'REPAIR_MARKER',
      eventSchemaVersion: 'fixture-v1',
      stateRevisionAfter: 2,
      policyVersion: 'fixture-v1',
      appliedAt: '2026-11-04T00:00:00.000Z',
    });
    expect(JSON.stringify(result.trace)).not.toContain('REPAIR_MARKER');
    expect(result.budgetReceipt.certifiedInputTokenUpperBound).toBeLessThanOrEqual(450);
  });

  it('denies a later-dated Relationship snapshot before source admission and model request assembly', async () => {
    const fixture = input(450);
    const relation = {
      stateId: 'rel-approved',
      characterId: 'seyeon',
      closeness: 1, trust: 1, friction: 0,
      relationshipStage: 'FAMILIAR', policyVersion: 'fixture-v1',
      revision: 3,
      lastInteractionAt: '2026-11-04T00:00:00.000Z' as string | null,
      updatedAt: '2026-11-05T00:00:00.000Z',
    };
    const baseContext = {
      ...fixture.context,
      scope: { ...fixture.context.scope, relationshipRevision: 3 },
      relationship: relation,
      relationshipEventIndex: {
        exposure: 'metadata_only' as const,
        events: [],
      },
    };
    const retrieval = {
      ...fixture.retrieval,
      scope: { ...fixture.retrieval.scope, relationshipRevision: 3 },
    };
    const valid = await composeCharacterDynamicContextV1({
      ...fixture, context: baseContext, retrieval,
    });
    expect(valid.segments).toContainEqual(expect.objectContaining({
      layer: 'current_relationship',
      sourceRef: 'relationship:rel-approved:revision:3',
    }));

    const tamperedSnapshots = [
      { ...relation, updatedAt: '2026-11-08T00:00:00.000Z' },
      { ...relation, updatedAt: 'not-a-real-date' },
      { ...relation, lastInteractionAt: '2026-11-08T00:00:00.000Z' },
      { ...relation, lastInteractionAt: '2026-11-06T00:00:00.000Z' },
      { ...relation, lastInteractionAt: 'not-a-real-date' },
    ];
    for (const snapshot of tamperedSnapshots) {
      // A new invocation counter must not inherit the preceding successful
      // baseline's 8 source-admission calls from its already-mocked port.
      // This permissive stub detects any unwanted admission before denial.
      const admit = vi.fn(() => true);
      const buildExactRequest = vi.fn(fixture.buildExactRequest);
      // Do not wrap an already-used vi.fn: Vitest carries the positive
      // baseline's mock call history into the new negative assertion.
      // This independent fail-fast counter must never run for invalid gold.
      const countExactRequest = vi.fn((): never => {
        throw new Error('Invalid Relationship snapshot reached exact token counting');
      });
      await expect(composeCharacterDynamicContextV1({
        ...fixture,
        context: { ...baseContext, relationship: snapshot },
        retrieval,
        sourceAdmission: { admit },
        buildExactRequest,
        adapter: { ...fixture.adapter, countExactRequest },
      })).rejects.toMatchObject({ code: 'INVALID_AUTHORITY' });
      expect(admit).not.toHaveBeenCalled();
      expect(buildExactRequest).not.toHaveBeenCalled();
      expect(countExactRequest).not.toHaveBeenCalled();
    }

    // A stored interaction at the exact source-update time is not future.
    const matchingTimes = await composeCharacterDynamicContextV1({
      ...fixture, retrieval,
      context: {
        ...baseContext,
        relationship: {
          ...relation,
          lastInteractionAt: relation.updatedAt,
        },
      },
    });
    expect(matchingTimes.executionMode).toBe('offline_preflight_only');
  });

  it('grades original relationship event metadata without claiming a causal narrative', async () => {
    const fixture = input(450);
    const originalEvent = {
      eventType: 'REPAIR_MARKER',
      eventSchemaVersion: 'fixture-v1',
      stateRevisionAfter: 2,
      policyVersion: 'fixture-v1',
      appliedAt: '2026-11-04T00:00:00.000Z',
    };
    const relationFixture = {
      ...fixture,
      context: {
        ...fixture.context,
        scope: { ...fixture.context.scope, relationshipRevision: 3 },
        relationship: {
          stateId: 'rel-approved', characterId: 'seyeon',
          closeness: 1, trust: 1, friction: 0,
          relationshipStage: 'FAMILIAR', policyVersion: 'fixture-v1',
          revision: 3, lastInteractionAt: null,
          updatedAt: '2026-11-05T00:00:00.000Z',
        },
        relationshipEventIndex: {
          exposure: 'metadata_only' as const, events: [originalEvent],
        },
      },
      retrieval: {
        ...fixture.retrieval,
        scope: { ...fixture.retrieval.scope, relationshipRevision: 3 },
      },
    };
    const context = await composeCharacterDynamicContextV1(relationFixture);
    const originalEventGold =
      expectedOriginalRelationshipEventsFromFixture(relationFixture);
    const baseline = {
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedProtectedSegments: expectedProtectedFromFixture(relationFixture),
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(relationFixture),
      expectedOriginalRelationshipEvents: originalEventGold,
      expectedRetrievedMemoryClaims:
        expectedRetrievedMemoryClaimsFromFixture(relationFixture),
      retrieval: relationFixture.retrieval,
      expectedRelevantMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      expectedIncludedMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      forbiddenSourceRefs: [],
      forbiddenTraceFragments: ['REPAIR_MARKER'],
    };
    const good = evaluateCharacterMemoryContextOfflineV1([{
      ...baseline, caseId: 'real-relationship-metadata', context,
    }]);
    expect(good.passedCount).toBe(1);
    expect(good.cases[0]?.checks.originalRelationshipMetadataPreserved).toBe(true);

    const changed = context.segments.map(segment =>
      segment.layer === 'relationship_event_metadata'
        ? { ...segment, text: segment.text.replace('REPAIR_MARKER', 'FORGED_MARKER') }
        : segment);
    const body = JSON.stringify({ output: 120, segments: changed });
    const tampered = evaluateCharacterMemoryContextOfflineV1([{
      ...baseline, caseId: 'fabricated-relationship-metadata',
      context: {
        ...context,
        segments: changed,
        exactRequest: {
          ...context.exactRequest,
          serializedRequestBody: body,
          serializedRequestBodyBytes: new TextEncoder().encode(body).byteLength,
        },
      },
    }]);
    expect(tampered.failedCount).toBe(1);
    expect(tampered.cases[0]?.checks.serializedRequestSegmentsMatchContext).toBe(true);
    expect(tampered.cases[0]?.checks.originalRelationshipMetadataPreserved).toBe(false);
    expect(JSON.stringify(tampered)).not.toContain('FORGED_MARKER');

    expect(() => evaluateCharacterMemoryContextOfflineV1([{
      ...baseline, caseId: 'unapproved-relationship-event-gold',
      expectedOriginalRelationshipEvents: [{
        ...originalEvent, appliedAt: '2026-11-09T00:00:00.000Z',
      }],
      context,
    }])).toThrow('original relationship event gold');
  });

  it('refuses future relationship event metadata before request serialization', async () => {
    const fixture = input(450);
    const buildExactRequest = vi.fn(fixture.buildExactRequest);
    await expect(composeCharacterDynamicContextV1({
      ...fixture,
      context: {
        ...fixture.context,
        relationshipEventIndex: {
          exposure: 'metadata_only',
          events: [{
            eventType: 'FORGED_EVENT',
            eventSchemaVersion: 'fixture-v1',
            stateRevisionAfter: 1,
            policyVersion: 'fixture-v1',
            appliedAt: '2026-11-10T00:00:00.000Z',
          }],
        },
      },
      buildExactRequest,
    })).rejects.toMatchObject({ code: 'INVALID_AUTHORITY' });
    expect(buildExactRequest).not.toHaveBeenCalled();
  });

  it('rejects unadmitted decision content before request build/count', async () => {
    const fixture = input();
    const buildExactRequest = vi.fn(fixture.buildExactRequest);
    const countExactRequest = vi.fn(fixture.adapter.countExactRequest);
    await expect(composeCharacterDynamicContextV1({
      ...fixture,
      disclosureDecision: {
        sourceRef: 'disclosure:current-user',
        text: '{"result":"ALLOW","privateSourceContentIncluded":true}',
      },
      buildExactRequest,
      adapter: { ...fixture.adapter, countExactRequest },
    })).rejects.toMatchObject({ code: 'SOURCE_ADMISSION_DENIED' });
    expect(buildExactRequest).not.toHaveBeenCalled();
    expect(countExactRequest).not.toHaveBeenCalled();
  });

  it('rejects oversized decision or repetition lists without construction', async () => {
    const fixture = input();
    const buildExactRequest = vi.fn(fixture.buildExactRequest);
    await expect(composeCharacterDynamicContextV1({
      ...fixture,
      integrityClaimDecisions: Array.from({ length: 9 }, (_, i) =>
        ({ sourceRef: 'integrity:current-user:' + i, text: 'bounded' })),
      buildExactRequest,
    })).rejects.toMatchObject({ code: 'INVALID_SEGMENT' });
    expect(buildExactRequest).not.toHaveBeenCalled();
  });

  it('has deterministic decisions and a redacted trace with no private content', async () => {
    const first = await composeCharacterDynamicContextV1(input(280));
    const second = await composeCharacterDynamicContextV1(input(280));
    expect(first.trace).toEqual(second.trace);
    expect(JSON.stringify(first.trace)).not.toContain('지난번 퇴사');
    expect(JSON.stringify(first.trace)).not.toContain('character_interpretation');
    expect(JSON.stringify(first.trace)).not.toContain('Do not invent private facts');
    expect(JSON.stringify(first.trace)).not.toContain('Canonical Character identity');
  });

  it('evaluates offline recall, source provenance, exact-budget and privacy against synthetic gold', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    const approvedRef = 'memory:memory-a:grant:grant-a';
    const evaluation = evaluateCharacterMemoryContextOfflineV1([{
      caseId: 'approved-callback',
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(fixture),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
      retrieval: fixture.retrieval,
      context,
      expectedRelevantMemorySourceRefs: [approvedRef],
      expectedIncludedMemorySourceRefs: [approvedRef],
      forbiddenSourceRefs: ['memory:foreign:grant:foreign'],
      forbiddenTraceFragments: ['지난번 퇴사 고민', 'Canonical Character identity'],
    }]);
    expect(evaluation.executionMode).toBe('offline_fixture_only');
    expect(evaluation.passedCount).toBe(1);
    expect(evaluation.failedCount).toBe(0);
    expect(evaluation.cases[0]?.retrieval).toEqual({
      truePositive: 1, falsePositive: 0, falseNegative: 0,
      precision: 1, recall: 1,
    });
    expect(evaluation.cases[0]?.checks.provenanceAndEpistemicLabelsPreserved).toBe(true);
    expect(evaluation.cases[0]?.checks.serializedRequestSegmentsMatchContext).toBe(true);
    expect(evaluation.cases[0]?.checks.protectedSourceGoldPreserved).toBe(true);
    expect(evaluation.cases[0]?.checks.temporalEvidenceWithinAsOf).toBe(true);
    expect(JSON.stringify(evaluation)).not.toContain('지난번 퇴사');
  });

  it('independently rejects wrong canonical retrieval turn even when Context and exact request are unchanged', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    const caseGold = {
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(fixture),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
      context,
      expectedRelevantMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      expectedIncludedMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      forbiddenSourceRefs: [],
      forbiddenTraceFragments: ['FORGED_PRIVATE_QUERY'],
    };
    const baseline = evaluateCharacterMemoryContextOfflineV1([{
      ...caseGold, caseId: 'original-pinned-query',
      retrieval: fixture.retrieval,
    }]);
    expect(baseline.passedCount).toBe(1);
    expect(baseline.cases[0]?.checks.retrievalQueryTurnSourceGoldPreserved).toBe(true);

    const corruptions = [
      { messageId: 'another-user-turn' },
      { sequenceNo: fixture.retrieval.querySourceTurn.sequenceNo + 1 },
      { createdAt: '2026-11-08T00:00:00.000Z' },
      { text: 'FORGED_PRIVATE_QUERY' },
    ];
    for (const [index, corruption] of corruptions.entries()) {
      const report = evaluateCharacterMemoryContextOfflineV1([{
        ...caseGold,
        caseId: 'mismatched-retrieval-turn-' + index,
        retrieval: {
          ...fixture.retrieval,
          querySourceTurn: {
            ...fixture.retrieval.querySourceTurn,
            ...corruption,
          },
        },
      }]);
      expect(report.failedCount).toBe(1);
      expect(report.cases[0]?.checks.retrievalQueryTurnSourceGoldPreserved).toBe(false);
      expect(report.cases[0]?.checks.protectedSourceGoldPreserved).toBe(true);
      expect(report.cases[0]?.checks.serializedRequestSegmentsMatchContext).toBe(true);
      expect(report.cases[0]?.checks.independentMemorySourceClaimsPreserved).toBe(true);
      expect(JSON.stringify(report)).not.toContain('FORGED_PRIVATE_QUERY');
      expect(JSON.stringify(report)).not.toContain('지난번 퇴사');
    }
  });

  it('detects coordinated rewriting of an older canonical dialogue in both context and exact request', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    const originalDialogueGold = expectedOriginalDialogueFromFixture(fixture);
    expect(context.segments.some(segment => segment.layer === 'older_dialogue')).toBe(true);
    const changedSentence = '원문에 없는 가짜 약속을 했습니다.';
    const tamperedSegments = context.segments.map(segment =>
      segment.layer === 'older_dialogue'
        ? { ...segment, text: JSON.stringify({
            ...JSON.parse(segment.text) as Record<string, unknown>,
            text: changedSentence,
          }) }
        : segment);
    const serializedRequestBody = JSON.stringify({
      output: 120, segments: tamperedSegments,
    });
    const report = evaluateCharacterMemoryContextOfflineV1([{
      caseId: 'forged-older-dialogue',
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedOriginalDialogue: originalDialogueGold,
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
      retrieval: fixture.retrieval,
      context: {
        ...context,
        segments: tamperedSegments,
        exactRequest: {
          ...context.exactRequest,
          serializedRequestBody,
          serializedRequestBodyBytes:
            new TextEncoder().encode(serializedRequestBody).byteLength,
        },
      },
      expectedRelevantMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      expectedIncludedMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      forbiddenSourceRefs: [],
      forbiddenTraceFragments: [changedSentence],
    }]);
    expect(report.failedCount).toBe(1);
    expect(report.cases[0]?.checks.serializedRequestSegmentsMatchContext).toBe(true);
    expect(report.cases[0]?.checks.protectedSourceGoldPreserved).toBe(true);
    expect(report.cases[0]?.checks.originalDialogueSourcePreserved).toBe(false);
    expect(JSON.stringify(report)).not.toContain(changedSentence);
  });

  it('rejects out-of-order source dialogue gold rather than accepting a fabricated timeline', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    const original = expectedOriginalDialogueFromFixture(fixture);
    const inconsistent = original.map((message, i) =>
      i === 1 ? { ...message, createdAt: '2026-10-31T00:00:00.000Z' }
        : message);
    expect(() => evaluateCharacterMemoryContextOfflineV1([{
      caseId: 'invalid-original-dialogue-order',
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedOriginalDialogue: inconsistent,
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
      retrieval: fixture.retrieval,
      context,
      expectedRelevantMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      expectedIncludedMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      forbiddenSourceRefs: [],
      forbiddenTraceFragments: [],
    }])).toThrow('dialogue-source gold');
  });

  it('does not count real prior dialogue as sourced when independent gold is missing', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    const report = evaluateCharacterMemoryContextOfflineV1([{
      caseId: 'unverified-original-dialogue',
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedOriginalDialogue: [],
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
      retrieval: fixture.retrieval,
      context,
      expectedRelevantMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      expectedIncludedMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      forbiddenSourceRefs: [],
      forbiddenTraceFragments: [],
    }]);
    expect(report.failedCount).toBe(1);
    expect(report.cases[0]?.checks.originalDialogueSourcePreserved).toBe(false);
  });

  it('catches final request body-only Fact promotion despite matching byte count and trace', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    const original: SyntheticRequest = JSON.parse(context.exactRequest.serializedRequestBody);
    const patched = { ...original,
      segments: original.segments.map(segment =>
        segment.layer === 'retrieved_memory'
          ? { ...segment, text: segment.text.replace('character_interpretation', 'fact') }
          : segment),
    };
    const serializedRequestBody = JSON.stringify(patched);
    const result = evaluateCharacterMemoryContextOfflineV1([{
      caseId: 'tampered-serialized-Fact',
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(fixture),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
      retrieval: fixture.retrieval,
      context: { ...context, exactRequest: { ...context.exactRequest,
        serializedRequestBody,
        serializedRequestBodyBytes: new TextEncoder().encode(serializedRequestBody).byteLength,
      } },
      expectedRelevantMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      expectedIncludedMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      forbiddenSourceRefs: [],
      forbiddenTraceFragments: [],
    }]);
    expect(result.failedCount).toBe(1);
    expect(result.cases[0]?.checks.provenanceAndEpistemicLabelsPreserved).toBe(true);
    expect(result.cases[0]?.checks.exactRequestByteCountAndBudgetValid).toBe(true);
    expect(result.cases[0]?.checks.serializedRequestSegmentsMatchContext).toBe(false);
  });

  it('detects a foreign source in serialized body even when no trace lists it', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    const original: SyntheticRequest = JSON.parse(context.exactRequest.serializedRequestBody);
    const foreignRef = 'memory:foreign:grant:foreign';
    const serializedRequestBody = JSON.stringify({
      ...original,
      segments: [...original.segments, {
        layer: 'retrieved_memory', sourceRef: foreignRef,
        text: 'PRIVATE_UNAPPROVED_CONTENT',
      }],
    });
    const result = evaluateCharacterMemoryContextOfflineV1([{
      caseId: 'unlisted-foreign-memory',
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(fixture),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
      retrieval: fixture.retrieval,
      context: { ...context, exactRequest: { ...context.exactRequest,
        serializedRequestBody,
        serializedRequestBodyBytes: new TextEncoder().encode(serializedRequestBody).byteLength,
      } },
      expectedRelevantMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      expectedIncludedMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      forbiddenSourceRefs: [foreignRef],
      forbiddenTraceFragments: ['PRIVATE_UNAPPROVED_CONTENT'],
    }]);
    expect(result.failedCount).toBe(1);
    expect(result.cases[0]?.checks.deniedSourcesAbsent).toBe(false);
    expect(result.cases[0]?.checks.serializedRequestSegmentsMatchContext).toBe(false);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_UNAPPROVED_CONTENT');
  });

  it('fails safely when final request reader throws or format is unsupported', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    const result = evaluateCharacterMemoryContextOfflineV1([{
      caseId: 'missing-provider-format',
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: () => { throw new Error('PRIVATE_DIAGNOSTIC_TEXT'); },
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(fixture),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
      retrieval: fixture.retrieval, context,
      expectedRelevantMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      expectedIncludedMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      forbiddenSourceRefs: [],
      forbiddenTraceFragments: ['PRIVATE_DIAGNOSTIC_TEXT'],
    }]);
    expect(result.failedCount).toBe(1);
    expect(result.cases[0]?.checks.serializedRequestSegmentsMatchContext).toBe(false);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_DIAGNOSTIC_TEXT');
  });

  it('scores a source-authorized memory callback across two separate synthetic sessions', async () => {
    const first = input(450);
    const second = input(450);
    const nextTime = '2026-11-08T00:00:00.000Z';
    const secondContext = {
      ...second.context,
      currentUserMessage: {
        ...second.context.currentUserMessage,
        messageId: 'current-user-second',
        sequenceNo: 4,
        createdAt: nextTime,
      },
    };
    const secondRetrieval = {
      ...second.retrieval,
      querySourceTurn: {
        ...second.retrieval.querySourceTurn,
        messageId: 'current-user-second',
        sequenceNo: 4,
        createdAt: nextTime,
      },
    };
    const [firstComposed, laterComposed] = await Promise.all([
      composeCharacterDynamicContextV1(first),
      composeCharacterDynamicContextV1({
        ...second, context: secondContext, retrieval: secondRetrieval,
      }),
    ]);
    const sourceRef = 'memory:memory-a:grant:grant-a';
    const base = {
      scope,
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(first),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(first),
      expectedProtectedSegments: expectedProtectedFromFixture(first),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(first),
      expectedRelevantMemorySourceRefs: [sourceRef],
      expectedIncludedMemorySourceRefs: [sourceRef],
      forbiddenSourceRefs: ['memory:another-subject:grant:foreign'],
      forbiddenTraceFragments: ['지난번 퇴사 고민'],
    };
    const suite = {
      scenarioId: 'two-independent-session-callbacks',
      expectedScope: scope,
      turns: [{
        sessionId: 'visit-a',
        turnOrdinal: 1,
        evaluationCase: {
          ...base, caseId: 'visit-a-callback',
          asOf: '2026-11-07T00:00:00.000Z',
          retrieval: first.retrieval, context: firstComposed,
        },
      }, {
        sessionId: 'visit-b',
        turnOrdinal: 2,
        evaluationCase: {
          ...base, caseId: 'visit-b-callback',
          asOf: nextTime,
          expectedOriginalDialogue: expectedOriginalDialogueFromFixture({ ...second, context: secondContext }),
          expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture({ ...second, context: secondContext }),
          expectedProtectedSegments: expectedProtectedFromFixture({
            ...second, context: secondContext,
          }),
          expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(second),
          retrieval: secondRetrieval, context: laterComposed,
        },
      }],
    };
    const report = evaluateCharacterMemoryMultiSessionOfflineV1(suite);
    expect(report).toMatchObject({
      executionMode: 'offline_fixture_only',
      sessionCount: 2,
      turnCount: 2,
      passed: true,
      expectedCrossSessionRecalls: 1,
      successfulCrossSessionRecalls: 1,
      repeatedMemorySourceLineagePreserved: true,
      repeatedCanonicalDialogueSourcePreserved: true,
      repeatedRelationshipEventSourcePreserved: true,
      repeatedRelationshipStateRevisionPreserved: true,
    });
    expect(report.perTurn.passedCount).toBe(2);
    expect(JSON.stringify(report)).not.toContain('지난번 퇴사');
    expect(() => evaluateCharacterMemoryMultiSessionOfflineV1({
      ...suite,
      turns: [
        suite.turns[0]!,
        { ...suite.turns[1]!, evaluationCase: {
          ...suite.turns[1]!.evaluationCase,
          scope: { ...scope, subjectId: 'foreign-subject' },
        } },
      ],
    })).toThrow('foreign');

    const laterGold = suite.turns[1]!.evaluationCase.expectedProtectedSegments;
    for (const [label, changed] of [
      ['reused-id', { messageId: 'current-user' }],
      ['reused-sequence', { sequenceNo: 3 }],
    ] as const) {
      const reusedId = label === 'reused-id';
      const alteredGold = laterGold.map(segment => {
        if (segment.layer === 'current_turn_state') {
          return {
            ...segment,
            sourceRef: reusedId ? 'turn:current-user:state' : segment.sourceRef,
            text: JSON.stringify({
              ...JSON.parse(segment.text) as Record<string, unknown>,
              ...changed,
            }),
          };
        }
        return reusedId && segment.layer === 'current_turn'
          ? { ...segment, sourceRef: 'message:current-user' } : segment;
      });
      expect(() => evaluateCharacterMemoryMultiSessionOfflineV1({
        ...suite,
        scenarioId: 'canonical-identity-replay-' + label,
        turns: [
          suite.turns[0]!,
          {
            ...suite.turns[1]!,
            evaluationCase: {
              ...suite.turns[1]!.evaluationCase,
              expectedProtectedSegments: alteredGold,
            },
          },
        ],
      })).toThrow('stale, foreign or reordered turns');
    }
  });

  it('rejects coherently rewritten canonical dialogue across sessions despite independently passing turns', async () => {
    const first = input(450);
    const second = input(450);
    const laterTime = '2026-11-08T00:00:00.000Z';
    const original = await composeCharacterDynamicContextV1(first);
    const sourceRef = 'memory:memory-a:grant:grant-a';
    const firstCase = {
      caseId: 'original-dialogue-session-a',
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(first),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(first),
      expectedProtectedSegments: expectedProtectedFromFixture(first),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(first),
      retrieval: first.retrieval,
      context: original,
      expectedRelevantMemorySourceRefs: [sourceRef],
      expectedIncludedMemorySourceRefs: [sourceRef],
      forbiddenSourceRefs: [],
      forbiddenTraceFragments: ['FORGED_PRIVATE_DIALOGUE'],
    };
    for (const variant of ['text', 'createdAt', 'role'] as const) {
      const recentConversation = second.context.recentConversation.map(message => {
        if (message.messageId !== 'message-old-1') return message;
        if (variant === 'text') return { ...message, text: 'FORGED_PRIVATE_DIALOGUE' };
        if (variant === 'createdAt') return {
          ...message, createdAt: '2026-11-01T12:00:00.000Z',
        };
        return {
          ...message,
          role: 'assistant' as const,
          speakerCharacterId: 'seyeon',
        };
      });
      const laterContext = {
        ...second.context,
        recentConversation,
        currentUserMessage: {
          ...second.context.currentUserMessage,
          messageId: 'current-user-second',
          sequenceNo: 4,
          createdAt: laterTime,
        },
      };
      const laterRetrieval = {
        ...second.retrieval,
        querySourceTurn: {
          ...second.retrieval.querySourceTurn,
          messageId: 'current-user-second',
          sequenceNo: 4,
          createdAt: laterTime,
        },
      };
      const laterFixture = {
        ...second, context: laterContext, retrieval: laterRetrieval,
      };
      const laterComposed = await composeCharacterDynamicContextV1(laterFixture);
      const report = evaluateCharacterMemoryMultiSessionOfflineV1({
        scenarioId: 'source-dialogue-drift-' + variant,
        expectedScope: scope,
        turns: [{
          sessionId: 'session-a',
          turnOrdinal: 1,
          evaluationCase: firstCase,
        }, {
          sessionId: 'session-b',
          turnOrdinal: 2,
          evaluationCase: {
            ...firstCase,
            caseId: 'changed-dialogue-session-b-' + variant,
            asOf: laterTime,
            expectedOriginalDialogue: expectedOriginalDialogueFromFixture(laterFixture),
            expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(laterFixture),
            expectedProtectedSegments: expectedProtectedFromFixture(laterFixture),
            expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(laterFixture),
            retrieval: laterRetrieval,
            context: laterComposed,
          },
        }],
      });
      expect(report.perTurn.passedCount).toBe(2);
      expect(report.repeatedMemorySourceLineagePreserved).toBe(true);
      expect(report.repeatedCanonicalDialogueSourcePreserved).toBe(false);
      expect(report.expectedCrossSessionRecalls).toBe(1);
      expect(report.successfulCrossSessionRecalls).toBe(0);
      expect(report.passed).toBe(false);
      expect(JSON.stringify(report)).not.toContain('FORGED_PRIVATE_DIALOGUE');
      expect(JSON.stringify(report)).not.toContain('지난 주 일을 이야기했어요');
    }
  });

  it('detects relationship event gold rewriting across sessions without inventing causal meaning', async () => {
    const originalEvent = {
      eventType: 'REPAIR_MARKER',
      eventSchemaVersion: 'fixture-v1',
      stateRevisionAfter: 2,
      policyVersion: 'fixture-v1',
      appliedAt: '2026-11-04T00:00:00.000Z',
    };
    const laterTime = '2026-11-08T00:00:00.000Z';
    const sourceRef = 'memory:memory-a:grant:grant-a';
    const buildSession = (
      base: ReturnType<typeof input>,
      event: typeof originalEvent,
      later: boolean,
      stateId = 'rel-approved',
    ) => {
      const context = {
        ...base.context,
        scope: { ...base.context.scope, relationshipRevision: 3 },
        currentUserMessage: later
          ? { ...base.context.currentUserMessage,
              messageId: 'current-user-second', sequenceNo: 4,
              createdAt: laterTime }
          : base.context.currentUserMessage,
        relationship: {
          stateId, characterId: 'seyeon',
          closeness: 1, trust: 1, friction: 0,
          relationshipStage: 'FAMILIAR', policyVersion: 'fixture-v1',
          revision: 3, lastInteractionAt: null as string | null,
          updatedAt: '2026-11-05T00:00:00.000Z',
        },
        relationshipEventIndex: {
          exposure: 'metadata_only' as const,
          events: [event],
        },
      };
      const retrieval = {
        ...base.retrieval,
        scope: { ...base.retrieval.scope, relationshipRevision: 3 },
        querySourceTurn: later
          ? { ...base.retrieval.querySourceTurn,
              messageId: 'current-user-second', sequenceNo: 4,
              createdAt: laterTime }
          : base.retrieval.querySourceTurn,
      };
      return { ...base, context, retrieval };
    };
    const first = buildSession(input(450), originalEvent, false);
    const firstComposed = await composeCharacterDynamicContextV1(first);
    const makeCase = async (
      fixture: ReturnType<typeof buildSession>,
      caseId: string,
      asOf: string,
    ) => ({
      caseId, scope, asOf,
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(fixture),
      expectedOriginalRelationshipEvents:
        expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
      retrieval: fixture.retrieval,
      context: await composeCharacterDynamicContextV1(fixture),
      expectedRelevantMemorySourceRefs: [sourceRef],
      expectedIncludedMemorySourceRefs: [sourceRef],
      forbiddenSourceRefs: [],
      forbiddenTraceFragments: ['ALTERED_MARKER'],
    });
    const firstCase = {
      ...await makeCase(first, 'relation-event-first', '2026-11-07T00:00:00.000Z'),
      context: firstComposed,
    };
    const evaluatePair = (laterCase: Awaited<ReturnType<typeof makeCase>>, scenarioId: string) =>
      evaluateCharacterMemoryMultiSessionOfflineV1({
        scenarioId, expectedScope: scope,
        turns: [{
          sessionId: 'visit-one', turnOrdinal: 1,
          evaluationCase: firstCase,
        }, {
          sessionId: 'visit-two', turnOrdinal: 2,
          evaluationCase: laterCase,
        }],
      });
    const matching = buildSession(input(450), originalEvent, true);
    const positive = evaluatePair(
      await makeCase(matching, 'relation-event-matching', laterTime),
      'same-original-event',
    );
    expect(positive.perTurn.passedCount).toBe(2);
    expect(positive.passed).toBe(true);
    expect(positive.repeatedRelationshipEventSourcePreserved).toBe(true);
    expect(positive.repeatedRelationshipStateRevisionPreserved).toBe(true);
    expect(positive.successfulCrossSessionRecalls).toBe(1);

    const alterations = [
      { ...originalEvent, eventType: 'ALTERED_MARKER' },
      { ...originalEvent, policyVersion: 'changed-policy-v2' },
      { ...originalEvent, appliedAt: '2026-11-06T00:00:00.000Z' },
    ];
    for (const [index, alteredEvent] of alterations.entries()) {
      const changed = buildSession(input(450), alteredEvent, true);
      const report = evaluatePair(
        await makeCase(changed, 'relation-event-changed-' + index, laterTime),
        'same-state-event-drift-' + index,
      );
      expect(report.perTurn.passedCount).toBe(2);
      expect(report.repeatedRelationshipEventSourcePreserved).toBe(false);
      expect(report.repeatedMemorySourceLineagePreserved).toBe(true);
      expect(report.repeatedCanonicalDialogueSourcePreserved).toBe(true);
      expect(report.passed).toBe(false);
      expect(report.expectedCrossSessionRecalls).toBe(1);
      expect(report.successfulCrossSessionRecalls).toBe(0);
      expect(JSON.stringify(report)).not.toContain('ALTERED_MARKER');
      expect(JSON.stringify(report)).not.toContain('changed-policy-v2');
    }

    // Event revisions are not global IDs. A different independently pinned
    // relationship state may use the same revision with different metadata.
    const anotherState = buildSession(input(450), alterations[0]!, true, 'rel-other');
    const distinctState = evaluatePair(
      await makeCase(anotherState, 'different-relationship-state', laterTime),
      'different-state-revision-allowed',
    );
    expect(distinctState.perTurn.passedCount).toBe(2);
    expect(distinctState.repeatedRelationshipEventSourcePreserved).toBe(true);
    expect(distinctState.repeatedRelationshipStateRevisionPreserved).toBe(true);
    expect(distinctState.passed).toBe(true);

    // Per-session request/source-gold checks still pass after a coherent
    // rewrite. The same independently pinned Relationship state + revision
    // cannot silently change scores, stage or source-owned timestamps.
    const stateMutations = [
      { closeness: 19 },
      { trust: 17 },
      { friction: 12 },
      { relationshipStage: 'TRUSTED' },
      { policyVersion: 'altered-private-policy-v2' },
      // Keep the mutated timestamp chronologically valid within each turn;
      // only the cross-session SAME-revision rewrite should fail.
      { lastInteractionAt: '2026-11-04T00:00:00.000Z' },
      { updatedAt: '2026-11-06T00:00:00.000Z' },
    ];
    for (const [index, change] of stateMutations.entries()) {
      const original = buildSession(input(450), originalEvent, true);
      const changed = {
        ...original,
        context: {
          ...original.context,
          relationship: { ...original.context.relationship, ...change },
        },
      };
      const report = evaluatePair(
        await makeCase(changed, 'altered-state-snapshot-' + index, laterTime),
        'same-state-same-revision-changed-' + index,
      );
      expect(report.perTurn.passedCount).toBe(2);
      expect(report.repeatedRelationshipStateRevisionPreserved).toBe(false);
      expect(report.repeatedRelationshipEventSourcePreserved).toBe(true);
      expect(report.repeatedCanonicalDialogueSourcePreserved).toBe(true);
      expect(report.repeatedMemorySourceLineagePreserved).toBe(true);
      expect(report.expectedCrossSessionRecalls).toBe(1);
      expect(report.successfulCrossSessionRecalls).toBe(0);
      expect(report.passed).toBe(false);
      expect(JSON.stringify(report)).not.toContain('altered-private-policy-v2');
    }

    // The Relationship ledger can legitimately progress to a NEW revision.
    // Source-verified updated scores and stages are not immutable across
    // different revisions, only within the same state + revision identity.
    const laterBase = buildSession(input(450), originalEvent, true);
    const advanced = {
      ...laterBase,
      context: {
        ...laterBase.context,
        scope: { ...laterBase.context.scope, relationshipRevision: 4 },
        relationship: {
          ...laterBase.context.relationship,
          revision: 4, closeness: 30, trust: 40,
          relationshipStage: 'TRUSTED',
          updatedAt: '2026-11-06T00:00:00.000Z',
        },
      },
      retrieval: {
        ...laterBase.retrieval,
        scope: { ...laterBase.retrieval.scope, relationshipRevision: 4 },
      },
    };
    const advancedReport = evaluatePair(
      await makeCase(advanced, 'relationship-state-new-revision', laterTime),
      'relationship-revision-advanced',
    );
    expect(advancedReport.perTurn.passedCount).toBe(2);
    expect(advancedReport.repeatedRelationshipStateRevisionPreserved).toBe(true);
    expect(advancedReport.passed).toBe(true);
    expect(advancedReport.successfulCrossSessionRecalls).toBe(1);

    const reverted = {
      ...laterBase,
      context: {
        ...laterBase.context,
        scope: { ...laterBase.context.scope, relationshipRevision: 2 },
        relationship: { ...laterBase.context.relationship, revision: 2 },
      },
      retrieval: {
        ...laterBase.retrieval,
        scope: { ...laterBase.retrieval.scope, relationshipRevision: 2 },
      },
    };
    const revertedReport = evaluatePair(
      await makeCase(reverted, 'relationship-state-old-revision', laterTime),
      'relationship-revision-reverted',
    );
    expect(revertedReport.perTurn.passedCount).toBe(2);
    expect(revertedReport.repeatedRelationshipStateRevisionPreserved).toBe(false);
    expect(revertedReport.repeatedRelationshipEventSourcePreserved).toBe(true);
    expect(revertedReport.successfulCrossSessionRecalls).toBe(0);
    expect(revertedReport.passed).toBe(false);
  });

  it('fails cross-session continuity when an immutable memory source is coherently rewritten in a later session', async () => {
    const first = input(450);
    const second = input(450);
    const laterTime = '2026-11-08T00:00:00.000Z';
    const laterContext = {
      ...second.context,
      currentUserMessage: {
        ...second.context.currentUserMessage,
        messageId: 'current-user-second',
        sequenceNo: 4,
        createdAt: laterTime,
      },
    };
    const sourceRef = 'memory:memory-a:grant:grant-a';
    const firstComposed = await composeCharacterDynamicContextV1(first);
    const baseCase = {
      scope,
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(first),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(first),
      expectedProtectedSegments: expectedProtectedFromFixture(first),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(first),
      retrieval: first.retrieval,
      context: firstComposed,
      expectedRelevantMemorySourceRefs: [sourceRef],
      expectedIncludedMemorySourceRefs: [sourceRef],
      forbiddenSourceRefs: [],
      forbiddenTraceFragments: ['FORGED_PRIVATE_MEMORY'],
    };
    const original = second.retrieval.records[0]!;
    const variants = [
      { summary: 'FORGED_PRIVATE_MEMORY', sourceMessageId: original.record.sourceMessageId },
      { summary: original.record.summary, sourceMessageId: 'fabricated-source-message' },
    ];
    for (const [index, change] of variants.entries()) {
      const retrieval = {
        ...second.retrieval,
        querySourceTurn: {
          ...second.retrieval.querySourceTurn,
          messageId: 'current-user-second',
          sequenceNo: 4,
          createdAt: laterTime,
        },
        records: [{
          ...original,
          record: { ...original.record, ...change },
        }],
      };
      const laterFixture = {
        ...second,
        context: laterContext,
        retrieval,
      };
      const laterComposed = await composeCharacterDynamicContextV1(laterFixture);
      const report = evaluateCharacterMemoryMultiSessionOfflineV1({
        scenarioId: 'cross-session-source-change-' + index,
        expectedScope: scope,
        turns: [{
          sessionId: 'session-a',
          turnOrdinal: 1,
          evaluationCase: {
            ...baseCase,
            caseId: 'original-source-a-' + index,
            asOf: '2026-11-07T00:00:00.000Z',
          },
        }, {
          sessionId: 'session-b',
          turnOrdinal: 2,
          evaluationCase: {
            ...baseCase,
            caseId: 'rewritten-source-b-' + index,
            asOf: laterTime,
            expectedOriginalDialogue: expectedOriginalDialogueFromFixture(laterFixture),
            expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(laterFixture),
            expectedProtectedSegments: expectedProtectedFromFixture(laterFixture),
            expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(laterFixture),
            retrieval,
            context: laterComposed,
          },
        }],
      });
      // Both individual turns are internally coherent with their own
      // independently supplied gold. Only the shared source identity across
      // the two sessions proves the rewrite.
      expect(report.perTurn.passedCount).toBe(2);
      expect(report.repeatedMemorySourceLineagePreserved).toBe(false);
      expect(report.passed).toBe(false);
      expect(report.expectedCrossSessionRecalls).toBe(1);
      expect(report.successfulCrossSessionRecalls).toBe(0);
      expect(JSON.stringify(report)).not.toContain('FORGED_PRIVATE_MEMORY');
      expect(JSON.stringify(report)).not.toContain('fabricated-source-message');
    }
  });

  it('does not count callback memory retrieved but omitted from the final token-limited request', async () => {
    const first = input(450);
    const second = input(280);
    const nextTime = '2026-11-08T00:00:00.000Z';
    const secondContext = {
      ...second.context,
      currentUserMessage: {
        ...second.context.currentUserMessage,
        messageId: 'current-user-second',
        sequenceNo: 4,
        createdAt: nextTime,
      },
    };
    const secondRetrieval = {
      ...second.retrieval,
      querySourceTurn: {
        ...second.retrieval.querySourceTurn,
        messageId: 'current-user-second',
        sequenceNo: 4,
        createdAt: nextTime,
      },
    };
    const [firstComposed, laterComposed] = await Promise.all([
      composeCharacterDynamicContextV1(first),
      composeCharacterDynamicContextV1({
        ...second, context: secondContext, retrieval: secondRetrieval,
      }),
    ]);
    const sourceRef = 'memory:memory-a:grant:grant-a';
    expect(second.retrieval.records.some(item => item.record.sourceRef === sourceRef))
      .toBe(true);
    expect(laterComposed.segments.some(segment =>
      segment.layer === 'retrieved_memory' && segment.sourceRef === sourceRef))
      .toBe(false);
    const report = evaluateCharacterMemoryMultiSessionOfflineV1({
      scenarioId: 'memory-retrieved-but-token-dropped',
      expectedScope: scope,
      turns: [{
        sessionId: 'visit-1',
        turnOrdinal: 1,
        evaluationCase: {
          caseId: 'first-session-with-memory',
          scope,
          asOf: '2026-11-07T00:00:00.000Z',
          inspectSerializedRequestSegments: inspectSyntheticRequest,
          expectedOriginalDialogue: expectedOriginalDialogueFromFixture(first),
          expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(first),
          expectedProtectedSegments: expectedProtectedFromFixture(first),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(first),
          retrieval: first.retrieval,
          context: firstComposed,
          expectedRelevantMemorySourceRefs: [sourceRef],
          expectedIncludedMemorySourceRefs: [sourceRef],
          forbiddenSourceRefs: [],
          forbiddenTraceFragments: [],
        },
      }, {
        sessionId: 'visit-2',
        turnOrdinal: 2,
        evaluationCase: {
          caseId: 'second-session-token-dropped',
          scope,
          asOf: nextTime,
          inspectSerializedRequestSegments: inspectSyntheticRequest,
          expectedOriginalDialogue: expectedOriginalDialogueFromFixture({ ...second, context: secondContext }),
          expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture({ ...second, context: secondContext }),
          expectedProtectedSegments: expectedProtectedFromFixture({
            ...second, context: secondContext,
          }),
          expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(second),
          retrieval: secondRetrieval,
          context: laterComposed,
          expectedRelevantMemorySourceRefs: [sourceRef],
          expectedIncludedMemorySourceRefs: [],
          forbiddenSourceRefs: [],
          forbiddenTraceFragments: [],
        },
      }],
    });
    expect(report).toMatchObject({
      sessionCount: 2,
      turnCount: 2,
      passed: false,
      expectedCrossSessionRecalls: 1,
      successfulCrossSessionRecalls: 0,
    });
    expect(report.perTurn.passedCount).toBe(2);
    expect(JSON.stringify(report)).not.toContain('지난번 퇴사 고민');
  });

  it('rejects forged source/grant lineage even if memory text and final request are unchanged', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    const gold = expectedRetrievedMemoryClaimsFromFixture(fixture);
    const original = fixture.retrieval.records[0]!;
    const variants = [
      { grantId: 'attacker-grant' },
      { granteeCharacterId: 'other-character' },
      { grantedAt: '2026-10-30T00:00:00.000Z' },
      { sourceTurnId: 'attacker-turn' },
      { sourceMessageId: 'attacker-message' },
      { sourceMergeActionId: 'attacker-merge' },
      { recordId: 'attacker-record' },
      { createdAt: '2026-10-31T00:00:00.000Z' },
    ];
    const cases = variants.map((mutated, index) => ({
      caseId: 'tampered-source-lineage-' + index,
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(fixture),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedRetrievedMemoryClaims: gold,
      retrieval: {
        ...fixture.retrieval,
        records: [{
          ...original,
          record: { ...original.record, ...mutated },
        }],
      },
      context,
      expectedRelevantMemorySourceRefs: [original.record.sourceRef],
      expectedIncludedMemorySourceRefs: [original.record.sourceRef],
      forbiddenSourceRefs: [],
      forbiddenTraceFragments: [],
    }));
    const result = evaluateCharacterMemoryContextOfflineV1(cases);
    expect(result.failedCount).toBe(variants.length);
    expect(result.cases.every(item =>
      item.checks.independentMemorySourceClaimsPreserved === false)).toBe(true);
    expect(result.cases.every(item =>
      item.checks.serializedRequestSegmentsMatchContext === true)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('attacker-grant');
    expect(JSON.stringify(result)).not.toContain('attacker-message');
  });

  it('rejects a coordinated false biography in retrieval, context and exact request against independent source gold', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    const originalSourceRef = fixture.retrieval.records[0]!.record.sourceRef;
    const forgedSummary = '사용자는 의과대학을 졸업했다고 주장했습니다.';
    const retrieval = {
      ...fixture.retrieval,
      records: fixture.retrieval.records.map(item => ({
        ...item,
        record: { ...item.record, summary: forgedSummary },
      })),
    };
    const segments = context.segments.map(segment =>
      segment.layer === 'retrieved_memory' &&
      segment.sourceRef === originalSourceRef
        ? { ...segment, text: JSON.stringify({
          ...JSON.parse(segment.text) as Record<string, unknown>,
          summary: forgedSummary,
        }) }
        : segment);
    const serializedRequestBody = JSON.stringify({ output: 120, segments });
    const coherentTampering = {
      ...context,
      segments,
      exactRequest: {
        ...context.exactRequest,
        serializedRequestBody,
        serializedRequestBodyBytes: new TextEncoder().encode(serializedRequestBody).byteLength,
      },
    };
    const report = evaluateCharacterMemoryContextOfflineV1([{
      caseId: 'coordinated-memory-biography-forgery',
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(fixture),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
      retrieval,
      context: coherentTampering,
      expectedRelevantMemorySourceRefs: [originalSourceRef],
      expectedIncludedMemorySourceRefs: [originalSourceRef],
      forbiddenSourceRefs: [],
      forbiddenTraceFragments: [],
    }]);
    expect(report.failedCount).toBe(1);
    expect(report.cases[0]?.checks.independentMemorySourceClaimsPreserved).toBe(false);
    expect(report.cases[0]?.checks.serializedRequestSegmentsMatchContext).toBe(true);
    expect(report.cases[0]?.checks.provenanceAndEpistemicLabelsPreserved).toBe(true);
    expect(JSON.stringify(report)).not.toContain(forgedSummary);
  });

  it('detects protected Character/policy sources removed or rewritten in both assembled and serialized contexts', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    const gold = expectedProtectedFromFixture(fixture);
    const policySourceRef = fixture.systemSafety.sourceRef;
    const alteredResults = [
      context.segments.filter(segment => segment.layer !== 'character_core'),
      context.segments.map(segment => segment.sourceRef === policySourceRef
        ? { ...segment, text: 'UNAUTHORIZED_REPLACEMENT_POLICY' }
        : segment),
    ];
    const cases = alteredResults.map((segments, i) => {
      const serializedRequestBody = JSON.stringify({ output: 120, segments });
      return {
        caseId: 'mutated-protected-source-' + i,
        scope,
        asOf: '2026-11-07T00:00:00.000Z',
        inspectSerializedRequestSegments: inspectSyntheticRequest,
        expectedOriginalDialogue: expectedOriginalDialogueFromFixture(fixture),
        expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
        expectedProtectedSegments: gold,
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
        retrieval: fixture.retrieval,
        context: {
          ...context,
          segments,
          exactRequest: { ...context.exactRequest,
            serializedRequestBody,
            serializedRequestBodyBytes: new TextEncoder().encode(serializedRequestBody).byteLength,
          },
          trace: {
            ...context.trace,
            includedSourceRefs: segments.map(s => s.sourceRef),
          },
        },
        expectedRelevantMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
        expectedIncludedMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
        forbiddenSourceRefs: [],
        forbiddenTraceFragments: [],
      };
    });
    const evaluation = evaluateCharacterMemoryContextOfflineV1(cases);
    expect(evaluation.failedCount).toBe(2);
    expect(evaluation.cases.every(c => c.checks.protectedSourceGoldPreserved === false))
      .toBe(true);
    expect(evaluation.cases.every(c =>
      c.checks.serializedRequestSegmentsMatchContext === true)).toBe(true);
    expect(JSON.stringify(evaluation)).not.toContain('UNAUTHORIZED_REPLACEMENT_POLICY');
  });

  it('rejects synthetic protected-source gold missing mandatory safety authority', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    expect(() => evaluateCharacterMemoryContextOfflineV1([{
      caseId: 'missing-authority-gold',
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(fixture),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedProtectedSegments: expectedProtectedFromFixture(fixture).filter(
        segment => segment.layer !== 'system_safety_product',
      ),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
      retrieval: fixture.retrieval,
      context,
      expectedRelevantMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      expectedIncludedMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      forbiddenSourceRefs: [],
      forbiddenTraceFragments: [],
    }])).toThrow('protected source gold');
  });

  it('flags tampered memory claimKind and mismatched source traces without self-grading', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    const tampered = {
      ...context,
      segments: context.segments.map(segment =>
        segment.layer === 'retrieved_memory'
          ? {
              ...segment,
              text: segment.text.replace(
                'character_interpretation', 'fact',
              ),
            }
          : segment),
      trace: {
        ...context.trace,
        includedSourceRefs: ['foreign-ref'],
      },
    };
    const result = evaluateCharacterMemoryContextOfflineV1([{
      caseId: 'false-fact-boundary',
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(fixture),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
      retrieval: fixture.retrieval,
      context: tampered,
      expectedRelevantMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      expectedIncludedMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      forbiddenSourceRefs: ['foreign-ref'],
      forbiddenTraceFragments: ['지난번 퇴사 고민'],
    }]);
    expect(result.failedCount).toBe(1);
    expect(result.cases[0]?.checks.provenanceAndEpistemicLabelsPreserved).toBe(false);
    expect(result.cases[0]?.checks.retrievalTraceMatchesSelection).toBe(false);
    expect(result.cases[0]?.checks.deniedSourcesAbsent).toBe(false);
  });

  it('detects future-granted and expired memories against pinned turn time, not model prose', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    const sourceRef = 'memory:memory-a:grant:grant-a';
    const futureGrant = {
      ...fixture.retrieval,
      records: fixture.retrieval.records.map(item => ({
        ...item,
        record: {
          ...item.record,
          grantedAt: '2026-11-09T00:00:00.000Z',
        },
      })),
    };
    const expiredLifeFact = {
      ...fixture.retrieval,
      records: fixture.retrieval.records.map(item => ({
        ...item,
        record: {
          ...item.record,
          recordKind: 'life_fact' as const,
          confirmedAt: '2026-11-01T00:00:00.000Z',
          validFrom: '2026-11-01T00:00:00.000Z',
          validTo: '2026-11-05T00:00:00.000Z',
        },
      })),
    };
    const cases = [futureGrant, expiredLifeFact].map((retrieval, i) => ({
      caseId: 'outdated-evidence-' + i,
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(fixture),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
      retrieval,
      context,
      expectedRelevantMemorySourceRefs: [sourceRef],
      expectedIncludedMemorySourceRefs: [sourceRef],
      forbiddenSourceRefs: [],
      forbiddenTraceFragments: [],
    }));
    const result = evaluateCharacterMemoryContextOfflineV1(cases);
    expect(result.failedCount).toBe(2);
    expect(result.cases.every(item =>
      item.checks.temporalEvidenceWithinAsOf === false)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('지난번 퇴사');
  });

  it('treats an absent supported memory as abstention rather than invented recall', async () => {
    const fixture = input(450);
    const retrieval = {
      ...fixture.retrieval,
      records: [],
      trace: {
        ...fixture.retrieval.trace,
        selectedSourceRefs: [],
      },
    };
    const context = await composeCharacterDynamicContextV1({
      ...fixture, retrieval,
    });
    const result = evaluateCharacterMemoryContextOfflineV1([{
      caseId: 'unanswered-unknown-memory',
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(fixture),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedRetrievedMemoryClaims: [],
      retrieval,
      context,
      expectedRelevantMemorySourceRefs: [],
      expectedIncludedMemorySourceRefs: [],
      forbiddenSourceRefs: ['memory:foreign:grant:foreign'],
      forbiddenTraceFragments: ['지난번 퇴사 고민'],
    }]);
    expect(result.passedCount).toBe(1);
    expect(result.cases[0]?.retrieval).toMatchObject({
      truePositive: 0, falsePositive: 0, falseNegative: 0,
    });
    expect(result.cases[0]?.checks.temporalEvidenceWithinAsOf).toBe(true);
  });

  it('rejects contradictory offline source gold instead of silently grading it', async () => {
    const fixture = input(450);
    const context = await composeCharacterDynamicContextV1(fixture);
    expect(() => evaluateCharacterMemoryContextOfflineV1([{
      caseId: 'contradictory-gold',
      scope,
      asOf: '2026-11-07T00:00:00.000Z',
      inspectSerializedRequestSegments: inspectSyntheticRequest,
      expectedOriginalDialogue: expectedOriginalDialogueFromFixture(fixture),
      expectedOriginalRelationshipEvents: expectedOriginalRelationshipEventsFromFixture(fixture),
      expectedProtectedSegments: expectedProtectedFromFixture(fixture),
      expectedRetrievedMemoryClaims: expectedRetrievedMemoryClaimsFromFixture(fixture),
      retrieval: fixture.retrieval,
      context,
      expectedRelevantMemorySourceRefs: ['memory:memory-a:grant:grant-a'],
      expectedIncludedMemorySourceRefs: [],
      forbiddenSourceRefs: ['memory:memory-a:grant:grant-a'],
      forbiddenTraceFragments: [],
    }])).toThrow('contradictory');
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

  it('rejects free-form or private prose in diagnostic source identifiers before exact counting', async () => {
    const fixture = input();
    const countExactRequest = vi.fn(fixture.adapter.countExactRequest);
    const buildExactRequest = vi.fn(fixture.buildExactRequest);
    await expect(composeCharacterDynamicContextV1({
      ...fixture,
      responseTask: {
        sourceRef: 'task:지난번 퇴사 고민을 나누었습니다.',
        text: 'Approved task text.',
      },
      adapter: { ...fixture.adapter, countExactRequest },
      buildExactRequest,
    })).rejects.toMatchObject({
      name: 'CharacterDynamicContextComposerErrorV1',
      code: 'INVALID_SEGMENT',
    });
    expect(countExactRequest).not.toHaveBeenCalled();
    expect(buildExactRequest).not.toHaveBeenCalled();
  });

  it('rejects a missing pinned relationship projection rather than silently omitting it', async () => {
    const fixture = input();
    await expect(composeCharacterDynamicContextV1({
      ...fixture,
      context: {
        ...fixture.context,
        scope: { ...fixture.context.scope, relationshipRevision: 2 },
      },
      retrieval: {
        ...fixture.retrieval,
        scope: { ...fixture.retrieval.scope, relationshipRevision: 2 },
      },
    })).rejects.toMatchObject({
      name: 'CharacterDynamicContextComposerErrorV1',
      code: 'SCOPE_MISMATCH',
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
