export {
  canonicalJson,
  createImmutableArtifact,
  ImmutableArtifactRegistry,
  type ImmutableArtifact,
} from './registry.js';

export {
  snapshotCurrentCharacterGrants,
  type RecordAccessGrantDraft,
} from './record-grants.js';

export {
  evaluateCapabilityGate,
  type CapabilityGateInput,
  type CapabilityGateResult,
  type CapabilityDenialReason,
} from './capability-gate.js';

export {
  ChatTurnTransitionError,
  isInFlightChatTurnState,
  transitionChatTurn,
} from './chat-turn.js';

export {
  resolveMemoryProposal,
  type DurableRecordPlan,
  type MemoryResolutionInput,
  type MemoryResolutionPlan,
  type ProposedRecordKind,
} from './memory-resolution.js';

export {
  InMemoryRelationshipAggregate,
  type AppliedRelationshipEvent,
  type RelationshipApplyResult,
  type RelationshipEventRuleV1,
  type RelationshipPolicyV1,
  type RelationshipState,
  type RelationshipVector,
} from './relationship-engine.js';

export {
  MockSajuAdapter,
  type MockSajuRequest,
  type MockSajuResult,
  type ProtectedMockSajuSegment,
} from './mock-saju.js';
