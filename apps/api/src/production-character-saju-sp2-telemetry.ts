import type { SajuDomain } from '../../../packages/contracts/src/index.js';
import type {
  CharacterSajuSp2ControlledRolloutDecisionV1,
  CharacterSajuSp2RolloutFailureCodeV1,
} from '../../../packages/domain/src/index.js';
import {
  commitAndRevealCharacterSajuSp2ControlledRolloutV1,
  type CharacterSajuSp2CommitPortV1,
  type CharacterSajuSp2RolloutOrchestrationResultV1,
} from './character-saju-sp2-rollout-orchestration.js';

export const PRODUCTION_CHARACTER_SAJU_SP2_TELEMETRY_SCHEMA_VERSION_V1 =
  'myeongha-production-character-saju-sp2-telemetry-v1' as const;

export type ProductionCharacterSajuSp2TelemetryEventTypeV1 =
  | 'protected_fallback_required'
  | 'rollout_candidate_authorized'
  | 'artifact_committed'
  | 'controlled_reveal_delivered'
  | 'controlled_reveal_replayed'
  | 'commit_failed';

export interface ProductionCharacterSajuSp2TelemetryEventV1 {
  readonly schemaVersion: typeof PRODUCTION_CHARACTER_SAJU_SP2_TELEMETRY_SCHEMA_VERSION_V1;
  readonly eventType: ProductionCharacterSajuSp2TelemetryEventTypeV1;
  readonly rolloutPolicyVersion?: string;
  readonly characterId?: string;
  readonly domain?: SajuDomain;
  readonly evaluatorVersion?: string;
  readonly providerKey?: string;
  readonly modelKey?: string;
  readonly fallbackReason?: Extract<
    CharacterSajuSp2ControlledRolloutDecisionV1,
    { readonly mode: 'protected_fallback' }
  >['reason'];
  readonly failureCodes?: readonly CharacterSajuSp2RolloutFailureCodeV1[];
}

export interface ProductionCharacterSajuSp2TelemetrySinkV1 {
  record(event: ProductionCharacterSajuSp2TelemetryEventV1): void;
}

export class ProductionCharacterSajuSp2TelemetryErrorV1 extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'ProductionCharacterSajuSp2TelemetryErrorV1';
    this.cause = cause;
  }
}

export class InMemoryProductionCharacterSajuSp2TelemetrySinkV1
  implements ProductionCharacterSajuSp2TelemetrySinkV1
{
  readonly #events: ProductionCharacterSajuSp2TelemetryEventV1[] = [];

  record(event: ProductionCharacterSajuSp2TelemetryEventV1): void {
    this.#events.push(Object.freeze({ ...event }));
  }

  get events(): readonly ProductionCharacterSajuSp2TelemetryEventV1[] {
    return Object.freeze([...this.#events]);
  }
}

function freezeEvent(
  event: Omit<
    ProductionCharacterSajuSp2TelemetryEventV1,
    'schemaVersion'
  >,
): ProductionCharacterSajuSp2TelemetryEventV1 {
  return Object.freeze({
    schemaVersion: PRODUCTION_CHARACTER_SAJU_SP2_TELEMETRY_SCHEMA_VERSION_V1,
    ...event,
    ...(event.failureCodes === undefined
      ? {}
      : { failureCodes: Object.freeze([...event.failureCodes]) }),
  });
}

function recordStrict(
  sink: ProductionCharacterSajuSp2TelemetrySinkV1,
  event: ProductionCharacterSajuSp2TelemetryEventV1,
): void {
  try {
    sink.record(event);
  } catch (error) {
    throw new ProductionCharacterSajuSp2TelemetryErrorV1(
      'Character Saju SP-2 production telemetry failed before reveal.',
      error,
    );
  }
}

function recordBestEffort(
  sink: ProductionCharacterSajuSp2TelemetrySinkV1,
  event: ProductionCharacterSajuSp2TelemetryEventV1,
): void {
  try {
    sink.record(event);
  } catch {
    // Reveal is already forbidden on this path. Telemetry must not replace
    // the authoritative protected-fallback/commit-failure outcome.
  }
}

function candidateMetadata(
  decision: Extract<
    CharacterSajuSp2ControlledRolloutDecisionV1,
    { readonly mode: 'controlled_reveal_candidate' }
  >,
): Readonly<{
  rolloutPolicyVersion: string;
  characterId: string;
  domain: SajuDomain;
  evaluatorVersion: string;
}> {
  return Object.freeze({
    rolloutPolicyVersion: decision.artifactCandidate.rolloutPolicyVersion,
    characterId: decision.artifactCandidate.characterId,
    domain: decision.artifactCandidate.domain,
    evaluatorVersion: decision.artifactCandidate.evaluatorVersion,
  });
}

export function commitAndRevealProductionCharacterSajuSp2V1(input: {
  readonly turnId: string;
  readonly attemptId: string;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly rolloutDecision: CharacterSajuSp2ControlledRolloutDecisionV1;
  readonly commitPort: CharacterSajuSp2CommitPortV1;
  readonly telemetrySink: ProductionCharacterSajuSp2TelemetrySinkV1;
}): CharacterSajuSp2RolloutOrchestrationResultV1 {
  if (input.rolloutDecision.mode === 'protected_fallback') {
    recordBestEffort(
      input.telemetrySink,
      freezeEvent({
        eventType: 'protected_fallback_required',
        fallbackReason: input.rolloutDecision.reason,
        failureCodes: input.rolloutDecision.failures.map((item) => item.code),
      }),
    );

    return commitAndRevealCharacterSajuSp2ControlledRolloutV1({
      turnId: input.turnId,
      attemptId: input.attemptId,
      providerKey: input.providerKey,
      modelKey: input.modelKey,
      rolloutDecision: input.rolloutDecision,
      commitPort: input.commitPort,
    });
  }

  const metadata = candidateMetadata(input.rolloutDecision);

  recordStrict(
    input.telemetrySink,
    freezeEvent({
      eventType: 'rollout_candidate_authorized',
      ...metadata,
      providerKey: input.providerKey,
      modelKey: input.modelKey,
    }),
  );

  let result: CharacterSajuSp2RolloutOrchestrationResultV1;
  try {
    result = commitAndRevealCharacterSajuSp2ControlledRolloutV1({
      turnId: input.turnId,
      attemptId: input.attemptId,
      providerKey: input.providerKey,
      modelKey: input.modelKey,
      rolloutDecision: input.rolloutDecision,
      commitPort: input.commitPort,
    });
  } catch (error) {
    recordBestEffort(
      input.telemetrySink,
      freezeEvent({
        eventType: 'commit_failed',
        ...metadata,
        providerKey: input.providerKey,
        modelKey: input.modelKey,
      }),
    );
    throw error;
  }

  if (result.status !== 'delivered') {
    return result;
  }

  if (!result.replayedCommittedTurn) {
    recordStrict(
      input.telemetrySink,
      freezeEvent({
        eventType: 'artifact_committed',
        ...metadata,
        providerKey: input.providerKey,
        modelKey: input.modelKey,
      }),
    );
  }

  recordStrict(
    input.telemetrySink,
    freezeEvent({
      eventType: result.replayedCommittedTurn
        ? 'controlled_reveal_replayed'
        : 'controlled_reveal_delivered',
      ...metadata,
      providerKey: input.providerKey,
      modelKey: input.modelKey,
    }),
  );

  return result;
}
