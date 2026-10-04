import { describe, expect, it } from 'vitest';

import {
  runCharacterGovernedPreflightV1,
} from '../apps/api/src/character-governed-preflight-v1.js';
import {
  createSeyeonProductionGovernanceV1,
  projectSeyeonProductionDisclosureRelationshipV1,
} from '../apps/api/src/seyeon-production-governance-v1.js';
import type {
  SeyeonStructuredProviderPortV2,
  SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import type {
  SeyeonProductionContextSnapshotV1,
} from '../apps/api/src/seyeon-production-context-v1.js';
import type {
  SeyeonProductionRelationshipTurnBindingV1,
} from '../apps/api/src/seyeon-production-relationship-read-v1.js';

class Provider implements SeyeonStructuredProviderPortV2 {
  readonly providerKey = 'test-provider';
  readonly modelKey = 'test-model';

  constructor(
    private readonly generateFor:
      (request: SeyeonStructuredProviderRequestV2) => unknown,
  ) {}

  generate(request: SeyeonStructuredProviderRequestV2): unknown {
    return this.generateFor(request);
  }
}

function context(
  withHistory: boolean,
): SeyeonProductionContextSnapshotV1 {
  return Object.freeze({
    version: 'seyeon-production-context-v1',
    relationshipRevisionUsedForTurn: 9,
    historyThroughRevision: 9,
    recentMessages: Object.freeze([]),
    retrievedMemories: withHistory
      ? Object.freeze([
          Object.freeze({
            memoryId: 'relationship-event:event-1',
            kind: 'relationship_event' as const,
            claimKind: 'fact' as const,
            summary: '관계상 실제로 기록된 사건',
            sourceRef: 'relationship-event:event-1',
            causalAuthority: 'authorized_shared_history' as const,
            relevance: 1,
            salience: 1,
          }),
        ])
      : Object.freeze([]),
    personalRecordAdmissions: Object.freeze([]),
    activeRelationshipEventCount: withHistory ? 1 : 0,
    relationshipHistoryRecords: Object.freeze([]),
  });
}

function binding(
  stageKey:
    | 'S0_FIRST_MEETING'
    | 'S1_FAMILIAR'
    | 'S2_REGULAR'
    | 'S3_OPENED'
    | 'S4_SPECIAL',
  trustBand: 'low' | 'medium' | 'high' = 'high',
): SeyeonProductionRelationshipTurnBindingV1 {
  return Object.freeze({
    version: 'seyeon-production-relationship-read-v1',
    relationshipRevisionUsedForTurn: 9,
    relationship: Object.freeze({
      stageKey,
      closenessBand: 'high' as const,
      trustBand,
      frictionBand: 'low' as const,
      revision: 9,
      policyVersion: 'relationship-policy-v1',
    }),
    relationshipSemantics: null,
    freshness: 'CURRENT' as const,
  });
}

describe('Se-yeon Production governance V1', () => {
  it('does not verify a shared-event claim merely because the model classified it', async () => {
    const governance = createSeyeonProductionGovernanceV1({
      provider: new Provider((request) => {
        if (request.purpose === 'integrity_classification') {
          return {
            claims: [
              {
                claimId: 'claim:shared-event',
                kind: 'SHARED_EVENT_CLAIM',
                statement: '사용자와 세연이 어제 키스했다.',
              },
            ],
          };
        }
        return {
          topicKey: null,
          questionContext: 'casual_curiosity',
        };
      }),
      turnBinding: binding('S2_REGULAR', 'medium'),
      productionContext: context(true),
    });

    const result = await runCharacterGovernedPreflightV1({
      characterId: 'seyeon',
      userMessageRef: 'message:current',
      userText: '우리 어제 키스했잖아.',
      relationship: governance.relationship,
      integrity: governance.integrity,
      disclosure: governance.disclosure,
    });

    expect(result.integrity.decisions[0]).toEqual(
      expect.objectContaining({
        result: 'UNVERIFIED',
        mayEnterWorkingContextAsFact: false,
        mayCreateRelationshipEvent: false,
        mayMutateRelationshipState: false,
      }),
    );
  });

  it('keeps undefined private biography at AUTHORITY_ABSTAIN even at deep relationship depth', async () => {
    const governance = createSeyeonProductionGovernanceV1({
      provider: new Provider((request) => {
        if (request.purpose === 'integrity_classification') {
          return { claims: [] };
        }
        if (request.purpose === 'disclosure_classification') {
          return {
            topicKey: 'past_romance_detail',
            questionContext: 'relationship_relevant',
          };
        }
        throw new Error('unexpected provider purpose');
      }),
      turnBinding: binding('S4_SPECIAL', 'high'),
      productionContext: context(true),
    });

    const result = await runCharacterGovernedPreflightV1({
      characterId: 'seyeon',
      userMessageRef: 'message:current',
      userText: '전남친 이야기를 자세히 해줘요.',
      relationship: governance.relationship,
      integrity: governance.integrity,
      disclosure: governance.disclosure,
    });

    expect(governance.relationship.gate).toBe('DEEP_TRUST');
    expect(result.disclosure.status).toBe('sensitive');
    expect(result.disclosure.decision?.result).toBe('AUTHORITY_ABSTAIN');
    expect(result.retrievedPrivateSources).toEqual([]);
  });

  it('does not open DEEP_TRUST from S4/high trust alone without authorized shared history', () => {
    expect(projectSeyeonProductionDisclosureRelationshipV1({
      turnBinding: binding('S4_SPECIAL', 'high'),
      productionContext: context(false),
    })).toEqual({
      gate: 'ATTACHED',
      trustBand: 'high',
      relevantSharedHistoryRefs: [],
    });

    expect(projectSeyeonProductionDisclosureRelationshipV1({
      turnBinding: binding('S3_OPENED', 'high'),
      productionContext: context(true),
    }).gate).toBe('ATTACHED');
  });
});
