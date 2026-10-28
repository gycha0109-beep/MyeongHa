import { describe, expect, it } from 'vitest';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from
  '../packages/character-content/src/runtime-authoring-v1.js';
import {
  CHARACTER_THREAD_SNAPSHOT_SHADOW_VERSION_V1,
  composeCharacterDialogueContinuityPlanShadowV1,
  deriveCharacterDialogueContinuityShadowV1,
  requireCharacterThreadSnapshotShadowV1,
  type CharacterDialogueMessageShadowV1,
  type CharacterThreadSnapshotShadowPortV1,
} from '../packages/domain/src/character-dialogue-continuity-shadow-v1.js';

const recentConversation: readonly CharacterDialogueMessageShadowV1[] = [
  { messageId: 'u1', role: 'user', text: '제 말이 맞죠?' },
  { messageId: 'a1', role: 'assistant', text: '저는 그 생각이 조금 다르네요.' },
  { messageId: 'u2', role: 'user', text: '왜 다르게 생각해요?' },
];

function source(characterId: string) {
  const voice = CHARACTER_RUNTIME_AUTHORING_V1.find(
    (candidate) => candidate.characterId === characterId,
  );
  if (!voice) throw new Error('test character missing from existing authoring');
  return voice;
}

function proofFor(characterId: string) {
  return {
    schemaVersion: CHARACTER_THREAD_SNAPSHOT_SHADOW_VERSION_V1,
    characterId,
    subjectId: 'owner-1',
    threadId: 'thread-1',
    currentUserMessageId: 'u2',
    messageCount: 3,
    latestSenderType: 'user',
    tailMessageRefs: ['u1', 'a1', 'u2'],
    complete: true,
  };
}

function port(characterId: string, data: unknown): CharacterThreadSnapshotShadowPortV1 {
  return {
    characterId,
    subjectId: 'owner-1',
    threadId: 'thread-1',
    readThreadSnapshot: () => data,
  };
}

describe('Common C1 Character continuity — existing 9-character authoring', () => {
  it('constructs the same governed continuity contract for all nine character IDs', () => {
    expect(CHARACTER_RUNTIME_AUTHORING_V1).toHaveLength(9);
    const profiles = CHARACTER_RUNTIME_AUTHORING_V1.map((voice) => {
      const plan = composeCharacterDialogueContinuityPlanShadowV1({
        voice, recentConversation,
      });
      expect(plan.packet.characterId).toBe(voice.characterId);
      expect(plan.packet.recentMessageRefs).toEqual(['u1', 'a1', 'u2']);
      expect(plan.packet.previousAssistantMessageRefs).toEqual(['a1']);
      expect(plan.packet.authority).toEqual({
        assistantUtterancesAreFacts: false,
        unverifiedUserClaimsAreFacts: false,
        mayAssertOffscreenEvents: false,
        mayCreateMemory: false,
        mayModifyRelationship: false,
        mayUnlockDisclosure: false,
      });
      expect(plan.decisionProfile.speechRegister).toBe(voice.speech.register);
      expect(plan.decisionProfile.thinkingTempo).toBe(voice.persona.cognition.thinkingTempo);
      expect(plan.decisionProfile.conflictStyle).toBe(voice.persona.conflict.confrontationStyle);
      expect(plan.decisionProfile.preferredQuestionStrategies)
        .toEqual(voice.persona.questioning.preferredStrategies);
      expect(plan.instructions).toContain('carry forward, challenge, refine, or explicitly change');
      expect(plan.instructions).toContain('previous assistant utterance proves only');
      expect(JSON.stringify(plan.packet)).not.toContain('생각이 조금');
      expect(Object.isFrozen(plan.packet)).toBe(true);
      expect(Object.isFrozen(plan.decisionProfile)).toBe(true);
      return JSON.stringify(plan.decisionProfile);
    });
    // Same engine, actual distinct authored profiles: not nine Se-yeon copies.
    expect(new Set(profiles).size).toBe(9);
  });

  it('holds a concrete different personality for Se-yeon, Yeoul, Seorin and Rahyeon', () => {
    const selected = ['seyeon', 'yeoul', 'seorin', 'rahyeon'].map((id) =>
      composeCharacterDialogueContinuityPlanShadowV1({
        voice: source(id),
        recentConversation,
      }).decisionProfile,
    );
    expect(selected.map((profile) => profile.characterId))
      .toEqual(['seyeon', 'yeoul', 'seorin', 'rahyeon']);
    expect(new Set(selected.map((profile) => profile.speechRegister)).size)
      .toBeGreaterThan(1);
    expect(new Set(selected.map((profile) => profile.conflictStyle)).size)
      .toBeGreaterThan(1);
  });

  it('rejects missing, duplicated and incorrectly ordered user/assistant dialogue', () => {
    const voice = source('seorin');
    const invalid: readonly (readonly CharacterDialogueMessageShadowV1[])[] = [
      recentConversation.slice(0, 1),
      recentConversation.slice(0, 2),
      [{ messageId: 'a1', role: 'assistant', text: 'hello' }, ...recentConversation],
      [...recentConversation.slice(0, 2), { ...recentConversation[2]!, messageId: 'a1' }],
      [...recentConversation.slice(0, 2), { ...recentConversation[2]!, text: '   ' }],
      Array.from({ length: 13 }, (_, i) => ({
        messageId: 'u' + i, role: i === 1 ? 'assistant' as const : 'user' as const,
        text: 'test',
      })),
    ];
    for (const messages of invalid) {
      expect(() => deriveCharacterDialogueContinuityShadowV1({
        voice, recentConversation: messages,
      })).toThrow('CHARACTER_DIALOGUE_CONTINUITY_SHADOW_NOT_ELIGIBLE');
    }
  });

  it('checks character ID, subject/thread and exact message order in one shared verifier', async () => {
    const packet = deriveCharacterDialogueContinuityShadowV1({
      voice: source('yeoul'), recentConversation,
    });
    await expect(requireCharacterThreadSnapshotShadowV1({
      packet, port: port('yeoul', proofFor('yeoul')),
    })).resolves.toBeUndefined();

    const invalid: readonly unknown[] = [
      { ...proofFor('yeoul'), characterId: 'seyeon' },
      { ...proofFor('yeoul'), subjectId: 'other' },
      { ...proofFor('yeoul'), threadId: 'other' },
      { ...proofFor('yeoul'), currentUserMessageId: 'u3' },
      { ...proofFor('yeoul'), tailMessageRefs: ['u1', 'u2', 'a1'] },
      { ...proofFor('yeoul'), messageCount: 2 },
      { ...proofFor('yeoul'), latestSenderType: 'assistant' },
      { ...proofFor('yeoul'), complete: false },
      { ...proofFor('yeoul'), privateExtraField: true },
      null,
    ];
    for (const data of invalid) {
      await expect(requireCharacterThreadSnapshotShadowV1({
        packet, port: port('yeoul', data),
      })).rejects.toThrow('CHARACTER_DIALOGUE_CONTINUITY_SHADOW_NOT_ELIGIBLE');
    }
    await expect(requireCharacterThreadSnapshotShadowV1({
      packet, port: port('seyeon', proofFor('yeoul')),
    })).rejects.toThrow('CHARACTER_DIALOGUE_CONTINUITY_SHADOW_NOT_ELIGIBLE');
    await expect(requireCharacterThreadSnapshotShadowV1({
      packet, port: undefined,
    })).rejects.toThrow('CHARACTER_DIALOGUE_CONTINUITY_SHADOW_NOT_ELIGIBLE');
    await expect(requireCharacterThreadSnapshotShadowV1({
      packet,
      port: {
        ...port('yeoul', proofFor('yeoul')),
        readThreadSnapshot: () => { throw new Error('secret'); },
      },
    })).rejects.toThrow('CHARACTER_DIALOGUE_CONTINUITY_SHADOW_NOT_ELIGIBLE');
  });

  it('does not turn a character previous offscreen claim into a durable fact', () => {
    const plan = composeCharacterDialogueContinuityPlanShadowV1({
      voice: source('rahyeon'),
      recentConversation: [
        { messageId: 'u1', role: 'user', text: '뭐 했어요?' },
        { messageId: 'a1', role: 'assistant', text: '어젯밤에 영화 봤어요.' },
        { messageId: 'u2', role: 'user', text: '그때 누구랑 봤어요?' },
      ],
    });
    expect(plan.packet.authority.mayAssertOffscreenEvents).toBe(false);
    expect(plan.packet.authority.mayCreateMemory).toBe(false);
    expect(plan.instructions).toContain('does not prove an offscreen activity happened');
  });
});
