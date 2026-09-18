import { describe, expect, it } from 'vitest';

import {
  InMemoryCharacterSajuSp2CommitPortV1,
  type CharacterSajuSp2CommitPortV1,
} from '../apps/api/src/character-saju-sp2-rollout-orchestration.js';
import {
  InMemoryProductionCharacterSajuSp2TelemetrySinkV1,
  ProductionCharacterSajuSp2TelemetryErrorV1,
  commitAndRevealProductionCharacterSajuSp2V1,
  type ProductionCharacterSajuSp2TelemetryEventV1,
  type ProductionCharacterSajuSp2TelemetrySinkV1,
} from '../apps/api/src/production-character-saju-sp2-telemetry.js';
import type {
  CharacterSajuSp2ControlledRolloutDecisionV1,
  CharacterSajuSp2ReadingArtifactCandidateV1,
} from '../packages/domain/src/index.js';

const SENSITIVE_TEXT =
  '결과 이후의 관리와 책임까지 챙기는 쪽입니다. sensitive candidate text';
const SENSITIVE_READING_REF = 'reading-sensitive-private-ref';
const SENSITIVE_SOURCE_HASH = 'a'.repeat(64);
const SENSITIVE_GROUNDING_HASH = 'b'.repeat(64);
const SENSITIVE_COHORT = 'internal_sensitive_cohort';

function artifact(
  overrides: Partial<CharacterSajuSp2ReadingArtifactCandidateV1> = {},
): CharacterSajuSp2ReadingArtifactCandidateV1 {
  return {
    schemaVersion: 'myeongha-character-saju-sp2-reading-artifact-v1',
    artifactId: 'character_saju_sp2_artifact_fixture',
    rolloutVersion: 'myeongha-character-saju-sp2-controlled-rollout-v1',
    rolloutPolicyVersion: 'sp2-internal-beta-v1',
    cohortKey: SENSITIVE_COHORT,
    readingRef: SENSITIVE_READING_REF,
    sourceResponseHash: SENSITIVE_SOURCE_HASH,
    groundingHash: SENSITIVE_GROUNDING_HASH,
    characterId: 'taegyeom',
    domain: 'general',
    sourceUnitId: 'grounding_unit_' + '1'.repeat(24),
    candidateHash: 'c'.repeat(64),
    evaluatorVersion: 'fixture-evaluator-v1',
    outputGuardVersion: 'myeongha-character-output-guard-v1',
    rolloutEvidence: {
      evaluationSchemaVersion: 'myeongha-character-saju-sp2-evaluation-v1',
      evaluatorVersion: 'fixture-evaluator-v1',
      caseCount: 1,
      allowedExamples: 1,
      forbiddenExamples: 1,
      semanticPreservationPassRate: 1,
      characterFidelityPassRate: 1,
      unitTraceCoverage: 1,
      corpusPass: true,
      evidenceHash: 'd'.repeat(64),
    },
    controlledReveal: {
      framingBefore: '기록을 기준으로 보겠습니다.',
      semanticRealization: {
        kind: 'semantic_realization',
        text: SENSITIVE_TEXT,
        sourceUnitRefs: ['grounding_unit_' + '1'.repeat(24)],
      },
      protectedSajuDisclosures: [
        {
          disclosureRef: 'sensitive-disclosure-ref',
          type: 'scope_limitation',
          text: 'sensitive protected disclosure text',
          sourceDisclosureIndex: 0,
        },
      ],
      groundingAmbiguity: {
        ambiguityRef: 'sensitive-ambiguity-ref',
        kind: 'reading_block',
        sourceRef: 'sensitive-source-ref',
        summary: 'sensitive ambiguity summary',
      },
      calculationAmbiguity: ['sensitive-calculation-ambiguity'],
      framingAfter: '지금 현실에서는 어떻게 느껴집니까?',
      emotion: 'serious',
      animationCue: null,
      memoryProposals: [],
      relationshipEventProposals: [],
      suggestedActions: [],
    },
    protectedFallbackEnvelope: {
      schemaVersion: 'v1',
      framingBefore: '기록을 기준으로 보겠습니다.',
      protectedSajuSegments: [],
      protectedSajuDisclosures: [],
      calculationAmbiguity: [],
      framingAfter: '지금 현실에서는 어떻게 느껴집니까?',
      emotion: 'serious',
      animationCue: null,
      memoryProposals: [],
      relationshipEventProposals: [],
      suggestedActions: [],
    },
    validationState: 'semantic_validated',
    commitState: 'requires_atomic_commit',
    revealState: 'forbidden_before_commit',
    ...overrides,
  };
}

function acceptedDecision(
  item = artifact(),
): CharacterSajuSp2ControlledRolloutDecisionV1 {
  return {
    mode: 'controlled_reveal_candidate',
    validationState: 'sp2_controlled_rollout_validated',
    artifactCandidate: item,
    revealState: 'requires_atomic_commit',
  };
}

function fallbackDecision(): CharacterSajuSp2ControlledRolloutDecisionV1 {
  return {
    mode: 'protected_fallback',
    validationState: 'fallback_used',
    reason: 'rollout_not_authorized',
    failures: [
      {
        code: 'ROLLOUT_DISABLED',
        detail: 'synthetic kill switch',
      },
    ],
    fallbackRequired: true,
    revealState: 'forbidden',
  };
}

function run(input: {
  readonly decision?: CharacterSajuSp2ControlledRolloutDecisionV1;
  readonly commitPort?: CharacterSajuSp2CommitPortV1;
  readonly telemetrySink?: ProductionCharacterSajuSp2TelemetrySinkV1;
  readonly turnId?: string;
}) {
  return commitAndRevealProductionCharacterSajuSp2V1({
    turnId: input.turnId ?? 'turn-sensitive-identifier',
    attemptId: 'attempt-sensitive-identifier',
    providerKey: 'fixture-provider',
    modelKey: 'fixture-model',
    rolloutDecision: input.decision ?? acceptedDecision(),
    commitPort: input.commitPort ?? new InMemoryCharacterSajuSp2CommitPortV1(),
    telemetrySink:
      input.telemetrySink ??
      new InMemoryProductionCharacterSajuSp2TelemetrySinkV1(),
  });
}

describe('production Character Saju SP-2 telemetry v1', () => {
  it('records only privacy-minimized operational metadata for a delivered reveal', () => {
    const commitPort = new InMemoryCharacterSajuSp2CommitPortV1();
    const telemetry = new InMemoryProductionCharacterSajuSp2TelemetrySinkV1();

    const result = run({ commitPort, telemetrySink: telemetry });

    expect(result.status).toBe('delivered');
    expect(telemetry.events.map((event) => event.eventType)).toEqual([
      'rollout_candidate_authorized',
      'artifact_committed',
      'controlled_reveal_delivered',
    ]);

    const serialized = JSON.stringify(telemetry.events);
    expect(serialized).toContain('sp2-internal-beta-v1');
    expect(serialized).toContain('taegyeom');
    expect(serialized).toContain('general');
    expect(serialized).toContain('fixture-evaluator-v1');
    expect(serialized).not.toContain(SENSITIVE_TEXT);
    expect(serialized).not.toContain(SENSITIVE_READING_REF);
    expect(serialized).not.toContain(SENSITIVE_SOURCE_HASH);
    expect(serialized).not.toContain(SENSITIVE_GROUNDING_HASH);
    expect(serialized).not.toContain(SENSITIVE_COHORT);
    expect(serialized).not.toContain('turn-sensitive-identifier');
    expect(serialized).not.toContain('attempt-sensitive-identifier');
    expect(serialized).not.toContain('sensitive protected disclosure text');
    expect(serialized).not.toContain('sensitive ambiguity summary');
  });

  it('records replay separately without pretending a second artifact commit occurred', () => {
    const commitPort = new InMemoryCharacterSajuSp2CommitPortV1();
    const telemetry = new InMemoryProductionCharacterSajuSp2TelemetrySinkV1();

    const first = run({
      commitPort,
      telemetrySink: telemetry,
      turnId: 'turn-replay',
    });
    const replay = run({
      commitPort,
      telemetrySink: telemetry,
      turnId: 'turn-replay',
    });

    expect(first.status).toBe('delivered');
    expect(replay.status).toBe('delivered');
    if (replay.status !== 'delivered') throw new Error('expected delivery');
    expect(replay.replayedCommittedTurn).toBe(true);
    expect(
      telemetry.events.filter((event) => event.eventType === 'artifact_committed'),
    ).toHaveLength(1);
    expect(telemetry.events.at(-1)?.eventType).toBe(
      'controlled_reveal_replayed',
    );
  });

  it('fails before commit when required pre-reveal telemetry cannot be recorded', () => {
    const commitPort = new InMemoryCharacterSajuSp2CommitPortV1();
    const telemetry: ProductionCharacterSajuSp2TelemetrySinkV1 = {
      record() {
        throw new Error('synthetic telemetry outage');
      },
    };

    expect(() =>
      run({ commitPort, telemetrySink: telemetry }),
    ).toThrowError(ProductionCharacterSajuSp2TelemetryErrorV1);
    expect(commitPort.committedCount).toBe(0);
  });

  it('withholds reveal when telemetry fails after atomic commit and can safely replay later', () => {
    const commitPort = new InMemoryCharacterSajuSp2CommitPortV1();
    let calls = 0;
    const failingTelemetry: ProductionCharacterSajuSp2TelemetrySinkV1 = {
      record() {
        calls += 1;
        if (calls === 2) {
          throw new Error('synthetic post-commit telemetry outage');
        }
      },
    };

    expect(() =>
      run({
        commitPort,
        telemetrySink: failingTelemetry,
        turnId: 'turn-post-commit-telemetry-fail',
      }),
    ).toThrowError(ProductionCharacterSajuSp2TelemetryErrorV1);
    expect(commitPort.committedCount).toBe(1);

    const recoveryTelemetry =
      new InMemoryProductionCharacterSajuSp2TelemetrySinkV1();
    const replay = run({
      commitPort,
      telemetrySink: recoveryTelemetry,
      turnId: 'turn-post-commit-telemetry-fail',
    });

    expect(replay.status).toBe('delivered');
    if (replay.status !== 'delivered') throw new Error('expected recovery delivery');
    expect(replay.replayedCommittedTurn).toBe(true);
    expect(recoveryTelemetry.events.map((event) => event.eventType)).toEqual([
      'rollout_candidate_authorized',
      'controlled_reveal_replayed',
    ]);
  });

  it('keeps protected fallback authoritative even when fallback telemetry is unavailable', () => {
    const commitPort = new InMemoryCharacterSajuSp2CommitPortV1();
    const telemetry: ProductionCharacterSajuSp2TelemetrySinkV1 = {
      record() {
        throw new Error('synthetic telemetry outage');
      },
    };

    const result = run({
      decision: fallbackDecision(),
      commitPort,
      telemetrySink: telemetry,
    });

    expect(result.status).toBe('protected_fallback_required');
    expect(commitPort.committedCount).toBe(0);
  });

  it('records commit failure metadata without exposing payload data', () => {
    const events: ProductionCharacterSajuSp2TelemetryEventV1[] = [];
    const telemetry: ProductionCharacterSajuSp2TelemetrySinkV1 = {
      record(event) {
        events.push(event);
      },
    };
    const commitPort: CharacterSajuSp2CommitPortV1 = {
      findCommitted: () => null,
      commit: () => {
        throw new Error('synthetic durable commit failure');
      },
    };

    expect(() =>
      run({ commitPort, telemetrySink: telemetry }),
    ).toThrow(/synthetic durable commit failure/u);
    expect(events.map((event) => event.eventType)).toEqual([
      'rollout_candidate_authorized',
      'commit_failed',
    ]);
    expect(JSON.stringify(events)).not.toContain(SENSITIVE_TEXT);
    expect(JSON.stringify(events)).not.toContain(SENSITIVE_READING_REF);
  });
});
