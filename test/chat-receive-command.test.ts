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
  type ContentCompatibilityPolicy,
  type ContentReleaseRuntimeEntry,
} from '../packages/world-content/src/index.js';
import {
  DEV_CHARACTER_CONTENT_BUNDLE,
  DEV_WORLD_CONTENT_BUNDLE,
} from '../packages/test-fixtures/src/index.js';

const compatibilityPolicy: ContentCompatibilityPolicy = {
  policyVersion: 'chat-test-capability-v1',
  supports(clientCapability, minimum) {
    return clientCapability === minimum || clientCapability === 'future-client';
  },
};

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
  return new ContentReleaseRuntime(entries, compatibilityPolicy);
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
  it('normalizes a new-thread request and pins the operationally resolved release', () => {
    const command = prepareChatReceiveCommand({
      request: {
        clientTurnId: ' turn-1 ',
        characterId: 'john-doe-02',
        text: '  진로가 궁금합니다.  ',
        clientCapability: '0.0.1-dev',
      },
      releaseRuntime: runtime(),
      orderedReleaseIdsForNewThread: ['active-v1'],
    });

    expect(command).toMatchObject({
      isNewThread: true,
      normalizedRequest: {
        clientTurnId: 'turn-1',
        characterId: 'john-doe-02',
        text: '진로가 궁금합니다.',
      },
      resolvedContent: {
        releaseId: 'active-v1',
        bundleId: 'dev-content-bundle-0001',
        compatibilityPolicyVersion: 'chat-test-capability-v1',
      },
      requestedCharacterId: 'john-doe-02',
    });
    expect(command.requestHash).toMatch(/^sha256:v1:[a-f0-9]{64}$/u);
  });

  it('produces the same canonical request hash for equivalent normalized input', () => {
    const first = prepareChatReceiveCommand({
      request: {
        clientTurnId: 'same-turn',
        text: ' hello ',
        clientCapability: '0.0.1-dev',
      },
      releaseRuntime: runtime(),
      orderedReleaseIdsForNewThread: ['active-v1'],
    });
    const second = prepareChatReceiveCommand({
      request: {
        clientCapability: '0.0.1-dev',
        text: 'hello',
        clientTurnId: 'same-turn',
      },
      releaseRuntime: runtime(),
      orderedReleaseIdsForNewThread: ['active-v1'],
    });

    expect(second.requestHash).toBe(first.requestHash);
  });

  it('maps malformed chat shapes to INVALID_REQUEST', () => {
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

  it('keeps an existing thread on its retired pinned release', () => {
    const command = prepareChatReceiveCommand({
      request: {
        threadId: 'thread-1',
        clientTurnId: 'turn-2',
        text: '이어갈게요.',
        clientCapability: '0.0.1-dev',
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
    });

    expect(command.isNewThread).toBe(false);
    expect(command.resolvedContent.releaseId).toBe('retired-pinned');
  });

  it('fails closed instead of silently upgrading an incompatible pinned thread', () => {
    expectApiCode(
      () =>
        prepareChatReceiveCommand({
          request: {
            threadId: 'thread-1',
            clientTurnId: 'turn-3',
            text: '이어갈게요.',
            clientCapability: 'old-client',
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
      'CONTENT_INCOMPATIBLE',
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

  it('rejects a character outside the resolved bundle or existing thread participants', () => {
    expectApiCode(
      () =>
        prepareChatReceiveCommand({
          request: {
            clientTurnId: 'turn-5',
            characterId: 'future-character',
            text: 'hello',
            clientCapability: '0.0.1-dev',
          },
          releaseRuntime: runtime(),
          orderedReleaseIdsForNewThread: ['active-v1'],
        }),
      'NOT_FOUND',
    );

    expectApiCode(
      () =>
        prepareChatReceiveCommand({
          request: {
            threadId: 'thread-2',
            clientTurnId: 'turn-6',
            characterId: 'john-doe-03',
            text: 'hello',
            clientCapability: '0.0.1-dev',
          },
          releaseRuntime: runtime(),
          trustedThread: {
            threadId: 'thread-2',
            pinnedReleaseId: 'active-v1',
            participantCharacterIds: ['john-doe-02'],
          },
        }),
      'FORBIDDEN',
    );
  });

  it('early-rejects a selected Saju domain that the requested character cannot serve', () => {
    expectApiCode(
      () =>
        prepareChatReceiveCommand({
          request: {
            clientTurnId: 'turn-7',
            characterId: 'john-doe-02',
            structuredAction: {
              type: 'SELECT_SAJU_DOMAIN',
              version: 'v1',
              domain: 'relationship',
            },
            clientCapability: '0.0.1-dev',
          },
          releaseRuntime: runtime(),
          orderedReleaseIdsForNewThread: ['active-v1'],
        }),
      'CAPABILITY_UNAVAILABLE',
    );
  });

  it('accepts a selected Saju domain that exists in the requested character capability', () => {
    const command = prepareChatReceiveCommand({
      request: {
        clientTurnId: 'turn-8',
        characterId: 'john-doe-02',
        structuredAction: {
          type: 'SELECT_SAJU_DOMAIN',
          version: 'v1',
          domain: 'career',
        },
        clientCapability: '0.0.1-dev',
      },
      releaseRuntime: runtime(),
      orderedReleaseIdsForNewThread: ['active-v1'],
    });

    expect(command.requestedCharacterId).toBe('john-doe-02');
  });
});
