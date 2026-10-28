import { describe, expect, it, vi } from 'vitest';
import {
  CHARACTER_RUNTIME_AUTHORING_V1,
} from '../packages/character-content/src/runtime-authoring-v1.js';
import {
  composeCharacterDialogueContinuityPlanShadowV1,
  requireCharacterThreadSnapshotShadowV1,
  type CharacterDialogueMessageShadowV1,
} from '../packages/domain/src/character-dialogue-continuity-shadow-v1.js';
import {
  POSTGRES_CHARACTER_THREAD_SNAPSHOT_SHADOW_SQL_V1,
  createPostgresCharacterThreadSnapshotShadowV1,
} from '../apps/api/src/postgres-character-thread-snapshot-shadow-v1.js';
import type { PostgresSubjectExecutionScopeV1 } from
  '../apps/api/src/postgres-subject-execution.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const bundleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const releaseId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const threadId = '22222222-2222-4222-8222-222222222222';
const messages: readonly CharacterDialogueMessageShadowV1[] = [
  { messageId: '33333333-3333-4333-8333-333333333333', role: 'user', text: '제 말이 맞죠?' },
  { messageId: '44444444-4444-4444-8444-444444444444', role: 'assistant', text: '전 다르게 생각해요.' },
  { messageId: '55555555-5555-4555-8555-555555555555', role: 'user', text: '왜요?' },
];

function row(characterId: string) {
  return {
    threadStatus: 'active',
    participantCharacterIds: [characterId],
    activeContentReleaseId: releaseId,
    activeContentBundleId: bundleId,
    contentRevision: '1',
    messageCount: '3',
    ineligibleMessageCount: '0',
    tailRows: messages.map((m, index) => ({
      messageId: m.messageId,
      sequenceNo: index + 1,
      senderType: m.role === 'assistant' ? 'character' : 'user',
      characterId: m.role === 'assistant' ? characterId : null,
      bodyText: m.text,
      redacted: false,
    })),
  };
}

function fixture(characterId: string, raw: unknown = row(characterId)) {
  const query = vi.fn(async (_sql: string, _values?: readonly unknown[]) => ({ rows: Array.isArray(raw) ? raw : [raw] }));
  const scope = {
    resolvedSubject: { subjectId, subjectKind: 'member' as const },
    client: { query },
  } as unknown as PostgresSubjectExecutionScopeV1;
  const port = createPostgresCharacterThreadSnapshotShadowV1({
    scope, threadId, characterId, recentConversation: messages,
    expectedContentBundleId: bundleId,
  });
  const voice = CHARACTER_RUNTIME_AUTHORING_V1.find((item) => item.characterId === characterId);
  if (!voice) throw new Error('existing character authoring missing');
  const packet = composeCharacterDialogueContinuityPlanShadowV1({
    voice, recentConversation: messages,
  }).packet;
  return { query, port, packet };
}

describe('PostgreSQL subject-scoped Character thread snapshot Shadow', () => {
  it.each(['seyeon', 'yeoul', 'seorin', 'rahyeon'])(
    'binds real DB-shaped history to %s without changing the common verifier', async (id) => {
      const { query, port, packet } = fixture(id);
      await expect(requireCharacterThreadSnapshotShadowV1({ packet, port }))
        .resolves.toBeUndefined();
      expect(query).toHaveBeenCalledOnce();
      expect(query.mock.calls[0]?.[0]).toBe(POSTGRES_CHARACTER_THREAD_SNAPSHOT_SHADOW_SQL_V1);
      expect(query.mock.calls[0]?.[1]).toEqual([subjectId, threadId, id]);
    },
  );

  it('uses an existing subject-scoped thread binding and counts redacted/system rows, including old history', () => {
    expect(POSTGRES_CHARACTER_THREAD_SNAPSHOT_SHADOW_SQL_V1)
      .toContain('public.qry_chat_thread_runtime_binding_v1($1::uuid, $2::uuid)');
    expect(POSTGRES_CHARACTER_THREAD_SNAPSHOT_SHADOW_SQL_V1)
      .toContain('m.subject_id = $1::uuid');
    expect(POSTGRES_CHARACTER_THREAD_SNAPSHOT_SHADOW_SQL_V1)
      .toContain('m.thread_id = $2::uuid');
    expect(POSTGRES_CHARACTER_THREAD_SNAPSHOT_SHADOW_SQL_V1)
      .toContain('m.redacted_at is not null');
    expect(POSTGRES_CHARACTER_THREAD_SNAPSHOT_SHADOW_SQL_V1)
      .toContain('count(*)::text from all_messages');
    expect(POSTGRES_CHARACTER_THREAD_SNAPSHOT_SHADOW_SQL_V1)
      .toContain('order by "sequenceNo" desc limit 12');
  });

  it('rejects a changed dialogue body even when all message IDs still match', async () => {
    const altered = row('seyeon');
    altered.tailRows[1]!.bodyText = '뭐든 맞다고 할게요.';
    const { port, packet } = fixture('seyeon', altered);
    await expect(requireCharacterThreadSnapshotShadowV1({ port, packet }))
      .rejects.toThrow('CHARACTER_DIALOGUE_CONTINUITY_SHADOW_NOT_ELIGIBLE');
  });

  it('rejects other character/source, incomplete/redacted/system, duplicate and stale records', async () => {
    const base = row('yeoul');
    const scenarios = [
      { ...base, participantCharacterIds: ['seyeon'] },
      { ...base, participantCharacterIds: ['yeoul', 'seyeon'] },
      { ...base, threadStatus: 'archived' },
      { ...base, messageCount: '2' },
      { ...base, ineligibleMessageCount: '1' },
      { ...base, ineligibleMessageCount: 'not-count' },
      { ...base, tailRows: base.tailRows.slice(1) },
      { ...base, tailRows: base.tailRows.map((m, i) =>
        i === 2 ? { ...m, messageId: '44444444-4444-4444-8444-444444444444' } : m) },
      { ...base, tailRows: base.tailRows.map((m, i) =>
        i === 2 ? { ...m, senderType: 'character', characterId: 'yeoul' } : m) },
      { ...base, tailRows: base.tailRows.map((m, i) =>
        i === 1 ? { ...m, redacted: true } : m) },
      { ...base, tailRows: base.tailRows.map((m, i) =>
        i === 1 ? { ...m, sequenceNo: 1 } : m) },
      null,
    ];
    for (const scenario of scenarios) {
      const { port, packet } = fixture('yeoul', scenario);
      await expect(requireCharacterThreadSnapshotShadowV1({ port, packet }))
        .rejects.toThrow('CHARACTER_DIALOGUE_CONTINUITY_SHADOW_NOT_ELIGIBLE');
    }
  });

  it('rejects stale owner/thread/character request before PostgreSQL query', async () => {
    const { query, port } = fixture('seorin');
    await expect(port.readThreadSnapshot({
      characterId: 'seyeon', subjectId, threadId,
      currentUserMessageId: messages[2]!.messageId,
    })).rejects.toThrow('CHARACTER_THREAD_SNAPSHOT_UNVERIFIABLE');
    await expect(port.readThreadSnapshot({
      characterId: 'seorin', subjectId: 'other', threadId,
      currentUserMessageId: messages[2]!.messageId,
    })).rejects.toThrow('CHARACTER_THREAD_SNAPSHOT_UNVERIFIABLE');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects missing resolved scope and database errors without leaking backend text', async () => {
    const badScope = {
      resolvedSubject: { subjectId: 'unresolved', subjectKind: 'member' },
      client: { query: vi.fn() },
    } as unknown as PostgresSubjectExecutionScopeV1;
    expect(() => createPostgresCharacterThreadSnapshotShadowV1({
      scope: badScope,
      threadId,
      characterId: 'seorin',
      recentConversation: messages,
      expectedContentBundleId: bundleId,
    })).toThrow('CHARACTER_THREAD_SNAPSHOT_UNVERIFIABLE');

    const { port } = fixture('seyeon');
    const throwing = createPostgresCharacterThreadSnapshotShadowV1({
      scope: {
        resolvedSubject: { subjectId, subjectKind: 'guest' },
        client: { query: () => { throw new Error('sensitive DB detail'); } },
      } as unknown as PostgresSubjectExecutionScopeV1,
      characterId: 'seyeon', threadId, recentConversation: messages,
      expectedContentBundleId: bundleId,
    });
    await expect(throwing.readThreadSnapshot({
      characterId: 'seyeon', subjectId, threadId,
      currentUserMessageId: messages[2]!.messageId,
    })).rejects.toThrow('CHARACTER_THREAD_SNAPSHOT_UNVERIFIABLE');
    expect(port.characterId).toBe('seyeon');
  });
});

describe('content binding and failed read invalidation', () => {
  it('does not expose the content pin until an authenticated source check succeeds', async () => {
    const { port, packet } = fixture('seorin');
    expect(() => port.readVerifiedContentBinding()).toThrow(
      'CHARACTER_THREAD_SNAPSHOT_UNVERIFIABLE',
    );
    await requireCharacterThreadSnapshotShadowV1({ packet, port });
    expect(port.readVerifiedContentBinding()).toEqual({
      activeContentReleaseId: releaseId,
      activeContentBundleId: bundleId,
      contentRevision: 1,
    });
    await expect(port.readThreadSnapshot({
      characterId: 'seyeon',
      subjectId,
      threadId,
      currentUserMessageId: messages[2]!.messageId,
    })).rejects.toThrow('CHARACTER_THREAD_SNAPSHOT_UNVERIFIABLE');
    expect(() => port.readVerifiedContentBinding()).toThrow(
      'CHARACTER_THREAD_SNAPSHOT_UNVERIFIABLE',
    );
  });

  it('rejects non-decimal bigint revisions and an unexpected release binding', async () => {
    for (const revision of ['NaN', '-1', '9007199254740992']) {
      const { port, packet } = fixture('yeoul', {
        ...row('yeoul'), contentRevision: revision,
      });
      await expect(requireCharacterThreadSnapshotShadowV1({ port, packet }))
        .rejects.toThrow('CHARACTER_DIALOGUE_CONTINUITY_SHADOW_NOT_ELIGIBLE');
    }
  });
});
