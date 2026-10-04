import type {
  ProductionSeyeonInternalDogfoodHarnessV1,
} from './seyeon-internal-dogfood-harness-v1.js';
import {
  runSeyeonInternalLiveDogfoodSessionV1,
  type SeyeonInternalLiveDogfoodTurnSummaryV1,
} from './seyeon-internal-live-dogfood-v1.js';
import type {
  SeyeonInternalDogfoodRelationshipInspectionV1,
  SeyeonInternalDogfoodRelationshipInspectorV1,
} from './seyeon-internal-dogfood-relationship-inspector-v1.js';
import type {
  SeyeonInternalDogfoodScenarioV1,
} from './seyeon-internal-dogfood-scenarios-v1.js';
import {
  diffSeyeonStructuredProviderInvocationsV1,
  type ObservedSeyeonStructuredProviderV1,
  type SeyeonStructuredProviderInvocationSnapshotV1,
} from './seyeon-structured-provider-observer-v1.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

export const SEYEON_INTERNAL_DOGFOOD_SCENARIO_RUNNER_VERSION_V1 =
  'seyeon-internal-dogfood-scenario-runner-v1' as const;

export interface RunSeyeonInternalDogfoodScenarioInputV1 {
  readonly harness: ProductionSeyeonInternalDogfoodHarnessV1;
  readonly observer: ObservedSeyeonStructuredProviderV1;
  readonly relationshipInspector?:
    SeyeonInternalDogfoodRelationshipInspectorV1;
  readonly scenario: SeyeonInternalDogfoodScenarioV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly threadId: string;
  readonly runId: string;
  readonly verifyFinalReplay: boolean;
  readonly now?: () => Date;
}

export interface SeyeonInternalDogfoodScenarioTurnResultV1 {
  readonly turnIndex: number;
  readonly clientTurnId: string;
  readonly userText: string;
  readonly assistant: SeyeonInternalLiveDogfoodTurnSummaryV1;
  readonly providerDelta: SeyeonStructuredProviderInvocationSnapshotV1;
  readonly finalReplay:
    | Readonly<{
        readonly assistant: SeyeonInternalLiveDogfoodTurnSummaryV1;
        readonly providerDelta: SeyeonStructuredProviderInvocationSnapshotV1;
      }>
    | null;
}

export interface RunSeyeonInternalDogfoodScenarioResultV1 {
  readonly version:
    typeof SEYEON_INTERNAL_DOGFOOD_SCENARIO_RUNNER_VERSION_V1;
  readonly scenarioId: string;
  readonly description: string;
  readonly reviewFocus: readonly string[];
  readonly runId: string;
  readonly threadId: string;
  readonly subjectId: string;
  readonly turnCount: number;
  readonly relationshipPreflight:
    SeyeonInternalDogfoodRelationshipInspectionV1 | null;
  readonly turns: readonly SeyeonInternalDogfoodScenarioTurnResultV1[];
  readonly providerDelta: SeyeonStructuredProviderInvocationSnapshotV1;
}

export class SeyeonInternalDogfoodScenarioRunnerErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonInternalDogfoodScenarioRunnerErrorV1';
  }
}

function assertRelationshipPrecondition(
  scenario: SeyeonInternalDogfoodScenarioV1,
  inspection: SeyeonInternalDogfoodRelationshipInspectionV1,
): void {
  const expected = scenario.relationshipPrecondition;
  if (expected === undefined) return;

  const relationship = inspection.relationship;
  if (relationship === null) {
    throw new SeyeonInternalDogfoodScenarioRunnerErrorV1(
      'Scenario requires an existing authoritative Production relationship.',
    );
  }
  if (
    expected.attainedStage !== undefined &&
    relationship.attainedStage !== expected.attainedStage
  ) {
    throw new SeyeonInternalDogfoodScenarioRunnerErrorV1(
      'Scenario relationship attained stage precondition is not satisfied.',
    );
  }
  if (
    expected.currentCondition !== undefined &&
    relationship.currentCondition !== expected.currentCondition
  ) {
    throw new SeyeonInternalDogfoodScenarioRunnerErrorV1(
      'Scenario relationship condition precondition is not satisfied.',
    );
  }
  if (
    expected.behaviorAccess !== undefined &&
    relationship.behaviorAccess !== expected.behaviorAccess
  ) {
    throw new SeyeonInternalDogfoodScenarioRunnerErrorV1(
      'Scenario relationship behavior-access precondition is not satisfied.',
    );
  }
  for (const kind of expected.requiredActiveEventKinds ?? []) {
    if (!inspection.activeEventKinds.includes(kind)) {
      throw new SeyeonInternalDogfoodScenarioRunnerErrorV1(
        'Scenario requires authoritative active relationship Event kind ' +
          kind + '.',
      );
    }
  }
}

function boundedRunId(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 64 ||
    !/^[A-Za-z0-9._-]+$/u.test(normalized)
  ) {
    throw new SeyeonInternalDogfoodScenarioRunnerErrorV1(
      'Scenario runId must use 1-64 characters from A-Z, a-z, 0-9, dot, underscore, or hyphen.',
    );
  }
  return normalized;
}

function clientTurnId(
  scenarioId: string,
  runId: string,
  turnIndex: number,
): string {
  const value =
    'dogfood:' + scenarioId + ':' + runId + ':' +
    String(turnIndex).padStart(2, '0');
  if (value.length > 256) {
    throw new SeyeonInternalDogfoodScenarioRunnerErrorV1(
      'Generated scenario clientTurnId exceeds the Production bound.',
    );
  }
  return value;
}

function leaseExpiresAt(now: Date): string {
  return new Date(now.getTime() + 15 * 60_000).toISOString();
}

function lockSuffix(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/gu, '_');
}

export async function runSeyeonInternalDogfoodScenarioV1(
  input: RunSeyeonInternalDogfoodScenarioInputV1,
): Promise<RunSeyeonInternalDogfoodScenarioResultV1> {
  const runId = boundedRunId(input.runId);
  if (input.scenario.turns.length === 0) {
    throw new SeyeonInternalDogfoodScenarioRunnerErrorV1(
      'Scenario must contain at least one turn.',
    );
  }

  let relationshipPreflight:
    SeyeonInternalDogfoodRelationshipInspectionV1 | null = null;
  if (input.scenario.relationshipPrecondition !== undefined) {
    if (input.relationshipInspector === undefined) {
      throw new SeyeonInternalDogfoodScenarioRunnerErrorV1(
        'Governed relationship scenario requires a server-owned relationship inspector.',
      );
    }
    relationshipPreflight =
      await input.relationshipInspector.inspect({
        verifiedEvidence: input.verifiedEvidence,
      });
    assertRelationshipPrecondition(
      input.scenario,
      relationshipPreflight,
    );
  }

  const scenarioProviderBefore = input.observer.snapshot();
  const results: SeyeonInternalDogfoodScenarioTurnResultV1[] = [];
  let subjectId: string | null =
    relationshipPreflight?.subjectId ?? null;

  for (
    let zeroIndex = 0;
    zeroIndex < input.scenario.turns.length;
    zeroIndex += 1
  ) {
    const fixture = input.scenario.turns[zeroIndex]!;
    const turnIndex = zeroIndex + 1;
    const turnClientId = clientTurnId(
      input.scenario.scenarioId,
      runId,
      turnIndex,
    );
    const now = input.now?.() ?? new Date();
    const expiresAt = leaseExpiresAt(now);
    const before = input.observer.snapshot();
    const verifyReplay =
      input.verifyFinalReplay &&
      turnIndex === input.scenario.turns.length;

    const session = await runSeyeonInternalLiveDogfoodSessionV1({
      harness: input.harness,
      observer: input.observer,
      verifyReplay,
      turn: Object.freeze({
        verifiedEvidence: input.verifiedEvidence,
        threadId: input.threadId,
        clientTurnId: turnClientId,
        text: fixture.text,
        postTurnLease: Object.freeze({
          lockOwner:
            'seyeon-scenario-post-' + lockSuffix(turnClientId),
          leaseExpiresAt: expiresAt,
        }),
        relationshipLease: Object.freeze({
          lockOwner:
            'seyeon-scenario-relationship-' + lockSuffix(turnClientId),
          leaseExpiresAt: expiresAt,
        }),
      }),
    });
    const after = input.observer.snapshot();

    if (subjectId === null) {
      subjectId = session.first.subjectId;
    } else if (session.first.subjectId !== subjectId) {
      throw new SeyeonInternalDogfoodScenarioRunnerErrorV1(
        'Scenario turns resolved different canonical Subjects.',
      );
    }

    results.push(Object.freeze({
      turnIndex,
      clientTurnId: turnClientId,
      userText: fixture.text,
      assistant: session.first,
      providerDelta:
        diffSeyeonStructuredProviderInvocationsV1(before, after),
      finalReplay:
        session.replay === null || session.providerReplayDelta === null
          ? null
          : Object.freeze({
              assistant: session.replay,
              providerDelta: session.providerReplayDelta,
            }),
    }));
  }

  if (subjectId === null) {
    throw new SeyeonInternalDogfoodScenarioRunnerErrorV1(
      'Scenario completed without a resolved Subject.',
    );
  }

  return Object.freeze({
    version: SEYEON_INTERNAL_DOGFOOD_SCENARIO_RUNNER_VERSION_V1,
    scenarioId: input.scenario.scenarioId,
    description: input.scenario.description,
    reviewFocus: input.scenario.reviewFocus,
    runId,
    threadId: input.threadId,
    subjectId,
    turnCount: results.length,
    relationshipPreflight,
    turns: Object.freeze(results),
    providerDelta: diffSeyeonStructuredProviderInvocationsV1(
      scenarioProviderBefore,
      input.observer.snapshot(),
    ),
  });
}
