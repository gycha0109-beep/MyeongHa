import { describe, expect, it } from 'vitest';
import {
  assembleSeyeonRuntimeContextV2,
  type SeyeonRuntimeContextV2,
} from '../packages/domain/src/seyeon-runtime-context-v2.js';
import { buildSeyeonTurnInterpreterRequestV2 } from '../apps/api/src/seyeon-character-runtime-v2.js';
import { SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1 } from '../apps/api/src/seyeon-fast-dialogue-shadow-v1.js';
import {
  deriveSeyeonC09DialogueContinuityPacketShadowV1,
  composeSeyeonC09DialogueContinuityShadowRequestV1,
} from '../apps/api/src/seyeon-c09-dialogue-continuity-shadow-v1.js';

const threeTurns = [
  { messageId: 'u1', role: 'user' as const, text: '그냥 심심하네.' },
  { messageId: 'a1', role: 'assistant' as const, text: '저는 웃긴 간판을 찾아보는 쪽이 더 재밌는데요.' },
  { messageId: 'u2', role: 'user' as const, text: '왜 하필 간판인데?' },
];

function contextFor(messages = threeTurns): SeyeonRuntimeContextV2 {
  return assembleSeyeonRuntimeContextV2({
    relationship: null,
    recentMessages: messages,
    retrievedMemories: [],
    integrityDecisions: [],
    governedPreflightApplied: true,
    disclosure: { decision: null, retrievedSources: [] },
  });
}

function candidateRequest(context: SeyeonRuntimeContextV2) {
  const request = buildSeyeonTurnInterpreterRequestV2(context);
  return {
    ...request,
    purpose: 'turn_interpret_render_shadow' as const,
    responseSchema: SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1,
  };
}

describe('C09 multi-turn public dialogue continuity — no calls or durable writes', () => {
  it('carries only previously voiced assistant dialogue references, never inferred activity or memory', () => {
    const context = contextFor();
    const packet = deriveSeyeonC09DialogueContinuityPacketShadowV1(context);
    expect(packet.currentUserMessageRef).toBe('u2');
    expect(packet.previousAssistantMessageRefs).toEqual(['a1']);
    expect(packet.recentMessageRefs).toEqual(['u1', 'a1', 'u2']);
    expect(packet.evidenceKind).toBe('DIALOGUE_UTTERANCES_NOT_VERIFIED_EVENTS');
    expect(packet.sourceCompleteness).toBe('BOUNDED_WINDOW_NOT_FULL_THREAD_CENSUS');
    expect(Object.values(packet.authority)).toEqual([false, false, false, false, false, false]);
    expect(JSON.stringify(packet)).not.toContain('웃긴 간판');
    expect(Object.isFrozen(packet)).toBe(true);
    expect(Object.isFrozen(packet.previousAssistantMessageRefs)).toBe(true);
  });

  it('adds continuation guidance without a fake scene or deterministic action, preserving original references and schema', () => {
    const context = contextFor();
    const base = candidateRequest(context);
    const next = composeSeyeonC09DialogueContinuityShadowRequestV1({
      context, request: base,
    });
    expect(next.purpose).toBe('turn_interpret_render_shadow');
    expect(next.responseSchema).toBe(SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1);
    expect(next.instructions).toContain('carry forward, challenge, refine, or explicitly change');
    expect(next.instructions).toContain('remembering the utterance from remembering an event');
    expect(next.instructions).toContain('own values, contradictions and initiative');
    expect(next.instructions).toContain('independent semantic review guards');
    const payload = next.input as Record<string, unknown>;
    expect(payload.context).toBe(context);
    expect(payload.allowedReferenceVocabulary).toBe(
      (base.input as Record<string, unknown>).allowedReferenceVocabulary,
    );
    expect(payload.c09DialogueContinuity).toMatchObject({
      currentUserMessageRef: 'u2',
      previousAssistantMessageRefs: ['a1'],
      authority: { assistantUtterancesAreFacts: false, mayCreateMemory: false },
    });
    expect(Object.hasOwn(payload, 'chosenAction')).toBe(false);
    expect(Object.hasOwn(payload, 'persistentEmotionalState')).toBe(false);
  });

  it('keeps a bounded recent history of stated choices even when the user changes direction', () => {
    const context = contextFor([
      ...threeTurns.slice(0, 2),
      { messageId: 'u2', role: 'user', text: '괜히 반대해?' },
      { messageId: 'a2', role: 'assistant', text: '그냥 제 생각이 달라서요.' },
      { messageId: 'u3', role: 'user', text: '그럼 이번에는 제 말에 동의해 봐.' },
    ]);
    expect(deriveSeyeonC09DialogueContinuityPacketShadowV1(context).previousAssistantMessageRefs)
      .toEqual(['a1', 'a2']);
  });

  it('does not promote an earlier fictional activity into factual memory', () => {
    const context = contextFor([
      { messageId: 'u1', role: 'user', text: '뭐 했어?' },
      { messageId: 'a1', role: 'assistant', text: '어제 밤새 영화 봤어요.' },
      { messageId: 'u2', role: 'user', text: '어제 그 영화 어땠어?' },
    ]);
    const next = composeSeyeonC09DialogueContinuityShadowRequestV1({
      context, request: candidateRequest(context),
    });
    expect(next.instructions).toContain('does not prove an offscreen activity happened');
    expect((next.input as Record<string, unknown>).c09DialogueContinuity)
      .toMatchObject({ authority: { mayAssertOffscreenEvents: false } });
  });

  it('rejects first contact, ungoverned calls, private memory, relationship and forged references', () => {
    const first = contextFor([threeTurns[0]!]);
    const valid = contextFor();
    const base = candidateRequest(valid);
    const negatives: SeyeonRuntimeContextV2[] = [
      first,
      { ...valid, integrity: { ...valid.integrity, governedPreflightApplied: false } },
      { ...valid, integrity: { ...valid.integrity, decisions: [{}] } } as unknown as SeyeonRuntimeContextV2,
      { ...valid, retrievedMemories: [{}] } as unknown as SeyeonRuntimeContextV2,
      { ...valid, relationship: { revision: 1 } } as unknown as SeyeonRuntimeContextV2,
      { ...valid, disclosure: { decision: null, retrievedSources: [{}] } } as unknown as SeyeonRuntimeContextV2,
      { ...valid, recentConversation: [...valid.recentConversation.slice(0, 2), { ...valid.recentConversation[2]!, messageId: 'a1' }] },
      { ...valid, recentConversation: valid.recentConversation.slice(0, 2) },
    ];
    for (const context of negatives) {
      expect(() => deriveSeyeonC09DialogueContinuityPacketShadowV1(context))
        .toThrow('C09_DIALOGUE_CONTINUITY_SHADOW_NOT_ELIGIBLE');
    }
    expect(() => composeSeyeonC09DialogueContinuityShadowRequestV1({
      context: valid,
      request: { ...base, input: { ...(base.input as object), context: { ...valid } } },
    })).toThrow('C09_DIALOGUE_CONTINUITY_SHADOW_NOT_ELIGIBLE');
    expect(() => composeSeyeonC09DialogueContinuityShadowRequestV1({
      context: valid,
      request: {
        ...base,
        input: {
          ...(base.input as object),
          allowedReferenceVocabulary: { noticeEvidenceRefs: ['u2'] },
        },
      },
    })).toThrow('C09_DIALOGUE_CONTINUITY_SHADOW_NOT_ELIGIBLE');
    expect(() => composeSeyeonC09DialogueContinuityShadowRequestV1({
      context: valid,
      request: { ...base, purpose: 'turn_interpretation' },
    })).toThrow('C09_DIALOGUE_CONTINUITY_SHADOW_NOT_ELIGIBLE');
  });
});
