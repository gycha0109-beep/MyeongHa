import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  prepareChatReceiveCommand,
} from '../apps/api/src/index.js';
import { buildCharacterContentManifest } from '../packages/character-content/src/index.js';
import {
  buildCoherentContentRelease,
  buildWorldContentManifest,
  ContentReleaseRuntime,
  type ContentReleaseRuntimeEntry,
} from '../packages/world-content/src/index.js';
import {
  DEV_CHARACTER_CONTENT_BUNDLE,
  DEV_WORLD_CONTENT_BUNDLE,
} from '../packages/test-fixtures/src/index.js';

const characterManifest = buildCharacterContentManifest(
  DEV_CHARACTER_CONTENT_BUNDLE,
);
const worldManifest = buildWorldContentManifest(
  DEV_WORLD_CONTENT_BUNDLE,
  DEV_CHARACTER_CONTENT_BUNDLE,
);

function releaseEntry(
  releaseId: string,
  lifecycle: 'active' | 'retired',
): ContentReleaseRuntimeEntry {
  return {
    release: buildCoherentContentRelease(
      releaseId,
      characterManifest,
      worldManifest,
    ),
    characters: DEV_CHARACTER_CONTENT_BUNDLE,
    world: DEV_WORLD_CONTENT_BUNDLE,
    lifecycle,
  };
}

function runtime(
  entries: readonly ContentReleaseRuntimeEntry[] = [releaseEntry('active-v1', 'active')],
) {
  return new ContentReleaseRuntime(entries);
}

function expectApiCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
  }
}

describe('chat receive command planner', () => {
  it('fails closed for a new thread while SRC-15 compatibility authority is unresolved', () => {
    expectApiCode(
      () =>
        prepareChatReceiveCommand({
          request: {
            clientTurnId: 'turn-1',
            characterId: 'john-doe-02',
            text: '진로가 궁금합니다.',
            clientCapability: '0.0.1-dev',
          },
          releaseRuntime: runtime(),
          orderedReleaseIdsForNewThread: ['active-v1'],
        }),
      'CAPABILITY_UNAVAILABLE',
    );
  });

  it('does not treat equality with minClientCapability as an authoritative activation verdict', () => {
    expectApiCode(
      () =>
        prepareChatReceiveCommand({
          request: {
            clientTurnId: 'turn-equal',
            text: 'hello',
            clientCapability: characterManifest.minClientCapability,
          },
          releaseRuntime: runtime(),
          orderedReleaseIdsForNewThread: ['active-v1'],
        }),
      'CAPABILITY_UNAVAILABLE',
    );
  });

  it('fails closed for an existing pinned thread instead of inventing compatibility', () => {
    expectApiCode(
      () =>
        prepareChatReceiveCommand({
          request: {
            threadId: 'thread-1',
            clientTurnId: 'turn-2',
            text: '이어갈게요.',
            clientCapability: 'future-client',
          },
          releaseRuntime: runtime([
            releaseEntry('retired-pinned', 'retired'),
            releaseEntry('current', 'active'),
          ]),
          trustedThread: {
            threadId: 'thread-1',
            pinnedReleaseId: 'retired-pinned',
            participantCharacterIds: ['john-doe-02'],
          },
        }),
      'CAPABILITY_UNAVAILABLE',
    );
  });

  it('maps malformed chat shapes to INVALID_REQUEST before content resolution', () => {
    expectApiCode(
      () =>
        prepareChatReceiveCommand({
          request: {
            clientTurnId: 'turn-invalid',
            text: 'hello',
            structuredAction: {
              type: 'SELECT_SAJU_DOMAIN',
              version: 'v1',
              domain: 'career',
            },
            clientCapability: '0.0.1-dev',
          },
          releaseRuntime: runtime(),
          orderedReleaseIdsForNewThread: ['active-v1'],
        }),
      'INVALID_REQUEST',
    );
  });

  it('does not trust a client thread id without the matching server binding', () => {
    expectApiCode(
      () =>
        prepareChatReceiveCommand({
          request: {
            threadId: 'client-thread',
            clientTurnId: 'turn-4',
            text: 'hello',
            clientCapability: '0.0.1-dev',
          },
          releaseRuntime: runtime(),
          trustedThread: {
            threadId: 'different-thread',
            pinnedReleaseId: 'active-v1',
            participantCharacterIds: ['john-doe-02'],
          },
        }),
      'NOT_FOUND',
    );
  });

  it('rejects a trusted thread binding on a new-thread request before content resolution', () => {
    expectApiCode(
      () =>
        prepareChatReceiveCommand({
          request: {
            clientTurnId: 'turn-new-with-binding',
            text: 'hello',
            clientCapability: '0.0.1-dev',
          },
          releaseRuntime: runtime(),
          trustedThread: {
            threadId: 'server-thread',
            pinnedReleaseId: 'active-v1',
            participantCharacterIds: ['john-doe-02'],
          },
          orderedReleaseIdsForNewThread: ['active-v1'],
        }),
      'INVALID_REQUEST',
    );
  });
});
