import type { ContentReleaseRuntimeEntry } from '../../../packages/world-content/src/index.js';
import {
  prepareCharacterStandardReadingThreadRuntimeV1,
  type CharacterStandardReadingThreadRuntimeV1,
} from './character-standard-reading-chat-turn-context.js';
import type { CharacterStandardReadingChatBaseContextInputV1 } from './character-standard-reading-chat-context.js';
import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
} from './character-standard-reading-knowledge.js';
import {
  getChatThreadRuntimeBinding,
  type ChatThreadRuntimeBindingReadAuthorityPortV1,
} from './chat-thread-runtime-binding-read.js';
import {
  getCharacterRelationship,
  type CharacterRelationshipReadAuthorityPortV1,
} from './character-relationship-read.js';
import {
  getMemoryItems,
  type MemoryItemsReadAuthorityPortV1,
} from './memory-items-read.js';
import {
  getMemoryGrants,
  type MemoryGrantsReadAuthorityPortV1,
} from './memory-grants-read.js';
import type {
  ReaderContextLifeFactsReadAuthorityPortV1,
} from './reader-context-non-memory-read.js';

export type CharacterStandardReadingServerContextInputV1 = Omit<
  CharacterStandardReadingChatBaseContextInputV1,
  | 'character'
  | 'contentBundleId'
  | 'worldRelations'
  | 'relationshipState'
  | 'grantedLifeFacts'
  | 'grantedMemories'
  | 'recentRelationshipEventKeys'
  | 'recentMessages'
>;

export interface PrepareCharacterStandardReadingServerRuntimeInputV1 {
  readonly resolvedSubjectId?: string;
  readonly threadId: unknown;
  readonly readingId: unknown;
  readonly effectiveAt: unknown;
  readonly contentEntry: ContentReleaseRuntimeEntry;
  readonly expectedReaderCharacterId?: string;
  readonly threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1;
  readonly accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  readonly artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
  readonly relationshipAuthorityPort: CharacterRelationshipReadAuthorityPortV1;
  readonly memoryItemsAuthorityPort: MemoryItemsReadAuthorityPortV1;
  readonly memoryGrantsAuthorityPort: MemoryGrantsReadAuthorityPortV1;
  readonly nonMemoryContextAuthorityPort: ReaderContextLifeFactsReadAuthorityPortV1;
  readonly contextInput: CharacterStandardReadingServerContextInputV1;
}

export class CharacterStandardReadingServerRuntimeAuthorityErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterStandardReadingServerRuntimeAuthorityErrorV1';
  }
}

function assertNoCallerContentAuthorityFields(
  input: CharacterStandardReadingServerContextInputV1,
): void {
  for (const field of [
    'character',
    'contentBundleId',
    'worldRelations',
    'relationshipState',
    'grantedLifeFacts',
    'grantedMemories',
  ] as const) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      throw new CharacterStandardReadingServerRuntimeAuthorityErrorV1(
        `Server Reader runtime does not accept caller-supplied ${field} authority.`,
      );
    }
  }

  const legacy = input as unknown as Record<string, unknown>;
  for (const field of ['recentRelationshipEventKeys', 'recentMessages'] as const) {
    if (!Object.prototype.hasOwnProperty.call(legacy, field)) continue;
    const value = legacy[field];
    if (!Array.isArray(value) || value.length !== 0) {
      throw new CharacterStandardReadingServerRuntimeAuthorityErrorV1(
        `Server Reader runtime does not accept non-empty caller-supplied ${field} authority.`,
      );
    }
  }
}

function findExactReaderCharacter(
  characterId: string,
  characters: ContentReleaseRuntimeEntry['characters']['characters'],
) {
  const matches = characters.filter((character) => character.characterId === characterId);
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new CharacterStandardReadingServerRuntimeAuthorityErrorV1(
      'Pinned content release does not contain exactly one authored Reader Character.',
    );
  }
  return matches[0];
}

/**
 * Shared server-authority composition for Official Reading Reader runtime consumers.
 *
 * Character/world canon comes only from the exact pinned immutable content release.
 * Relationship state and Memory grants are independently re-read from current server
 * authority. Exact Reader access + Official Reading source are then re-resolved by
 * the existing thread runtime. Caller-supplied content authority fails closed.
 */
export async function prepareCharacterStandardReadingServerRuntimeV1(
  input: PrepareCharacterStandardReadingServerRuntimeInputV1,
): Promise<CharacterStandardReadingThreadRuntimeV1> {
  assertNoCallerContentAuthorityFields(input.contextInput);

  const subjectBinding =
    input.resolvedSubjectId === undefined
      ? {}
      : { resolvedSubjectId: input.resolvedSubjectId };

  const initialThreadBinding = await getChatThreadRuntimeBinding({
    ...subjectBinding,
    threadId: input.threadId,
    authorityPort: input.threadBindingAuthorityPort,
  });

  if (initialThreadBinding.participantCharacterIds.length !== 1) {
    throw new CharacterStandardReadingServerRuntimeAuthorityErrorV1(
      'Official Reading Reader runtime requires an active single-Character thread.',
    );
  }
  if (initialThreadBinding.activeContentReleaseId !== input.contentEntry.release.releaseId) {
    throw new CharacterStandardReadingServerRuntimeAuthorityErrorV1(
      'Pinned content release no longer matches the current owned thread binding.',
    );
  }
  if (initialThreadBinding.activeContentBundleId !== input.contentEntry.release.bundleId) {
    throw new CharacterStandardReadingServerRuntimeAuthorityErrorV1(
      'Pinned content bundle no longer matches the current owned thread binding.',
    );
  }

  const readerCharacterId = initialThreadBinding.participantCharacterIds[0];
  if (readerCharacterId === undefined) {
    throw new CharacterStandardReadingServerRuntimeAuthorityErrorV1(
      'Official Reading Reader runtime thread has no active Reader.',
    );
  }
  if (
    input.expectedReaderCharacterId !== undefined &&
    input.expectedReaderCharacterId !== readerCharacterId
  ) {
    throw new CharacterStandardReadingServerRuntimeAuthorityErrorV1(
      'Expected Reader Character no longer matches the current thread Reader.',
    );
  }

  const character = findExactReaderCharacter(
    readerCharacterId,
    input.contentEntry.characters.characters,
  );
  const worldRelations = input.contentEntry.world.characterRelations.filter(
    (relation) =>
      relation.fromCharacterId === readerCharacterId ||
      relation.toCharacterId === readerCharacterId,
  );

  const relationship = await getCharacterRelationship({
    ...subjectBinding,
    characterId: readerCharacterId,
    authorityPort: input.relationshipAuthorityPort,
  });
  if (relationship.relationship === null) {
    throw new CharacterStandardReadingServerRuntimeAuthorityErrorV1(
      'Official Reading Reader runtime requires a stored current relationship projection.',
    );
  }
  const relationshipState = Object.freeze({
    closeness: relationship.relationship.closeness,
    trust: relationship.relationship.trust,
    friction: relationship.relationship.friction,
    stage: relationship.relationship.relationshipStage,
    revision: relationship.relationship.revision,
    policyVersion: relationship.relationship.policyVersion,
  });

  const grantedLifeFacts = await input.nonMemoryContextAuthorityPort.readGrantedLifeFacts({
    subjectId: input.resolvedSubjectId!,
    characterId: readerCharacterId,
  });

  const memoryItems = await getMemoryItems({
    ...subjectBinding,
    authorityPort: input.memoryItemsAuthorityPort,
  });
  const grantedMemories = [];
  for (const memory of memoryItems.memories) {
    const grants = await getMemoryGrants({
      ...subjectBinding,
      memoryItemId: memory.memoryItemId,
      authorityPort: input.memoryGrantsAuthorityPort,
    });
    const readerGrants = grants.grants.filter(
      (grant) => grant.characterId === readerCharacterId,
    );
    if (readerGrants.length > 1) {
      throw new CharacterStandardReadingServerRuntimeAuthorityErrorV1(
        'Memory grant authority returned multiple active grants for the current Reader.',
      );
    }
    const grant = readerGrants[0];
    if (grant === undefined) continue;
    grantedMemories.push(Object.freeze({
      memoryItemId: memory.memoryItemId,
      memoryType: memory.memoryType,
      schemaVersion: memory.schemaVersion,
      content: memory.contentJsonb,
      grantId: grant.grantId,
      granteeCharacterId: grant.characterId,
    }));
  }

  const runtime = await prepareCharacterStandardReadingThreadRuntimeV1({
    ...subjectBinding,
    threadId: input.threadId,
    readingId: input.readingId,
    effectiveAt: input.effectiveAt,
    threadBindingAuthorityPort: input.threadBindingAuthorityPort,
    accessAuthorityPort: input.accessAuthorityPort,
    artifactAuthorityPort: input.artifactAuthorityPort,
    contextInput: {
      ...input.contextInput,
      character,
      contentBundleId: input.contentEntry.release.bundleId,
      relationshipState,
      // Decision-R / Reader Context Product Policy V1: historical relationship
      // events and raw message text are not Reader Interpretation inputs. Current
      // relationship projection remains authoritative; history stays outside this seam.
      recentRelationshipEventKeys: Object.freeze([]),
      worldRelations,
      grantedLifeFacts: Object.freeze(grantedLifeFacts.map((fact) => Object.freeze({ ...fact }))),
      grantedMemories: Object.freeze(grantedMemories),
      recentMessages: Object.freeze([]),
    },
  });

  if (runtime.threadBinding.activeContentReleaseId !== input.contentEntry.release.releaseId) {
    throw new CharacterStandardReadingServerRuntimeAuthorityErrorV1(
      'Pinned content release changed during Reader runtime composition.',
    );
  }
  if (runtime.threadBinding.activeContentBundleId !== input.contentEntry.release.bundleId) {
    throw new CharacterStandardReadingServerRuntimeAuthorityErrorV1(
      'Pinned content bundle changed during Reader runtime composition.',
    );
  }

  return runtime;
}
