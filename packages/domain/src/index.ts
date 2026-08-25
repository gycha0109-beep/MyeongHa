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
