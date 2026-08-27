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
  assembleCharacterRuntimeContext,
  hashProtectedSajuTextV1,
  projectCharacterRelationshipBehavior,
  type CharacterRelationshipProjectionV1,
  type CharacterRendererPolicyV1,
  type CharacterRuntimeContextV1,
  type CharacterSajuRuntimeContextV1,
  type GrantedLifeFactContextV1,
  type GrantedMemoryContextV1,
  type ProtectedSajuDisclosureV1,
  type ProtectedSajuSegmentV1,
  type ProtectedSajuTextRefV1,
  type RelationshipBandThresholds,
  type RelationshipRenderingProjectionPolicyV1,
} from './character-runtime-context.js';

export {
  CharacterOutputGuardError,
  guardCharacterRendererOutput,
  type CharacterDialogueEnvelopeV1,
  type CharacterMemoryProposalDraftV1,
  type CharacterMemoryProposalKindV1,
  type CharacterRendererDraftV1,
  type CharacterSuggestedActionV1,
} from './character-output-guard.js';

export {
  MockSajuAdapter,
  type MockSajuRequest,
  type MockSajuResult,
  type ProtectedMockSajuSegment,
} from './mock-saju.js';
