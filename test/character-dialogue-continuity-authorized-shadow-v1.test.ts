import { describe, expect, it, vi } from 'vitest';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from
  '../packages/character-content/src/runtime-authoring-v1.js';
import type { CharacterRuntimeContextV1 } from
  '../packages/domain/src/character-runtime-context.js';
import type { PostgresSubjectExecutionScopeV1 } from
  '../apps/api/src/postgres-subject-execution.js';
import {
  prepareCharacterDialogueAuthorizedShadowV1,
} from '../apps/api/src/character-dialogue-continuity-authorized-shadow-v1.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const bundleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const releaseId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const threadId = '22222222-2222-4222-8222-222222222222';
const recentConversation = [
  { messageId: '33333333-3333-4333-8333-333333333333', role: 'user', text: '어떻게 생각하세요?' },
  { messageId: '44444444-4444-4444-8444-444444444444', role: 'assistant', text: '저는 조금 다르게 봐요.' },
  { messageId: '55555555-5555-4555-8555-555555555555', role: 'user', text: '이전 말씀 이유가 뭐죠?' },
] as const;

function runtime(characterId: string): CharacterRuntimeContextV1 {
  const authored = CHARACTER_RUNTIME_AUTHORING_V1.find((c) => c.characterId === characterId);
  if (!authored) throw new Error('Character authoring not found');
  // The test needs only the already-assembled, public C1 fields consumed by
  // this research adapter. It does NOT grant a fake production Canon.
  return {
    schemaVersion: 'v1',
    characterId,
    contentBundleId: bundleId,
    contentVersion: 'v1',
    speech: authored.speech,
    persona: authored.persona,
    behavior: authored.behavior,
    memories: [],
    lifeFacts: [],
    recentMessages: recentConversation.map((message) => message.text),
    saju: null,
  } as unknown as CharacterRuntimeContextV1;
}

function fixture(characterId: string, overrides: Record<string, unknown> = {}) {
  const row = {
    threadStatus: 'active',
    participantCharacterIds: [characterId],
    activeContentReleaseId: releaseId,
    activeContentBundleId: bundleId,
    contentRevision: '1',
    messageCount: '3',
    ineligibleMessageCount: '0',
    tailRows: recentConversation.map((message, index) => ({
      messageId: message.messageId,
      sequenceNo: index + 1,
      senderType: message.role === 'assistant' ? 'character' : 'user',
      characterId: message.role === 'assistant' ? characterId : null,
      bodyText: message.text,
      redacted: false,
    })),
    ...overrides,
  };
  const query = vi.fn(async (_sql: string, _values?: readonly unknown[]) => ({
    rows: [row],
  }));
  const scope = {
    resolvedSubject: { subjectId, subjectKind: 'member' },
    client: { query },
  } as unknown as PostgresSubjectExecutionScopeV1;
  return { scope, query };
}

describe('C1 common Character continuity authorized Shadow seam', () => {
  it.each(['seyeon', 'yeoul', 'seorin', 'rahyeon'])(
    'assembles existing %s runtime and verifies server records without a model call', async (id) => {
      const { scope, query } = fixture(id);
      const result = await prepareCharacterDialogueAuthorizedShadowV1({
        runtime: runtime(id), recentConversation, scope, threadId,
      });
      expect(result.scope).toBe('RESEARCH_SHADOW_NOT_PRODUCTION');
      expect(result.characterId).toBe(id);
      expect(result.dialoguePlan.packet.characterId).toBe(id);
      expect(result.dialoguePlan.decisionProfile.speechRegister)
        .toBe(runtime(id).speech.register);
      expect(result.mayInvokeProvider).toBe(false);
      expect(result.mayReveal).toBe(false);
      expect(result.revalidationRequiredBeforeModelOrReveal).toBe(true);
      expect(query).toHaveBeenCalledOnce();
      expect(Object.isFrozen(result)).toBe(true);
    },
  );

  it('rejects another character in the thread despite the authenticated user', async () => {
    const { scope } = fixture('seyeon');
    await expect(prepareCharacterDialogueAuthorizedShadowV1({
      runtime: runtime('yeoul'), scope, threadId, recentConversation,
    })).rejects.toThrow('CHARACTER_DIALOGUE_AUTHORIZED_SHADOW_UNAVAILABLE');
  });

  it('rejects a fabricated assistant line with genuine message IDs', async () => {
    const { scope } = fixture('seorin');
    const forged = recentConversation.map((message) =>
      message.role === 'assistant' ? { ...message, text: '제가 영화를 실제로 봤어요.' } : message);
    await expect(prepareCharacterDialogueAuthorizedShadowV1({
      runtime: runtime('seorin'), scope, threadId, recentConversation: forged,
    })).rejects.toThrow('CHARACTER_DIALOGUE_AUTHORIZED_SHADOW_UNAVAILABLE');
  });

  it('does not use privileged memory, personal facts or Saju in the public Shadow', async () => {
    const { scope, query } = fixture('rahyeon');
    const baseline = runtime('rahyeon');
    for (const disallowed of [
      { ...baseline, memories: [{ memoryItemId: 'private' }] },
      { ...baseline, lifeFacts: [{ factId: 'private' }] },
      { ...baseline, saju: { readingRef: 'unverified' } },
    ]) {
      await expect(prepareCharacterDialogueAuthorizedShadowV1({
        runtime: disallowed as CharacterRuntimeContextV1,
        scope, threadId, recentConversation,
      })).rejects.toThrow('CHARACTER_DIALOGUE_AUTHORIZED_SHADOW_UNAVAILABLE');
    }
    expect(query).not.toHaveBeenCalled();
  });
});

describe('C1 runtime transcript binding', () => {
  it('rejects a runtime carrying another dialogue even when the server source is valid', async () => {
    const { scope, query } = fixture('seyeon');
    await expect(prepareCharacterDialogueAuthorizedShadowV1({
      runtime: {
        ...runtime('seyeon'),
        recentMessages: ['다른 내용', recentConversation[1]!.text, recentConversation[2]!.text],
      },
      scope, threadId, recentConversation,
    })).rejects.toThrow('CHARACTER_DIALOGUE_AUTHORIZED_SHADOW_UNAVAILABLE');
    expect(query).not.toHaveBeenCalled();
  });
});