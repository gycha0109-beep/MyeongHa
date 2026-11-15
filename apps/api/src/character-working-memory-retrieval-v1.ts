import {
  evaluateCapabilityGate,
  type CapabilityDenialReason,
  type CapabilityGateInput,
} from '../../../packages/domain/src/capability-gate.js';
import {
  prepareCharacterWorkingMemoryContextV1,
  type PrepareCharacterWorkingMemoryContextInputV1,
} from './character-working-memory-context-v1.js';
import {
  retrieveCharacterWorkingMemoryV1,
  type CharacterMemoryRetrievalResultV1,
} from '../../../packages/domain/src/character-memory-retrieval-v1.js';
import type {
  CharacterWorkingMemoryProjectionV1,
} from '../../../packages/domain/src/character-working-memory-projection-v1.js';

export interface RetrieveCharacterWorkingMemoryForTurnInputV1
  extends PrepareCharacterWorkingMemoryContextInputV1 {
  /** Server-resolved consent, entitlement, policy, world and client gate inputs. */
  readonly capabilityGateInput: CapabilityGateInput;
  readonly now: string;
  readonly limit: number;
  readonly explicitCallbackRequested?: boolean;
}

export type CharacterWorkingMemoryContextMetadataV1 = Pick<
  CharacterWorkingMemoryProjectionV1,
  | 'schemaVersion'
  | 'authority'
  | 'scope'
  | 'relationship'
  | 'currentUserMessage'
  | 'relationshipEventIndex'
  | 'recentConversation'
  | 'excludedMessages'
  | 'admissions'
>;

export interface RetrieveCharacterWorkingMemoryForTurnResultV1 {
  readonly context: CharacterWorkingMemoryContextMetadataV1;
  readonly retrieval: CharacterMemoryRetrievalResultV1;
}

export class CharacterWorkingMemoryRetrievalGateErrorV1 extends Error {
  override readonly name = 'CharacterWorkingMemoryRetrievalGateErrorV1';

  constructor(readonly reason: CapabilityDenialReason) {
    super('Character Working Memory retrieval denied by Capability Gate: ' + reason);
  }
}

/**
 * Server-side retrieval entrypoint for one canonical Subject, Character, and
 * server-bound thread. Capability Gate must pass before any memory authority
 * port is read. Its inputs must be resolved by trusted server authorities.
 * All database ports must share the same Subject-bound transaction client.
 * The query is taken from the exact current User message returned by the
 * authoritative recent-message read for currentUserMessageRef.
 *
 * This reads only explicitly granted user Life Facts/Memory. Character-private
 * biography must use the separate disclosure preflight; protected Saju remains
 * on the exact Reader Knowledge path. This function never writes Memory,
 * changes grants, mutates relationships, or calls a Provider.
 */
export async function retrieveCharacterWorkingMemoryForTurnV1(
  input: RetrieveCharacterWorkingMemoryForTurnInputV1,
): Promise<RetrieveCharacterWorkingMemoryForTurnResultV1> {
  const capability = evaluateCapabilityGate(input.capabilityGateInput);
  if (!capability.allowed) {
    throw new CharacterWorkingMemoryRetrievalGateErrorV1(capability.reason);
  }

  const projection = await prepareCharacterWorkingMemoryContextV1({
    ...input,
    asOf: input.now,
  });
  const retrieval = retrieveCharacterWorkingMemoryV1({
    projection,
    expectedScope: {
      subjectId: input.resolvedSubjectId,
      characterId: input.characterId,
      threadId: input.threadBinding.threadId,
    },
    now: input.now,
    limit: input.limit,
    ...(input.explicitCallbackRequested === undefined
      ? {}
      : { explicitCallbackRequested: input.explicitCallbackRequested }),
  });
  const context: CharacterWorkingMemoryContextMetadataV1 = Object.freeze({
    schemaVersion: projection.schemaVersion,
    authority: projection.authority,
    scope: projection.scope,
    relationship: projection.relationship,
    currentUserMessage: projection.currentUserMessage,
    relationshipEventIndex: projection.relationshipEventIndex,
    recentConversation: projection.recentConversation,
    excludedMessages: projection.excludedMessages,
    admissions: projection.admissions,
  });
  return Object.freeze({ context, retrieval });
}
