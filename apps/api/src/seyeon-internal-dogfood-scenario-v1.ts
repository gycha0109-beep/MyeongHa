import type {
  ProductionSeyeonInternalDogfoodHarnessV1,
  RunSeyeonInternalDogfoodTurnResultV1,
  SeyeonInternalDogfoodWorkerLeaseV1,
} from './seyeon-internal-dogfood-harness-v1.js';
import type {
  SeyeonStructuredProviderTelemetrySnapshotV1,
} from './seyeon-structured-provider-telemetry-v1.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

export const SEYEON_INTERNAL_DOGFOOD_SCENARIO_VERSION_V1 =
  'seyeon-internal-dogfood-scenario-v1' as const;

export type SeyeonInternalDogfoodScenarioKindV1 =
  | 'FIRST_MEETING'
  | 'NORMAL_ACCUMULATION'
  | 'FALSE_SHARED_HISTORY'
  | 'UNDEFINED_BIOGRAPHY'
  | 'DEEP_RELATIONSHIP'
  | 'OPEN_CONFLICT'
  | 'RECONCILIATION'
  | 'RETURN_AFTER_ABSENCE'
  | 'REPLAY';

export interface SeyeonInternalDogfoodScenarioTurnV1 {
  readonly turnKey: string;
  readonly text: string;
  readonly clientTurnId?: string;
}

export interface SeyeonInternalDogfoodScenarioSpecV1 {
  readonly scenarioId: string;
  readonly kind: SeyeonInternalDogfoodScenarioKindV1;
  readonly description: string;
  readonly requiredPrecondition: string;
  readonly turns: readonly SeyeonInternalDogfoodScenarioTurnV1[];
}

export interface SeyeonInternalDogfoodLeasePairV1 {
  readonly postTurnLease: SeyeonInternalDogfoodWorkerLeaseV1;
  readonly relationshipLease: SeyeonInternalDogfoodWorkerLeaseV1;
}

export interface SeyeonInternalDogfoodTurnTraceV1 {
  readonly userMove: string;
  readonly immediateWant: string;
  readonly tension: string;
  readonly chosenAction: string;
  readonly expressionState: string;
  readonly revealLevel: string;
  readonly memoryRefsUsed: readonly string[];
  readonly memoryRefsMentioned: readonly string[];
  readonly privateSourceRefsMentioned: readonly string[];
}

export interface SeyeonInternalDogfoodScenarioTurnEvidenceV1 {
  readonly turnIndex: number;
  readonly turnKey: string;
  readonly clientTurnId: string;
  readonly userText: string;
  readonly assistantText: string;
  readonly disposition: 'executed' | 'committed_replay';
  readonly turnId: string;
  readonly assistantMessageId: string;
  readonly postTurnDecision: string | null;
  readonly relationshipRevision:
    | Readonly<{
        readonly revisionBefore: number;
        readonly revisionAfter: number;
        readonly applied: boolean;
        readonly replayed: boolean;
      }>
    | null;
  readonly providerCallsBefore: number | null;
  readonly providerCallsAfter: number | null;
  readonly providerCallDelta: number | null;
  readonly trace: SeyeonInternalDogfoodTurnTraceV1 | null;
}

export interface RunSeyeonInternalDogfoodScenarioResultV1 {
  readonly version: typeof SEYEON_INTERNAL_DOGFOOD_SCENARIO_VERSION_V1;
  readonly scenarioId: string;
  readonly kind: SeyeonInternalDogfoodScenarioKindV1;
  readonly requiredPrecondition: string;
  readonly subjectId: string;
  readonly threadId: string;
  readonly turns: readonly SeyeonInternalDogfoodScenarioTurnEvidenceV1[];
  readonly providerTelemetryBefore:
    SeyeonStructuredProviderTelemetrySnapshotV1 | null;
  readonly providerTelemetryAfter:
    SeyeonStructuredProviderTelemetrySnapshotV1 | null;
}

export class SeyeonInternalDogfoodScenarioErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonInternalDogfoodScenarioErrorV1';
  }
}

function requiredText(value: string, path: string, max: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > max) {
    throw new SeyeonInternalDogfoodScenarioErrorV1(
      path + ' must be non-empty text within ' + max + ' characters.',
    );
  }
  return normalized;
}

function scenarioKey(value: string, path: string): string {
  const normalized = requiredText(value, path, 128);
  if (!/^[A-Za-z0-9._:-]+$/u.test(normalized)) {
    throw new SeyeonInternalDogfoodScenarioErrorV1(
      path + ' contains unsupported characters.',
    );
  }
  return normalized;
}

function clientTurnId(input: {
  readonly scenarioId: string;
  readonly turn: SeyeonInternalDogfoodScenarioTurnV1;
}): string {
  if (input.turn.clientTurnId !== undefined) {
    return scenarioKey(input.turn.clientTurnId, 'clientTurnId');
  }
  return scenarioKey(
    input.scenarioId + ':' + input.turn.turnKey,
    'derived clientTurnId',
  );
}

function validateScenario(
  scenario: SeyeonInternalDogfoodScenarioSpecV1,
): Readonly<{
  scenarioId: string;
  description: string;
  requiredPrecondition: string;
}> {
  const scenarioId = scenarioKey(scenario.scenarioId, 'scenarioId');
  const description = requiredText(scenario.description, 'description', 1200);
  const requiredPrecondition = requiredText(
    scenario.requiredPrecondition,
    'requiredPrecondition',
    1200,
  );
  if (scenario.turns.length < 1 || scenario.turns.length > 30) {
    throw new SeyeonInternalDogfoodScenarioErrorV1(
      'Scenario must contain between 1 and 30 turns.',
    );
  }

  const turnKeys = new Set<string>();
  const clientTurns = new Map<string, string>();
  for (const turn of scenario.turns) {
    const turnKey = scenarioKey(turn.turnKey, 'turnKey');
    if (turnKeys.has(turnKey)) {
      throw new SeyeonInternalDogfoodScenarioErrorV1(
        'Scenario turnKey values must be unique.',
      );
    }
    turnKeys.add(turnKey);

    const text = requiredText(turn.text, 'turn.text', 8000);
    const id = clientTurnId({ scenarioId, turn });
    const previousText = clientTurns.get(id);
    if (previousText !== undefined) {
      if (scenario.kind !== 'REPLAY' || previousText !== text) {
        throw new SeyeonInternalDogfoodScenarioErrorV1(
          'Repeated clientTurnId is only allowed for identical REPLAY turns.',
        );
      }
    } else {
      clientTurns.set(id, text);
    }
  }

  return Object.freeze({ scenarioId, description, requiredPrecondition });
}

function turnEvidence(input: {
  readonly turnIndex: number;
  readonly turnKey: string;
  readonly clientTurnId: string;
  readonly userText: string;
  readonly result: RunSeyeonInternalDogfoodTurnResultV1;
  readonly providerCallsBefore: number | null;
  readonly providerCallsAfter: number | null;
}): SeyeonInternalDogfoodScenarioTurnEvidenceV1 {
  const execution = input.result.chat.execution;
  if (execution.disposition === 'committed_replay') {
    return Object.freeze({
      turnIndex: input.turnIndex,
      turnKey: input.turnKey,
      clientTurnId: input.clientTurnId,
      userText: input.userText,
      assistantText: execution.assistantText,
      disposition: 'committed_replay' as const,
      turnId: execution.committedTurn.turnId,
      assistantMessageId: execution.committedTurn.assistantMessageId,
      postTurnDecision: null,
      relationshipRevision: null,
      providerCallsBefore: input.providerCallsBefore,
      providerCallsAfter: input.providerCallsAfter,
      providerCallDelta:
        input.providerCallsBefore === null || input.providerCallsAfter === null
          ? null
          : input.providerCallsAfter - input.providerCallsBefore,
      trace: null,
    });
  }

  const runtimeResult = execution.runtimeResult;
  return Object.freeze({
    turnIndex: input.turnIndex,
    turnKey: input.turnKey,
    clientTurnId: input.clientTurnId,
    userText: input.userText,
    assistantText: runtimeResult.envelope.utterance,
    disposition: 'executed' as const,
    turnId: execution.committedTurn.turnId,
    assistantMessageId: execution.committedTurn.assistantMessageId,
    postTurnDecision: input.result.postTurn?.result.decision ?? null,
    relationshipRevision: input.result.relationshipRevision,
    providerCallsBefore: input.providerCallsBefore,
    providerCallsAfter: input.providerCallsAfter,
    providerCallDelta:
      input.providerCallsBefore === null || input.providerCallsAfter === null
        ? null
        : input.providerCallsAfter - input.providerCallsBefore,
    trace: Object.freeze({
      userMove: runtimeResult.interpretation.userMove,
      immediateWant: runtimeResult.interpretation.immediateWant.key,
      tension: runtimeResult.interpretation.tension.key,
      chosenAction: runtimeResult.interpretation.chosenAction.key,
      expressionState: runtimeResult.envelope.expressionState,
      revealLevel: runtimeResult.envelope.revealLevel,
      memoryRefsUsed: Object.freeze([
        ...runtimeResult.interpretation.memoryRefsUsed,
      ]),
      memoryRefsMentioned: Object.freeze([
        ...runtimeResult.envelope.memoryRefsMentioned,
      ]),
      privateSourceRefsMentioned: Object.freeze([
        ...runtimeResult.envelope.privateSourceRefsMentioned,
      ]),
    }),
  });
}

export async function runSeyeonInternalDogfoodScenarioV1(input: {
  readonly harness: ProductionSeyeonInternalDogfoodHarnessV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly threadId: string;
  readonly scenario: SeyeonInternalDogfoodScenarioSpecV1;
  readonly leaseForTurn: (input: Readonly<{
    turnIndex: number;
    turnKey: string;
    clientTurnId: string;
  }>) => SeyeonInternalDogfoodLeasePairV1;
  readonly readProviderTelemetry?: () =>
    SeyeonStructuredProviderTelemetrySnapshotV1;
}): Promise<RunSeyeonInternalDogfoodScenarioResultV1> {
  const validated = validateScenario(input.scenario);
  const threadId = requiredText(input.threadId, 'threadId', 256);
  const providerTelemetryBefore =
    input.readProviderTelemetry?.() ?? null;
  const evidence: SeyeonInternalDogfoodScenarioTurnEvidenceV1[] = [];
  let subjectId: string | null = null;

  for (let index = 0; index < input.scenario.turns.length; index += 1) {
    const turn = input.scenario.turns[index]!;
    const turnKey = scenarioKey(turn.turnKey, 'turnKey');
    const resolvedClientTurnId = clientTurnId({
      scenarioId: validated.scenarioId,
      turn,
    });
    const userText = requiredText(turn.text, 'turn.text', 8000);
    const lease = input.leaseForTurn({
      turnIndex: index,
      turnKey,
      clientTurnId: resolvedClientTurnId,
    });
    const before = input.readProviderTelemetry?.().totalCalls ?? null;
    const result = await input.harness.run({
      verifiedEvidence: input.verifiedEvidence,
      threadId,
      clientTurnId: resolvedClientTurnId,
      text: userText,
      postTurnLease: lease.postTurnLease,
      relationshipLease: lease.relationshipLease,
    });
    const after = input.readProviderTelemetry?.().totalCalls ?? null;

    if (subjectId === null) subjectId = result.subjectId;
    if (result.subjectId !== subjectId) {
      throw new SeyeonInternalDogfoodScenarioErrorV1(
        'Scenario crossed canonical Subject authority between turns.',
      );
    }

    evidence.push(
      turnEvidence({
        turnIndex: index,
        turnKey,
        clientTurnId: resolvedClientTurnId,
        userText,
        result,
        providerCallsBefore: before,
        providerCallsAfter: after,
      }),
    );
  }

  if (subjectId === null) {
    throw new SeyeonInternalDogfoodScenarioErrorV1(
      'Scenario produced no canonical Subject evidence.',
    );
  }

  return Object.freeze({
    version: SEYEON_INTERNAL_DOGFOOD_SCENARIO_VERSION_V1,
    scenarioId: validated.scenarioId,
    kind: input.scenario.kind,
    requiredPrecondition: validated.requiredPrecondition,
    subjectId,
    threadId,
    turns: Object.freeze(evidence),
    providerTelemetryBefore,
    providerTelemetryAfter:
      input.readProviderTelemetry?.() ?? null,
  });
}
