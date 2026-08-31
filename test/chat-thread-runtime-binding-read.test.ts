import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/chat-receive.js';
import {
  ChatThreadRuntimeBindingReadAuthorityPortErrorV1,
  getChatThreadRuntimeBinding,
  type ChatThreadRuntimeBindingReadAuthorityPortV1,
} from '../apps/api/src/chat-thread-runtime-binding-read.js';

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

function validPort(
  overrides: Partial<{
    threadId: string;
    status: string;
    activeContentReleaseId: string | null;
    activeContentBundleId: string | null;
    contentRevision: number;
    participantCharacterIds: readonly string[];
  }> = {},
): ChatThreadRuntimeBindingReadAuthorityPortV1 {
  return {
    readRuntimeBinding: async ({ threadId }) => [
      {
        threadId,
        status: 'active',
        activeContentReleaseId: 'release-active',
        activeContentBundleId: 'bundle-active',
        contentRevision: 4,
        participantCharacterIds: ['character-baekheon'],
        ...overrides,
      },
    ],
  };
}

describe('chat thread runtime binding read boundary', () => {
  it('returns the trusted active release, bundle, revision, and participants', async () => {
    const binding = await getChatThreadRuntimeBinding({
      resolvedSubjectId: 'subject-1',
      threadId: 'thread-1',
      authorityPort: validPort(),
    });

    expect(binding).toEqual({
      threadId: 'thread-1',
      activeContentReleaseId: 'release-active',
      activeContentBundleId: 'bundle-active',
      contentRevision: 4,
      participantCharacterIds: ['character-baekheon'],
    });
    expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.isFrozen(binding.participantCharacterIds)).toBe(true);
  });

  it('requires server-resolved subject identity before consulting persistence', async () => {
    let calls = 0;
    const authorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1 = {
      readRuntimeBinding: async () => {
        calls += 1;
        return [];
      },
    };

    await expectApiCode(
      getChatThreadRuntimeBinding({
        threadId: 'thread-1',
        authorityPort,
      }),
      'AUTH_REQUIRED',
    );
    expect(calls).toBe(0);
  });

  it('maps ownership and subject eligibility failures to NOT_FOUND', async () => {
    for (const failureCode of ['SUBJECT_INELIGIBLE', 'THREAD_UNAVAILABLE'] as const) {
      const authorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1 = {
        readRuntimeBinding: async () => {
          throw new ChatThreadRuntimeBindingReadAuthorityPortErrorV1(
            failureCode,
            'unavailable',
          );
        },
      };

      await expectApiCode(
        getChatThreadRuntimeBinding({
          resolvedSubjectId: 'subject-1',
          threadId: 'thread-1',
          authorityPort,
        }),
        'NOT_FOUND',
      );
    }
  });

  it('fails closed for missing, duplicate, or mismatched thread rows', async () => {
    const emptyPort: ChatThreadRuntimeBindingReadAuthorityPortV1 = {
      readRuntimeBinding: async () => [],
    };
    await expectApiCode(
      getChatThreadRuntimeBinding({
        resolvedSubjectId: 'subject-1',
        threadId: 'thread-1',
        authorityPort: emptyPort,
      }),
      'NOT_FOUND',
    );

    const duplicatePort: ChatThreadRuntimeBindingReadAuthorityPortV1 = {
      readRuntimeBinding: async () => [
        {
          threadId: 'thread-1',
          status: 'active',
          activeContentReleaseId: 'release-a',
          activeContentBundleId: 'bundle-a',
          contentRevision: 1,
          participantCharacterIds: ['character-a'],
        },
        {
          threadId: 'thread-1',
          status: 'active',
          activeContentReleaseId: 'release-a',
          activeContentBundleId: 'bundle-a',
          contentRevision: 1,
          participantCharacterIds: ['character-a'],
        },
      ],
    };
    await expect(
      getChatThreadRuntimeBinding({
        resolvedSubjectId: 'subject-1',
        threadId: 'thread-1',
        authorityPort: duplicatePort,
      }),
    ).rejects.toThrow('more than one thread row');

    await expect(
      getChatThreadRuntimeBinding({
        resolvedSubjectId: 'subject-1',
        threadId: 'thread-1',
        authorityPort: validPort({ threadId: 'thread-other' }),
      }),
    ).rejects.toThrow('different thread identity');
  });

  it('does not admit archived/deleted threads to active Character Room runtime use', async () => {
    for (const status of ['archived', 'deleted']) {
      await expectApiCode(
        getChatThreadRuntimeBinding({
          resolvedSubjectId: 'subject-1',
          threadId: 'thread-1',
          authorityPort: validPort({ status }),
        }),
        'NOT_FOUND',
      );
    }
  });

  it('rejects an unbound thread, invalid revision, empty participants, and duplicate participants', async () => {
    await expect(
      getChatThreadRuntimeBinding({
        resolvedSubjectId: 'subject-1',
        threadId: 'thread-1',
        authorityPort: validPort({ activeContentBundleId: null }),
      }),
    ).rejects.toThrow('active content bundle identity');

    await expect(
      getChatThreadRuntimeBinding({
        resolvedSubjectId: 'subject-1',
        threadId: 'thread-1',
        authorityPort: validPort({ contentRevision: -1 }),
      }),
    ).rejects.toThrow('invalid content revision');

    await expect(
      getChatThreadRuntimeBinding({
        resolvedSubjectId: 'subject-1',
        threadId: 'thread-1',
        authorityPort: validPort({ participantCharacterIds: [] }),
      }),
    ).rejects.toThrow('no active participants');

    await expect(
      getChatThreadRuntimeBinding({
        resolvedSubjectId: 'subject-1',
        threadId: 'thread-1',
        authorityPort: validPort({
          participantCharacterIds: ['character-a', 'character-a'],
        }),
      }),
    ).rejects.toThrow('duplicate active participants');
  });
});
