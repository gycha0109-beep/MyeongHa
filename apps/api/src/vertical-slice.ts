import type {
  GrantChoice,
  MemoryResolutionMode,
  RelationshipEventCandidate,
  SajuDomain,
} from '../../../packages/contracts/src/index.js';
import {
  evaluateCapabilityGate,
  type CapabilityGateInput,
  type ImmutableArtifact,
  InMemoryRelationshipAggregate,
  MockSajuAdapter,
  resolveMemoryProposal,
  type RelationshipPolicyV1,
} from '../../../packages/domain/src/index.js';
import { assertEngineeringVerticalSliceMockExecution } from './mock-execution-boundary.js';

export interface MockFirstReadingTurnInput {
  readonly requestId: string;
  readonly birthRevisionRef: string;
  readonly domain: SajuDomain;
  readonly capability: CapabilityGateInput;
  readonly proposalKind: 'life_fact' | 'memory';
  readonly memoryResolution: MemoryResolutionMode;
  readonly grantChoice?: GrantChoice;
  readonly currentEligibleCharacterIds: readonly string[];
  readonly relationshipEvent: RelationshipEventCandidate;
  readonly relationshipEventDedupeKey: string;
}

export type MockFirstReadingTurnResult =
  | {
      readonly status: 'denied';
      readonly reason: string;
    }
  | {
      readonly status: 'committed';
      readonly reading: ReturnType<MockSajuAdapter['request']>;
      readonly memory: ReturnType<typeof resolveMemoryProposal>;
      readonly relationship: ReturnType<InMemoryRelationshipAggregate['apply']>;
    };

export function runMockFirstReadingTurn(
  input: MockFirstReadingTurnInput,
  relationship: InMemoryRelationshipAggregate,
  relationshipPolicy: ImmutableArtifact<RelationshipPolicyV1>,
  sajuAdapter = new MockSajuAdapter(),
): MockFirstReadingTurnResult {
  assertEngineeringVerticalSliceMockExecution('runMockFirstReadingTurn');

  const capability = evaluateCapabilityGate(input.capability);
  if (!capability.allowed) {
    return Object.freeze({ status: 'denied', reason: capability.reason });
  }

  const reading = sajuAdapter.request({
    requestId: input.requestId,
    domain: input.domain,
    birthRevisionRef: input.birthRevisionRef,
  });

  const memory = resolveMemoryProposal({
    proposalKind: input.proposalKind,
    resolution: input.memoryResolution,
    ...(input.grantChoice === undefined ? {} : { grantChoice: input.grantChoice }),
    currentEligibleCharacterIds: input.currentEligibleCharacterIds,
  });

  const relationshipResult = relationship.apply(
    input.relationshipEventDedupeKey,
    input.relationshipEvent,
    relationshipPolicy,
  );

  return Object.freeze({
    status: 'committed',
    reading,
    memory,
    relationship: relationshipResult,
  });
}
