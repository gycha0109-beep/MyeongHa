import { describe, expect, it } from 'vitest';

import {
  CharacterSajuSp2RolloutOrchestrationError,
  InMemoryCharacterSajuSp2CommitPortV1,
  commitAndRevealCharacterSajuSp2ControlledRolloutV1,
  type CharacterSajuSp2CommitPortV1,
} from '../apps/api/src/character-saju-sp2-rollout-orchestration.js';
import type {
  CharacterSajuSp2ControlledRolloutDecisionV1,
  CharacterSajuSp2ReadingArtifactCandidateV1,
} from '../packages/domain/src/index.js';

function artifact(
  overrides: Partial<CharacterSajuSp2ReadingArtifactCandidateV1> = {},
): CharacterSajuSp2ReadingArtifactCandidateV1 {
  return {
    schemaVersion: 'myeongha-character-saju-sp2-reading-artifact-v1',
    artifactId: 'character_saju_sp2_artifact_fixture',
    rolloutVersion: 'myeongha-character-saju-sp2-controlled-rollout-v1',
    rolloutPolicyVersion: 'sp2-internal-beta-v1',
    cohortKey: 'internal_beta',
    readingRef: 'reading-rollout-1',
    sourceResponseHash: 'a'.repeat(64),
    groundingHash: 'b'.repeat(64),
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
        text: '결과 이후의 관리와 책임까지 챙기는 쪽입니다.',
        sourceUnitRefs: ['grounding_unit_' + '1'.repeat(24)],
      },
      protectedSajuDisclosures: [],
      groundingAmbiguity: null,
      calculationAmbiguity: [],
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

describe('SP-2 controlled rollout atomic commit/reveal orchestration', () => {
  it('reveals only after the exact authorized artifact is atomically committed', () => {
    const commitPort = new InMemoryCharacterSajuSp2CommitPortV1();
    const result = commitAndRevealCharacterSajuSp2ControlledRolloutV1({
      turnId: 'turn-1',
      attemptId: 'attempt-1',
      providerKey: 'fixture-provider',
      modelKey: 'fixture-model',
      rolloutDecision: acceptedDecision(),
      commitPort,
    });

    expect(result.status).toBe('delivered');
    if (result.status !== 'delivered') throw new Error('expected delivery');
    expect(result.revealState).toBe('controlled_reveal_after_atomic_commit');
    expect(result.stateTrace).toEqual([
      'received',
      'planned',
      'rollout_validated',
      'committed',
      'delivered',
    ]);
    expect(commitPort.committedCount).toBe(1);
    expect(result.commitReceipt.artifactId).toBe(result.artifact.artifactId);
    expect(result.commitReceipt.candidateHash).toBe(result.artifact.candidateHash);
  });

  it('replays the same committed artifact without a second commit', () => {
    const commitPort = new InMemoryCharacterSajuSp2CommitPortV1();
    const input = {
      turnId: 'turn-replay',
      providerKey: 'fixture-provider',
      modelKey: 'fixture-model',
      rolloutDecision: acceptedDecision(),
      commitPort,
    } as const;

    const first = commitAndRevealCharacterSajuSp2ControlledRolloutV1({
      ...input,
      attemptId: 'attempt-1',
    });
    const replay = commitAndRevealCharacterSajuSp2ControlledRolloutV1({
      ...input,
      attemptId: 'attempt-2',
    });

    expect(first.status).toBe('delivered');
    expect(replay.status).toBe('delivered');
    if (first.status !== 'delivered' || replay.status !== 'delivered') {
      throw new Error('expected delivery');
    }
    expect(replay.replayedCommittedTurn).toBe(true);
    expect(commitPort.committedCount).toBe(1);
    expect(replay.commitReceipt).toEqual(first.commitReceipt);
  });

  it('honors the current kill switch before consulting an old committed reveal', () => {
    const commitPort = new InMemoryCharacterSajuSp2CommitPortV1();
    const first = commitAndRevealCharacterSajuSp2ControlledRolloutV1({
      turnId: 'turn-kill-switch',
      attemptId: 'attempt-1',
      providerKey: 'fixture-provider',
      modelKey: 'fixture-model',
      rolloutDecision: acceptedDecision(),
      commitPort,
    });
    expect(first.status).toBe('delivered');

    const blocked = commitAndRevealCharacterSajuSp2ControlledRolloutV1({
      turnId: 'turn-kill-switch',
      attemptId: 'attempt-2',
      providerKey: 'fixture-provider',
      modelKey: 'fixture-model',
      rolloutDecision: fallbackDecision(),
      commitPort,
    });

    expect(blocked.status).toBe('protected_fallback_required');
    expect(blocked.revealState).toBe('forbidden');
    expect(commitPort.committedCount).toBe(1);
  });

  it('never commits when rollout authority requires protected fallback', () => {
    const commitPort = new InMemoryCharacterSajuSp2CommitPortV1();
    const result = commitAndRevealCharacterSajuSp2ControlledRolloutV1({
      turnId: 'turn-fallback',
      attemptId: 'attempt-1',
      providerKey: 'fixture-provider',
      modelKey: 'fixture-model',
      rolloutDecision: fallbackDecision(),
      commitPort,
    });

    expect(result.status).toBe('protected_fallback_required');
    expect(result.stateTrace).toEqual([
      'received',
      'planned',
      'fallback_required',
    ]);
    expect(commitPort.committedCount).toBe(0);
  });

  it('rejects a pre-revealed artifact before commit', () => {
    const commitPort = new InMemoryCharacterSajuSp2CommitPortV1();
    const invalid = artifact({
      revealState: 'controlled_reveal_after_atomic_commit' as never,
    });

    expect(() =>
      commitAndRevealCharacterSajuSp2ControlledRolloutV1({
        turnId: 'turn-invalid-state',
        attemptId: 'attempt-1',
        providerKey: 'fixture-provider',
        modelKey: 'fixture-model',
        rolloutDecision: acceptedDecision(invalid),
        commitPort,
      }),
    ).toThrow(CharacterSajuSp2RolloutOrchestrationError);
    expect(commitPort.committedCount).toBe(0);
  });

  it('cannot replace an already committed logical turn with different SP-2 content', () => {
    const commitPort = new InMemoryCharacterSajuSp2CommitPortV1();
    commitAndRevealCharacterSajuSp2ControlledRolloutV1({
      turnId: 'turn-immutable',
      attemptId: 'attempt-1',
      providerKey: 'fixture-provider',
      modelKey: 'fixture-model',
      rolloutDecision: acceptedDecision(),
      commitPort,
    });

    expect(() =>
      commitAndRevealCharacterSajuSp2ControlledRolloutV1({
        turnId: 'turn-immutable',
        attemptId: 'attempt-2',
        providerKey: 'fixture-provider',
        modelKey: 'fixture-model',
        rolloutDecision: acceptedDecision(
          artifact({
            artifactId: 'character_saju_sp2_artifact_other',
            candidateHash: 'e'.repeat(64),
          }),
        ),
        commitPort,
      }),
    ).toThrow(/does not match the currently authorized rollout artifact/u);
    expect(commitPort.committedCount).toBe(1);
  });

  it('does not reveal when the atomic commit port fails', () => {
    const commitPort: CharacterSajuSp2CommitPortV1 = {
      findCommitted: () => null,
      commit: () => {
        throw new Error('synthetic durable commit failure');
      },
    };

    expect(() =>
      commitAndRevealCharacterSajuSp2ControlledRolloutV1({
        turnId: 'turn-commit-fail',
        attemptId: 'attempt-1',
        providerKey: 'fixture-provider',
        modelKey: 'fixture-model',
        rolloutDecision: acceptedDecision(),
        commitPort,
      }),
    ).toThrow(/synthetic durable commit failure/u);
  });
});
