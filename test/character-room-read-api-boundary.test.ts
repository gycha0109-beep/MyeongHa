import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/chat-receive.js';
import {
  readCharacterRoomState,
  readCharacterRoomStateByPresentationKey,
} from '../apps/api/src/character-room-read.js';
import type {
  CharacterPresentationIdentityAuthorityPortV1,
} from '../apps/api/src/character-presentation-resolver.js';
import type {
  CharacterRelationshipReadAuthorityPortV1,
} from '../apps/api/src/character-relationship-read.js';
import type {
  ChatThreadRuntimeBindingReadAuthorityPortV1,
} from '../apps/api/src/chat-thread-runtime-binding-read.js';
import type {
  ChatThreadStreamReadAuthorityPortV1,
} from '../apps/api/src/chat-thread-stream-read.js';

const streamAuthorityPort: ChatThreadStreamReadAuthorityPortV1 = {
  readStream: async () => [
    {
      messageId: 'message-1',
      sequenceNo: 1,
      senderType: 'user',
      characterId: null,
      bodyText: '요즘 선택 때문에 고민 중이에요.',
      messagePayloadJsonb: null,
      messageSchemaVersion: null,
      createdAt: '2026-08-31T12:00:00.000Z',
      redacted: false,
      redactedAt: null,
    },
    {
      messageId: 'message-2',
      sequenceNo: 2,
      senderType: 'character',
      characterId: 'character-baekheon',
      bodyText: '어떤 결과까지 감당할 수 있는지부터 봅시다.',
      messagePayloadJsonb: { presentation: 'dialogue' },
      messageSchemaVersion: 'dialogue-v1',
      createdAt: '2026-08-31T12:01:00.000Z',
      redacted: false,
      redactedAt: null,
    },
    {
      messageId: 'message-3',
      sequenceNo: 3,
      senderType: 'character',
      characterId: 'character-seyeon',
      bodyText: '다른 인물의 메시지입니다.',
      messagePayloadJsonb: null,
      messageSchemaVersion: null,
      createdAt: '2026-08-31T12:02:00.000Z',
      redacted: false,
      redactedAt: null,
    },
  ],
};

const relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1 = {
  readCurrentRelationship: async ({ characterId }) => [
    {
      stateId: 'relationship-1',
      characterId,
      closeness: 12,
      trust: 18,
      friction: 2,
      relationshipStage: 'acquainted',
      policyVersion: 'relationship-v1',
      revision: 3,
      lastInteractionAt: '2026-08-31T12:01:00.000Z',
      updatedAt: '2026-08-31T12:01:00.000Z',
    },
  ],
};

const threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1 = {
  readRuntimeBinding: async ({ threadId }) => [
    {
      threadId,
      status: 'active',
      activeContentReleaseId: 'release-active',
      activeContentBundleId: 'bundle-from-thread',
      contentRevision: 5,
      participantCharacterIds: ['character-baekheon', 'character-seyeon'],
    },
  ],
};

async function expectApiCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
  }
}

describe('Character Room authoritative read composition', () => {
  it('combines the owner-authorized message stream and stored relationship projection', async () => {
    const state = await readCharacterRoomState({
      resolvedSubjectId: 'subject-1',
      threadId: 'thread-1',
      characterId: 'character-baekheon',
      streamAuthorityPort,
      relationshipAuthorityPort,
    });

    expect(state.threadId).toBe('thread-1');
    expect(state.characterId).toBe('character-baekheon');
    expect(state.messages).toHaveLength(3);
    expect(state.lastSequenceNo).toBe(3);
    expect(state.relationship?.revision).toBe(3);
    expect(state.latestCharacterMessage?.messageId).toBe('message-2');
    expect(state.latestCharacterMessage?.bodyText).toBe(
      '어떤 결과까지 감당할 수 있는지부터 봅시다.',
    );
  });

  it('derives release/bundle from the owned thread before resolving the browser presentation key', async () => {
    let identityBundleId: string | null = null;
    const identityAuthorityPort: CharacterPresentationIdentityAuthorityPortV1 = {
      resolveCharacterIdentity: async ({ contentBundleId, presentationKey }) => {
        identityBundleId = contentBundleId;
        return [
          {
            presentationKey,
            characterId: 'character-baekheon',
            contentBundleId,
          },
        ];
      },
    };

    const state = await readCharacterRoomStateByPresentationKey({
      resolvedSubjectId: 'subject-1',
      threadId: 'thread-1',
      presentationKey: 'baekheon',
      threadBindingAuthorityPort,
      identityAuthorityPort,
      streamAuthorityPort,
      relationshipAuthorityPort,
    });

    expect(identityBundleId).toBe('bundle-from-thread');
    expect(state.presentationKey).toBe('baekheon');
    expect(state.characterId).toBe('character-baekheon');
    expect(state.characterId).not.toBe(state.presentationKey);
    expect(state.contentReleaseId).toBe('release-active');
    expect(state.contentBundleId).toBe('bundle-from-thread');
    expect(state.contentRevision).toBe(5);
    expect(state.latestCharacterMessage?.messageId).toBe('message-2');
    expect(state.relationship?.characterId).toBe('character-baekheon');
  });

  it('rejects a bundle-valid character that is not an active participant before reading room projections', async () => {
    let streamCalls = 0;
    let relationshipCalls = 0;
    const identityAuthorityPort: CharacterPresentationIdentityAuthorityPortV1 = {
      resolveCharacterIdentity: async ({ contentBundleId, presentationKey }) => [
        {
          presentationKey,
          characterId: 'character-yunho',
          contentBundleId,
        },
      ],
    };
    const guardedStreamPort: ChatThreadStreamReadAuthorityPortV1 = {
      readStream: async () => {
        streamCalls += 1;
        return [];
      },
    };
    const guardedRelationshipPort: CharacterRelationshipReadAuthorityPortV1 = {
      readCurrentRelationship: async () => {
        relationshipCalls += 1;
        return [];
      },
    };

    await expectApiCode(
      readCharacterRoomStateByPresentationKey({
        resolvedSubjectId: 'subject-1',
        threadId: 'thread-1',
        presentationKey: 'yunho',
        threadBindingAuthorityPort,
        identityAuthorityPort,
        streamAuthorityPort: guardedStreamPort,
        relationshipAuthorityPort: guardedRelationshipPort,
      }),
      'NOT_FOUND',
    );

    expect(streamCalls).toBe(0);
    expect(relationshipCalls).toBe(0);
  });

  it('does not synthesize a character message when the stored stream has none for that character', async () => {
    const state = await readCharacterRoomState({
      resolvedSubjectId: 'subject-1',
      threadId: 'thread-1',
      characterId: 'character-yunho',
      streamAuthorityPort,
      relationshipAuthorityPort,
    });

    expect(state.latestCharacterMessage).toBeNull();
  });

  it('preserves an empty stream without inventing history or advancing the sequence cursor', async () => {
    const emptyStreamPort: ChatThreadStreamReadAuthorityPortV1 = {
      readStream: async () => [],
    };

    const state = await readCharacterRoomState({
      resolvedSubjectId: 'subject-1',
      threadId: 'thread-empty',
      characterId: 'character-baekheon',
      afterSequenceNo: 7,
      streamAuthorityPort: emptyStreamPort,
      relationshipAuthorityPort,
    });

    expect(state.messages).toEqual([]);
    expect(state.latestCharacterMessage).toBeNull();
    expect(state.lastSequenceNo).toBe(7);
  });
});
