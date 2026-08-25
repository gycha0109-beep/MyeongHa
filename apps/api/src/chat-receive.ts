import { createHash } from 'node:crypto';
import type { ApiErrorCode, SajuDomain } from '../../../packages/contracts/src/index.js';
import {
  parseChatRequestV1,
  type ChatRequestV1,
} from '../../../packages/contracts/src/chat-request.js';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import {
  ContentReleaseRuntime,
  ContentReleaseRuntimeError,
  type ContentReleaseRuntimeEntry,
} from '../../../packages/world-content/src/index.js';

export interface TrustedThreadBinding {
  readonly threadId: string;
  readonly pinnedReleaseId: string;
  readonly participantCharacterIds: readonly string[];
}

export interface PrepareChatReceiveInput {
  readonly request: unknown;
  readonly releaseRuntime: ContentReleaseRuntime;
  readonly trustedThread?: TrustedThreadBinding;
  readonly orderedReleaseIdsForNewThread?: readonly string[];
}

export interface ChatReceivePlan {
  readonly normalizedRequest: ChatRequestV1;
  readonly requestHash: string;
  readonly isNewThread: boolean;
  readonly resolvedContent: {
    readonly releaseId: string;
    readonly bundleId: string;
    readonly contentVersion: string;
    readonly compatibilityPolicyVersion: string;
  };
  readonly requestedCharacterId?: string;
}

export class ApiCommandError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiCommandError';
  }
}

function hashRequest(request: ChatRequestV1): string {
  return `sha256:v1:${createHash('sha256')
    .update(canonicalJson(request))
    .digest('hex')}`;
}

function mapReleaseError(error: unknown): never {
  if (error instanceof ContentReleaseRuntimeError) {
    throw new ApiCommandError(
      'CONTENT_INCOMPATIBLE',
      'Requested content cannot be resolved for this client.',
    );
  }
  throw error;
}

function findCharacter(entry: ContentReleaseRuntimeEntry, characterId: string) {
  return entry.characters.characters.find(
    (character) => character.characterId === characterId,
  );
}

function assertCharacterDomain(
  entry: ContentReleaseRuntimeEntry,
  characterId: string,
  domain: SajuDomain,
): void {
  const character = findCharacter(entry, characterId);
  if (character === undefined) {
    throw new ApiCommandError('NOT_FOUND', 'Character is not available in this content release.');
  }
  if (!character.capabilities.some((capability) => capability.domain === domain)) {
    throw new ApiCommandError(
      'CAPABILITY_UNAVAILABLE',
      'Character does not have the requested Saju domain capability.',
    );
  }
}

function resolveContent(
  request: ChatRequestV1,
  input: PrepareChatReceiveInput,
): { readonly entry: ContentReleaseRuntimeEntry; readonly isNewThread: boolean } {
  try {
    if (request.threadId !== undefined) {
      if (
        input.trustedThread === undefined ||
        input.trustedThread.threadId !== request.threadId
      ) {
        throw new ApiCommandError('NOT_FOUND', 'Conversation thread was not found.');
      }
      return {
        entry: input.releaseRuntime.assertPinnedClientCompatible(
          input.trustedThread.pinnedReleaseId,
          request.clientCapability,
        ),
        isNewThread: false,
      };
    }

    if (input.trustedThread !== undefined) {
      throw new ApiCommandError(
        'INVALID_REQUEST',
        'A trusted thread binding cannot be supplied for a new-thread request.',
      );
    }
    if (input.orderedReleaseIdsForNewThread === undefined) {
      throw new ApiCommandError(
        'CAPABILITY_UNAVAILABLE',
        'New-thread content release order is unavailable.',
      );
    }
    return {
      entry: input.releaseRuntime.resolveForNewThread({
        clientCapability: request.clientCapability,
        orderedReleaseIds: input.orderedReleaseIdsForNewThread,
      }),
      isNewThread: true,
    };
  } catch (error) {
    if (error instanceof ApiCommandError) throw error;
    return mapReleaseError(error);
  }
}

export function prepareChatReceiveCommand(
  input: PrepareChatReceiveInput,
): ChatReceivePlan {
  let request: ChatRequestV1;
  try {
    request = parseChatRequestV1(input.request);
  } catch (error) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      error instanceof Error ? error.message : 'Invalid chat request.',
    );
  }

  const { entry, isNewThread } = resolveContent(request, input);
  const characterId = request.characterId;

  if (characterId !== undefined) {
    if (findCharacter(entry, characterId) === undefined) {
      throw new ApiCommandError('NOT_FOUND', 'Character is not available in this content release.');
    }
    if (
      !isNewThread &&
      input.trustedThread !== undefined &&
      !input.trustedThread.participantCharacterIds.includes(characterId)
    ) {
      throw new ApiCommandError(
        'FORBIDDEN',
        'Character is not an active participant in this conversation thread.',
      );
    }
    if (request.structuredAction?.type === 'SELECT_SAJU_DOMAIN') {
      assertCharacterDomain(entry, characterId, request.structuredAction.domain);
    }
  }

  return Object.freeze({
    normalizedRequest: request,
    requestHash: hashRequest(request),
    isNewThread,
    resolvedContent: Object.freeze({
      releaseId: entry.release.releaseId,
      bundleId: entry.release.bundleId,
      contentVersion: entry.release.contentVersion,
      compatibilityPolicyVersion: input.releaseRuntime.compatibilityPolicy.policyVersion,
    }),
    ...(characterId === undefined ? {} : { requestedCharacterId: characterId }),
  });
}
