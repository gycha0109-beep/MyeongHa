import type {
  GrantChoice,
  MemoryResolutionMode,
} from '../../contracts/src/index.js';
import {
  snapshotCurrentCharacterGrants,
  type RecordAccessGrantDraft,
} from './record-grants.js';

export type ProposedRecordKind = 'life_fact' | 'memory';

export interface MemoryResolutionInput {
  readonly proposalKind: ProposedRecordKind;
  readonly resolution: MemoryResolutionMode;
  readonly grantChoice?: GrantChoice;
  readonly currentEligibleCharacterIds: readonly string[];
}

export interface DurableRecordPlan {
  readonly kind: ProposedRecordKind;
}

export interface MemoryResolutionPlan {
  readonly resolution: MemoryResolutionMode;
  readonly durableRecord: DurableRecordPlan | null;
  readonly grants: readonly RecordAccessGrantDraft[];
  readonly sessionContextAllowed: boolean;
  readonly proposalPayloadDirective:
    | 'accepted_record_provenance_only'
    | 'must_not_remain_long_term_authority';
}

function characterOnlyGrant(characterId: string): readonly RecordAccessGrantDraft[] {
  const normalized = characterId.trim();
  if (normalized.length === 0) {
    throw new TypeError('character_only grant requires a characterId.');
  }
  return Object.freeze([Object.freeze({ granteeCharacterId: normalized })]);
}

export function resolveMemoryProposal(
  input: MemoryResolutionInput,
): MemoryResolutionPlan {
  if (input.resolution === 'session_only' || input.resolution === 'reject') {
    if (input.grantChoice !== undefined) {
      throw new TypeError('Non-durable memory resolution cannot create grants.');
    }
    return Object.freeze({
      resolution: input.resolution,
      durableRecord: null,
      grants: Object.freeze([]),
      sessionContextAllowed: input.resolution === 'session_only',
      proposalPayloadDirective: 'must_not_remain_long_term_authority',
    });
  }

  if (input.grantChoice === undefined) {
    throw new TypeError('accept_long_term requires an explicit grant choice.');
  }

  const grants = (() => {
    switch (input.grantChoice.mode) {
      case 'private':
        return Object.freeze([]) as readonly RecordAccessGrantDraft[];
      case 'character_only':
        return characterOnlyGrant(input.grantChoice.characterId);
      case 'current_characters':
        return snapshotCurrentCharacterGrants(input.currentEligibleCharacterIds);
    }
  })();

  return Object.freeze({
    resolution: 'accept_long_term',
    durableRecord: Object.freeze({ kind: input.proposalKind }),
    grants,
    sessionContextAllowed: false,
    proposalPayloadDirective: 'accepted_record_provenance_only',
  });
}
