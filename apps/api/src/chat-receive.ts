import { createHash } from 'node:crypto';
import type { SajuDomain } from '../../../packages/contracts/src/index.js';
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
import { ApiCommandError } from './api-error.js';

export { ApiCommandError } from './api-error.js';

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
  };
  readonly requestedCharacterId?: string;
}

const serverPreparedChatReceivePlansV1 = new WeakSet<object>();
const internalPinnedSeyeonDogfoodPlansV1 = new WeakSet<object>();
const serverCompatiblePinnedSeyeonPlansV1 = new WeakSet<object>();
const serverPreparedChatReceiveContentEntriesV1 =
  new WeakMap<object, ContentReleaseRuntimeEntry>();

export function assertServerPreparedChatReceivePlanV1(
  plan: ChatReceivePlan,
): void {
  if (
    !serverPreparedChatReceivePlansV1.has(plan) &&
    !internalPinnedSeyeonDogfoodPlansV1.has(plan) &&
    !serverCompatiblePinnedSeyeonPlansV1.has(plan)
  ) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Chat receive plan was not minted by server receive authority.',
    );
  }
}

export function getServerPreparedChatReceiveContentEntryV1(
  plan: ChatReceivePlan,
): ContentReleaseRuntimeEntry {
  assertServerPreparedChatReceivePlanV1(plan);
  const entry = serverPreparedChatReceiveContentEntriesV1.get(plan);
  if (entry === undefined) {
    if (internalPinnedSeyeonDogfoodPlansV1.has(plan)) {
      throw new Error(
        'Internal pinned Se-yeon plan intentionally has no public client-compatibility content entry.',
      );
    }
    if (serverCompatiblePinnedSeyeonPlansV1.has(plan)) {
      throw new Error(
        'Server-compatible pinned Se-yeon plan carries compatibility authority outside ContentReleaseRuntime.',
      );
    }
    throw new Error(
      'Server-minted Chat receive plan lost its immutable content authority binding.',
    );
  }
  if (
    entry.release.releaseId !== plan.resolvedContent.releaseId ||
    entry.release.bundleId !== plan.resolvedContent.bundleId ||
    entry.release.contentVersion !== plan.resolvedContent.contentVersion
  ) {
    throw new Error(
      'Server-minted Chat receive plan no longer matches its immutable content authority binding.',
    );
  }
  return entry;
}

function hashRequest(request: ChatRequestV1): string {
  return `sha256:v1:${createHash('sha256')
    .update(canonicalJson(request))
    .digest('hex')}`;
}

export interface PrepareInternalPinnedSeyeonDogfoodReceiveInputV1 {
  readonly request: unknown;
  readonly trustedThread: TrustedThreadBinding;
  readonly pinnedBundleId: string;
  readonly contentVersion: string;
}

/**
 * Server-internal pinned Se-yeon receive authority.
 *
 * This helper does not grant browser compatibility authority. A public HTTP
 * adapter must first establish server-trusted client/content compatibility.
 */
export function prepareInternalPinnedSeyeonDogfoodReceivePlanV1(
  input: PrepareInternalPinnedSeyeonDogfoodReceiveInputV1,
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

  const threadId = input.trustedThread.threadId.trim();
  const releaseId = input.trustedThread.pinnedReleaseId.trim();
  const bundleId = input.pinnedBundleId.trim();
  const contentVersion = input.contentVersion.trim();

  if (
    threadId.length === 0 ||
    releaseId.length === 0 ||
    bundleId.length === 0 ||
    contentVersion.length === 0
  ) {
    throw new ApiCommandError(
      'CAPABILITY_UNAVAILABLE',
      'Pinned Se-yeon content binding is incomplete.',
    );
  }
  if (request.threadId !== threadId) {
    throw new ApiCommandError(
      'NOT_FOUND',
      'Chat request does not match the owned pinned thread.',
    );
  }
  if (request.text === undefined || request.structuredAction !== undefined) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Se-yeon Production runtime currently accepts text turns only.',
    );
  }
  if (
    input.trustedThread.participantCharacterIds.length !== 1 ||
    input.trustedThread.participantCharacterIds[0] !== 'seyeon'
  ) {
    throw new ApiCommandError(
      'FORBIDDEN',
      'Se-yeon Production runtime requires an existing single-character Se-yeon thread.',
    );
  }
  if (request.characterId !== undefined && request.characterId !== 'seyeon') {
    throw new ApiCommandError(
      'FORBIDDEN',
      'Se-yeon Production runtime cannot target another Character.',
    );
  }

  const plan = Object.freeze({
    normalizedRequest: request,
    requestHash: hashRequest(request),
    isNewThread: false,
    resolvedContent: Object.freeze({
      releaseId,
      bundleId,
      contentVersion,
    }),
    requestedCharacterId: 'seyeon',
  });
  internalPinnedSeyeonDogfoodPlansV1.add(plan);
  return plan;
}


export interface PrepareServerCompatiblePinnedSeyeonReceiveInputV1 {
  readonly clientTurnId: string;
  readonly text: string;
  readonly trustedThread: TrustedThreadBinding;
  readonly pinnedBundleId: string;
  readonly contentVersion: string;
  readonly clientCapability: string;
}

/**
 * Public-boundary server-minted pinned Se-yeon receive plan.
 *
 * The caller must already have established client/content compatibility from
 * server-owned authority. Browser input never supplies release, bundle,
 * character, or compatibility identity to this helper.
 */
export function prepareServerCompatiblePinnedSeyeonReceivePlanV1(
  input: PrepareServerCompatiblePinnedSeyeonReceiveInputV1,
): ChatReceivePlan {
  const plan = prepareInternalPinnedSeyeonDogfoodReceivePlanV1({
    request: Object.freeze({
      threadId: input.trustedThread.threadId,
      characterId: 'seyeon',
      clientTurnId: input.clientTurnId,
      text: input.text,
      clientCapability: input.clientCapability,
    }),
    trustedThread: input.trustedThread,
    pinnedBundleId: input.pinnedBundleId,
    contentVersion: input.contentVersion,
  });

  internalPinnedSeyeonDogfoodPlansV1.delete(plan);
  serverCompatiblePinnedSeyeonPlansV1.add(plan);
  return plan;
}

function mapReleaseError(error: unknown): never {
  if (error instanceof ContentReleaseRuntimeError) {
    if (error.code === 'COMPATIBILITY_AUTHORITY_UNAVAILABLE') {
      throw new ApiCommandError(
        'CAPABILITY_UNAVAILABLE',
        'Client/content compatibility authority is unavailable.',
      );
    }
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

  const plan = Object.freeze({
    normalizedRequest: request,
    requestHash: hashRequest(request),
    isNewThread,
    resolvedContent: Object.freeze({
      releaseId: entry.release.releaseId,
      bundleId: entry.release.bundleId,
      contentVersion: entry.release.contentVersion,
    }),
    ...(characterId === undefined ? {} : { requestedCharacterId: characterId }),
  });

  serverPreparedChatReceivePlansV1.add(plan);
  serverPreparedChatReceiveContentEntriesV1.set(plan, entry);
  return plan;
}
