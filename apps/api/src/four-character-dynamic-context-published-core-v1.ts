// Watchtower-Track: character-memory
// Offline-only bridge from existing independently verified publication source
// to the Dynamic Context Composer. No Provider dispatch or publishing action.
import {
  FOUR_INDEPENDENT_CHAT_TARGETS_V1,
  type FourCharacterProductionExecutionPortsV1,
  type FourIndependentChatTargetV1,
} from './four-character-production-chat-executor-v1.js';
import type {
  CharacterContextScopeV1,
  CharacterContextSourceAdmissionPortV1,
  CharacterContextTrustedSourceV1,
} from '../../../packages/domain/src/character-dynamic-context-composer-v1.js';

export class FourCharacterDynamicContextSourceHeldV1 extends Error {
  override readonly name = 'FourCharacterDynamicContextSourceHeldV1';
  readonly code = 'PUBLISHED_CHARACTER_CONTEXT_SOURCE_HELD' as const;
  constructor() {
    super('Exact independently published Character context source is unavailable.');
  }
}

export type FourCharacterPublishedContextPinV1 = Readonly<{
  releaseId: string;
  bundleId: string;
  contentVersion: string;
}>;

export type FourCharacterPublishedContextCoreInputV1 = Readonly<{
  /** Pinned by existing Subject/thread and Character authority, never Browser JSON. */
  scope: CharacterContextScopeV1;
  pin: FourCharacterPublishedContextPinV1;
  /** Existing DB-evidence + approved immutable artifact + compiler port. */
  publication: FourCharacterProductionExecutionPortsV1['publication'];
  /** Independent authority for policy/task/events; cannot admit Character core. */
  otherSourceAdmission: CharacterContextSourceAdmissionPortV1;
}>;

export type FourCharacterPublishedContextCoreResultV1 = Readonly<{
  executionMode: 'offline_preflight_only';
  characterCore: CharacterContextTrustedSourceV1;
  sourceAdmission: CharacterContextSourceAdmissionPortV1;
}>;

function bounded(value: unknown, maximum: number): value is string {
  return typeof value === 'string' &&
    value.length > 0 && value.length <= maximum &&
    value.trim() === value;
}

function matchesScope(
  actual: CharacterContextScopeV1,
  pinned: CharacterContextScopeV1,
): boolean {
  return actual.subjectId === pinned.subjectId &&
    actual.characterId === pinned.characterId &&
    actual.threadId === pinned.threadId;
}

/** Server-only no-read validation, shared by the permission-first turn
 * bridge and published-source reader. This checks only the requested identity
 * and trusted port shape; publication itself still requires source authority.
 */
export function assertFourCharacterPublishedContextSourceInputV1(
  input: Pick<FourCharacterPublishedContextCoreInputV1,
    'scope' | 'pin' | 'otherSourceAdmission'>,
): void {
  const { scope, pin } = input;
  if (
    !bounded(scope?.subjectId, 256) ||
    !bounded(scope?.threadId, 256) ||
    !FOUR_INDEPENDENT_CHAT_TARGETS_V1.some(id => id === scope?.characterId) ||
    !bounded(pin?.releaseId, 256) ||
    !bounded(pin?.bundleId, 256) ||
    !bounded(pin?.contentVersion, 256) ||
    typeof input.otherSourceAdmission?.admit !== 'function'
  ) {
    throw new FourCharacterDynamicContextSourceHeldV1();
  }
}

/**
 * A narrow offline adapter: only the existing independently verified
 * published-source reader can supply canonical Character core bytes.
 *
 * Policy/task/event admission remains with the caller's distinct authorities;
 * private memory is handled only by permission-first Working Memory retrieval.
 * No unverified Bible snippet is synthesized out of the full canon text.
 */
export async function prepareFourCharacterPublishedContextCoreV1(
  input: FourCharacterPublishedContextCoreInputV1,
): Promise<FourCharacterPublishedContextCoreResultV1> {
  assertFourCharacterPublishedContextSourceInputV1(input);
  const { scope, pin } = input;
  const characterId = scope.characterId as FourIndependentChatTargetV1;
  let source: Awaited<ReturnType<FourCharacterPublishedContextCoreInputV1['publication']['readPublishedSource']>>;
  try {
    source = await input.publication.readPublishedSource({
      subjectId: scope.subjectId,
      threadId: scope.threadId,
      characterId,
      releaseId: pin.releaseId,
      bundleId: pin.bundleId,
      contentVersion: pin.contentVersion,
    });
  } catch {
    throw new FourCharacterDynamicContextSourceHeldV1();
  }

  if (
    source === null ||
    source.status !== 'published' ||
    source.characterId !== characterId ||
    source.releaseId !== pin.releaseId ||
    source.bundleId !== pin.bundleId ||
    source.contentVersion !== pin.contentVersion ||
    typeof source.sourceDigest !== 'string' ||
    !/^sha256:v1:[0-9a-f]{64}$/.test(source.sourceDigest) ||
    !bounded(source.bibleSourceRef, 512) ||
    !bounded(source.runtimeSourceRef, 512) ||
    source.bibleSourceRef === source.runtimeSourceRef ||
    !bounded(source.canonicalContext, 8000)
  ) {
    // The current composer has an 8,000-character per-segment limit.
    // Never truncate approved canon to fit that bound.
    throw new FourCharacterDynamicContextSourceHeldV1();
  }

  // Digest is from the existing verified artifact reader, not a digest of
  // model text. The source data itself contains Bible/Runtime source refs.
  const characterCore = Object.freeze({
    sourceRef: 'character:' + characterId + ':published:' +
      source.sourceDigest.slice('sha256:v1:'.length),
    text: source.canonicalContext,
  });
  const pinnedScope = Object.freeze({ ...scope });
  const sourceAdmission: CharacterContextSourceAdmissionPortV1 = Object.freeze({
    async admit({ scope: proposedScope, segment }: Parameters<CharacterContextSourceAdmissionPortV1['admit']>[0]): Promise<boolean> {
      if (!matchesScope(proposedScope, pinnedScope)) return false;
      if (segment.layer === 'character_core') {
        return segment.sourceRef === characterCore.sourceRef &&
          segment.text === characterCore.text;
      }
      try {
        return (await input.otherSourceAdmission.admit({
          scope: proposedScope,
          segment,
        })) === true;
      } catch {
        return false;
      }
    },
  });
  return Object.freeze({
    executionMode: 'offline_preflight_only' as const,
    characterCore,
    sourceAdmission,
  });
}
