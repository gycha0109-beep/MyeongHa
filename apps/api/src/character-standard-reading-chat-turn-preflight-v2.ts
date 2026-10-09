import { assembleCharacterRuntimeContext } from '../../../packages/domain/src/index.js';
import type { CharacterRuntimeContextV2 } from '../../../packages/domain/src/character-saju-runtime-v2.js';
import {
  getServerPreparedChatReceiveContentEntryV1,
} from './chat-receive.js';
import {
  prepareOfficialReadingReaderAdmissionV1,
  type OfficialReadingReaderAdmissionScopeV1,
} from './official-reading-reader-admission-v1.js';
import {
  issueCharacterSajuOfficialStandardEligibilityV2,
} from './character-saju-official-eligibility-v2.js';
import {
  assembleOfficialStandardReaderRuntimeV2,
} from './character-saju-runtime-v2-bridge.js';
import {
  assertNoCallerContentAuthorityFields,
  prepareCharacterStandardReadingServerBaseContextV2,
} from './character-standard-reading-server-runtime-authority.js';
import type {
  PrepareCharacterStandardReadingChatTurnPreflightInputV1,
} from './character-standard-reading-chat-turn-preflight.js';
import type {
  ChatThreadRuntimeBindingV1,
} from './chat-thread-runtime-binding-read.js';

/**
 * Internal Official Standard Reading follow-up admission only.
 * A resolved Subject and exact Reading selector are server-owned inputs,
 * never proof of access by themselves.
 */
export type PrepareCharacterStandardReadingChatTurnPreflightInputV2 =
  PrepareCharacterStandardReadingChatTurnPreflightInputV1 & Readonly<{
    resolvedSubjectId: string;
  }>;

export interface CharacterStandardReadingChatTurnPreflightV2 {
  readonly receivePlan: PrepareCharacterStandardReadingChatTurnPreflightInputV2['receivePlan'];
  readonly threadBinding: ChatThreadRuntimeBindingV1;
  readonly scope: OfficialReadingReaderAdmissionScopeV1;
  readonly runtime: CharacterRuntimeContextV2;
}

const mintedStandardChatPreflightsV2 = new WeakSet<object>();

/** Downstream must reject structural clones before resolving an Official source. */
export function assertServerPreparedStandardChatPreflightV2(
  candidate: unknown,
): asserts candidate is CharacterStandardReadingChatTurnPreflightV2 {
  if (typeof candidate !== 'object' || candidate === null ||
      !mintedStandardChatPreflightsV2.has(candidate)) {
    throw new CharacterStandardReadingChatTurnPreflightErrorV2('ACCESS_DENIED');
  }
}

export class CharacterStandardReadingChatTurnPreflightErrorV2 extends Error {
  constructor(
    readonly code: 'INVALID_REQUEST' | 'ACCESS_DENIED' | 'SOURCE_MISMATCH',
  ) {
    super('Official standard Reader follow-up admission is unavailable.');
    this.name = 'CharacterStandardReadingChatTurnPreflightErrorV2';
  }
}

function deny(
  code: CharacterStandardReadingChatTurnPreflightErrorV2['code'],
): never {
  throw new CharacterStandardReadingChatTurnPreflightErrorV2(code);
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    return deny('INVALID_REQUEST');
  }
  return value;
}

function sameScope(
  first: OfficialReadingReaderAdmissionScopeV1,
  current: OfficialReadingReaderAdmissionScopeV1,
): boolean {
  const keys = Object.keys(first) as (keyof OfficialReadingReaderAdmissionScopeV1)[];
  return keys.length === Object.keys(current).length &&
    keys.every((key) => first[key] === current[key]);
}

/**
 * A3-epsilon: non-generative, server-only Chat V2 preflight.
 *
 * Checks exact purchase-backed A2 admission twice around server-side
 * Character/relationship/Memory resolution, then mints and consumes one-use
 * standard A3 eligibility. The legacy specialist V1 path is not touched.
 *
 * This result is NOT authorization to generate, commit, replay or reveal an
 * assistant turn. Those operations require a separate, atomic final check.
 * No public HTTP route or activation flag is wired by this function.
 */
export async function prepareCharacterStandardReadingChatTurnPreflightV2(
  input: PrepareCharacterStandardReadingChatTurnPreflightInputV2,
): Promise<CharacterStandardReadingChatTurnPreflightV2> {
  // Reject caller-supplied Character, Memory, Saju or world facts before any
  // access, source or Product lookup.
  assertNoCallerContentAuthorityFields(input.contextInput);
  if (!input.productReaderEligibilityAuthorityPort) deny('ACCESS_DENIED');

  const subjectId = requiredString(input.resolvedSubjectId);
  const readingId = requiredString(input.readingId);
  const effectiveAt = requiredString(input.effectiveAt);
  if (!Number.isFinite(Date.parse(effectiveAt))) deny('INVALID_REQUEST');

  // The plan must be minted by the immutable-release Chat receive authority.
  // Internal pinned Se-yeon plans without a ContentReleaseRuntime entry are
  // intentionally not eligible for this generic Official Reading path.
  const contentEntry = getServerPreparedChatReceiveContentEntryV1(input.receivePlan);
  const request = input.receivePlan.normalizedRequest;
  if (input.receivePlan.isNewThread || request.threadId === undefined ||
      typeof request.text !== 'string' || request.text.trim().length === 0 ||
      request.structuredAction !== undefined) deny('INVALID_REQUEST');

  const admissionInput = {
    resolvedSubjectId: subjectId,
    threadId: request.threadId,
    readingId,
    effectiveAt,
    contentEntry,
    threadBindingAuthorityPort: input.threadBindingAuthorityPort,
    accessAuthorityPort: input.accessAuthorityPort,
    artifactAuthorityPort: input.artifactAuthorityPort,
    productReaderEligibilityAuthorityPort: input.productReaderEligibilityAuthorityPort,
  };

  let first;
  try {
    first = await prepareOfficialReadingReaderAdmissionV1(admissionInput);
  } catch {
    return deny('ACCESS_DENIED');
  }

  const original = first.scope;
  if (original.subjectId !== subjectId ||
      original.readingId !== readingId ||
      original.threadId !== request.threadId ||
      original.contentReleaseId !== input.receivePlan.resolvedContent.releaseId ||
      original.readerContentBundleId !== input.receivePlan.resolvedContent.bundleId ||
      (request.characterId !== undefined && request.characterId !== original.readerCharacterId) ||
      (input.receivePlan.requestedCharacterId !== undefined &&
        input.receivePlan.requestedCharacterId !== original.readerCharacterId)) {
    return deny('SOURCE_MISMATCH');
  }

  let base;
  try {
    base = await prepareCharacterStandardReadingServerBaseContextV2({
      resolvedSubjectId: subjectId,
      threadId: request.threadId,
      contentEntry,
      expectedReaderCharacterId: original.readerCharacterId,
      threadBindingAuthorityPort: input.threadBindingAuthorityPort,
      relationshipAuthorityPort: input.relationshipAuthorityPort,
      memoryItemsAuthorityPort: input.memoryItemsAuthorityPort,
      memoryGrantsAuthorityPort: input.memoryGrantsAuthorityPort,
      nonMemoryContextAuthorityPort: input.nonMemoryContextAuthorityPort,
      contextInput: input.contextInput,
    });
  } catch {
    return deny('ACCESS_DENIED');
  }

  // Re-read the exact Grant/Product/official artifact after all other mutable
  // context reads. This cannot be replaced with a returned copy of first.scope.
  let current;
  try {
    current = await prepareOfficialReadingReaderAdmissionV1(admissionInput);
  } catch {
    return deny('ACCESS_DENIED');
  }
  const scope = current.scope;
  const thread = base.threadBinding;
  if (!sameScope(original, scope) ||
      current.source.responseHash !== first.source.responseHash ||
      thread.threadId !== scope.threadId ||
      thread.contentRevision !== scope.contentRevision ||
      thread.activeContentReleaseId !== scope.contentReleaseId ||
      thread.activeContentBundleId !== scope.readerContentBundleId ||
      thread.participantCharacterIds.length !== 1 ||
      thread.participantCharacterIds[0] !== scope.readerCharacterId ||
      base.contextInput.character.characterId !== scope.readerCharacterId ||
      base.contextInput.contentBundleId !== scope.readerContentBundleId ||
      scope.subjectId !== subjectId ||
      scope.readingId !== readingId ||
      scope.contentReleaseId !== input.receivePlan.resolvedContent.releaseId ||
      scope.readerContentBundleId !== input.receivePlan.resolvedContent.bundleId) {
    return deny('SOURCE_MISMATCH');
  }

  let runtime: CharacterRuntimeContextV2;
  try {
    const proof = await issueCharacterSajuOfficialStandardEligibilityV2({
      prepared: first,
      currentScope: scope,
      productAuthorityPort: input.productReaderEligibilityAuthorityPort,
    });
    const baseContext = assembleCharacterRuntimeContext(base.contextInput);
    runtime = assembleOfficialStandardReaderRuntimeV2({
      proof,
      currentScope: scope,
      source: current.source,
      baseContext,
    });
  } catch {
    return deny('ACCESS_DENIED');
  }

  const result = Object.freeze({
    receivePlan: input.receivePlan,
    threadBinding: thread,
    scope,
    runtime,
  });
  mintedStandardChatPreflightsV2.add(result);
  return result;
}
