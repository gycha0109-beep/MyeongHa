import { describe, expect, it } from 'vitest';
import { runMockFirstReadingTurn } from '../apps/api/src/index.js';
import {
  ChatTurnTransitionError,
  InMemoryRelationshipAggregate,
  resolveMemoryProposal,
  transitionChatTurn,
  type RelationshipState,
} from '../packages/domain/src/index.js';
import {
  DEV_CHARACTER_IDS,
  DEV_RELATIONSHIP_POLICY,
} from '../packages/test-fixtures/src/index.js';

const allowedCapability = {
  needsSaju: true,
  characterCapabilityAllowed: true,
  userConsentAllowed: true,
  sajuDomainAvailability: 'available' as const,
  worldStateAllowed: true,
  entitlementAllowed: true,
  contentPolicyAllowed: true,
  clientCapabilityAllowed: true,
};

function relationshipAggregate(): InMemoryRelationshipAggregate {
  const initial: RelationshipState = {
    closeness: 0,
    trust: 0,
    friction: 0,
    stage: 'first_meeting',
    revision: 0,
    policyVersion: 'dev-v1',
  };
  return new InMemoryRelationshipAggregate(initial);
}

describe('chat turn state machine', () => {
  it('allows retry through the same logical turn but never regenerates a committed turn', () => {
    expect(transitionChatTurn('failed_retryable', 'planned')).toBe('planned');
    expect(() => transitionChatTurn('committed', 'generated')).toThrow(
      ChatTurnTransitionError,
    );
  });

  it('lets a retryable turn be abandoned explicitly', () => {
    expect(transitionChatTurn('failed_retryable', 'abandoned')).toBe('abandoned');
  });
});

describe('memory resolution', () => {
  it('keeps session-only data out of durable record/grant plans', () => {
    expect(
      resolveMemoryProposal({
        proposalKind: 'life_fact',
        resolution: 'session_only',
        currentEligibleCharacterIds: DEV_CHARACTER_IDS,
      }),
    ).toMatchObject({
      durableRecord: null,
      grants: [],
      sessionContextAllowed: true,
      proposalPayloadDirective: 'must_not_remain_long_term_authority',
    });
  });

  it('snapshots only approval-time current characters', () => {
    const current: string[] = [...DEV_CHARACTER_IDS];
    const plan = resolveMemoryProposal({
      proposalKind: 'memory',
      resolution: 'accept_long_term',
      grantChoice: { mode: 'current_characters' },
      currentEligibleCharacterIds: current,
    });
    current.push('future-character');

    expect(plan.grants.map((grant) => grant.granteeCharacterId)).toEqual([
      ...DEV_CHARACTER_IDS,
    ]);
  });
});

describe('relationship policy authority', () => {
  it('applies policy-owned deltas once for the same dedupe key', () => {
    const aggregate = relationshipAggregate();
    const first = aggregate.apply(
      'reading:1',
      'COMPLETED_READING',
      DEV_RELATIONSHIP_POLICY,
    );
    const duplicate = aggregate.apply(
      'reading:1',
      'COMPLETED_READING',
      DEV_RELATIONSHIP_POLICY,
    );

    expect(first.applied).toBe(true);
    expect(first.state).toMatchObject({
      closeness: 2,
      trust: 1,
      stage: 'familiar_visitor',
      revision: 1,
    });
    expect(duplicate).toEqual({ applied: false, state: first.state });
  });
});

describe('mock first-reading vertical core', () => {
  it('commits only a synthetic non-semantic Saju segment and explicit record plan', () => {
    const aggregate = relationshipAggregate();
    const selectedCharacterId = DEV_CHARACTER_IDS[1] ?? DEV_CHARACTER_IDS[0]!;
    const result = runMockFirstReadingTurn(
      {
        requestId: 'req-1',
        birthRevisionRef: 'birth-revision-1',
        domain: 'career',
        capability: allowedCapability,
        proposalKind: 'life_fact',
        memoryResolution: 'accept_long_term',
        grantChoice: { mode: 'character_only', characterId: selectedCharacterId },
        currentEligibleCharacterIds: DEV_CHARACTER_IDS,
        relationshipEvent: 'COMPLETED_READING',
        relationshipEventDedupeKey: 'reading:1',
      },
      aggregate,
      DEV_RELATIONSHIP_POLICY,
    );

    expect(result.status).toBe('committed');
    if (result.status !== 'committed') throw new Error('Expected committed result.');
    expect(result.reading.adapterMode).toBe('synthetic_dev_fixture');
    expect(result.reading.protectedSegments[0]?.semanticAuthority).toBe(
      'none_dev_fixture_only',
    );
    expect(result.memory.grants).toEqual([
      { granteeCharacterId: selectedCharacterId },
    ]);
    expect(result.relationship.event?.policyContentHash).toMatch(/^sha256:v1:/u);
  });

  it('fails before Saju/memory/relationship work when capability is denied', () => {
    const aggregate = relationshipAggregate();
    const result = runMockFirstReadingTurn(
      {
        requestId: 'req-denied',
        birthRevisionRef: 'birth-revision-1',
        domain: 'career',
        capability: {
          ...allowedCapability,
          sajuDomainAvailability: 'unavailable',
        },
        proposalKind: 'memory',
        memoryResolution: 'reject',
        currentEligibleCharacterIds: DEV_CHARACTER_IDS,
        relationshipEvent: 'COMPLETED_READING',
        relationshipEventDedupeKey: 'reading:denied',
      },
      aggregate,
      DEV_RELATIONSHIP_POLICY,
    );

    expect(result).toEqual({
      status: 'denied',
      reason: 'SAJU_DOMAIN_UNAVAILABLE',
    });
    expect(aggregate.state.revision).toBe(0);
  });
});
