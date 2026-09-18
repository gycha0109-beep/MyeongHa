import { createHash } from 'node:crypto';

import {
  canonicalJson,
  type CharacterSajuSp2ControlledRolloutDecisionV1,
  type CharacterSajuSp2ReadingArtifactCandidateV1,
  type CharacterSajuSp2RolloutFailureV1,
} from '../../../packages/domain/src/index.js';

export const CHARACTER_SAJU_SP2_COMMIT_SCHEMA_VERSION_V1 =
  'myeongha-character-saju-sp2-commit-v1' as const;

export interface CharacterSajuSp2CommitReceiptV1 {
  readonly schemaVersion: typeof CHARACTER_SAJU_SP2_COMMIT_SCHEMA_VERSION_V1;
  readonly turnId: string;
  readonly attemptId: string;
  readonly receiptId: string;
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly rolloutPolicyVersion: string;
  readonly candidateHash: string;
  readonly providerKey: string;
  readonly modelKey: string;
}

export interface CharacterSajuSp2CommittedArtifactV1 {
  readonly receipt: CharacterSajuSp2CommitReceiptV1;
  readonly artifact: CharacterSajuSp2ReadingArtifactCandidateV1;
}

export interface CharacterSajuSp2CommitPortV1 {
  findCommitted(turnId: string): CharacterSajuSp2CommittedArtifactV1 | null;
  commit(input: {
    readonly turnId: string;
    readonly attemptId: string;
    readonly providerKey: string;
    readonly modelKey: string;
    readonly artifact: CharacterSajuSp2ReadingArtifactCandidateV1;
  }): CharacterSajuSp2CommittedArtifactV1;
}

export type CharacterSajuSp2RolloutOrchestrationStateV1 =
  | 'received'
  | 'planned'
  | 'fallback_required'
  | 'rollout_validated'
  | 'committed'
  | 'delivered';

export type CharacterSajuSp2RolloutOrchestrationResultV1 =
  | {
      readonly status: 'protected_fallback_required';
      readonly reason: Extract<
        CharacterSajuSp2ControlledRolloutDecisionV1,
        { readonly mode: 'protected_fallback' }
      >['reason'];
      readonly failures: readonly CharacterSajuSp2RolloutFailureV1[];
      readonly stateTrace: readonly CharacterSajuSp2RolloutOrchestrationStateV1[];
      readonly revealState: 'forbidden';
    }
  | {
      readonly status: 'delivered';
      readonly replayedCommittedTurn: boolean;
      readonly stateTrace: readonly CharacterSajuSp2RolloutOrchestrationStateV1[];
      readonly revealState: 'controlled_reveal_after_atomic_commit';
      readonly artifact: CharacterSajuSp2ReadingArtifactCandidateV1;
      readonly commitReceipt: CharacterSajuSp2CommitReceiptV1;
    };

export class CharacterSajuSp2RolloutOrchestrationError extends Error {
  constructor(
    readonly stage: 'receive' | 'validate' | 'commit' | 'deliver',
    message: string,
  ) {
    super(message);
    this.name = 'CharacterSajuSp2RolloutOrchestrationError';
  }
}

function requiredIdentifier(value: string, path: string): string {
  if (typeof value !== 'string') {
    throw new CharacterSajuSp2RolloutOrchestrationError(
      'receive',
      `${path} must be a string.`,
    );
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 256) {
    throw new CharacterSajuSp2RolloutOrchestrationError(
      'receive',
      `${path} is outside the supported bounds.`,
    );
  }
  return normalized;
}

function artifactHash(
  artifact: CharacterSajuSp2ReadingArtifactCandidateV1,
): string {
  return `sha256:v1:${createHash('sha256')
    .update(canonicalJson(artifact), 'utf8')
    .digest('hex')}`;
}

function assertRevealCandidate(
  artifact: CharacterSajuSp2ReadingArtifactCandidateV1,
): void {
  if (
    artifact.commitState !== 'requires_atomic_commit' ||
    artifact.revealState !== 'forbidden_before_commit'
  ) {
    throw new CharacterSajuSp2RolloutOrchestrationError(
      'validate',
      'SP-2 artifact must remain reveal-forbidden until atomic commit succeeds.',
    );
  }
}

export class InMemoryCharacterSajuSp2CommitPortV1
  implements CharacterSajuSp2CommitPortV1
{
  readonly #byTurnId = new Map<string, CharacterSajuSp2CommittedArtifactV1>();
  #sequence = 0;

  findCommitted(turnId: string): CharacterSajuSp2CommittedArtifactV1 | null {
    return this.#byTurnId.get(turnId) ?? null;
  }

  commit(input: {
    readonly turnId: string;
    readonly attemptId: string;
    readonly providerKey: string;
    readonly modelKey: string;
    readonly artifact: CharacterSajuSp2ReadingArtifactCandidateV1;
  }): CharacterSajuSp2CommittedArtifactV1 {
    assertRevealCandidate(input.artifact);
    const hash = artifactHash(input.artifact);
    const existing = this.#byTurnId.get(input.turnId);

    if (existing !== undefined) {
      if (existing.receipt.artifactHash !== hash) {
        throw new CharacterSajuSp2RolloutOrchestrationError(
          'commit',
          'A committed SP-2 logical turn cannot be replaced by a different artifact.',
        );
      }
      return existing;
    }

    this.#sequence += 1;
    const committed = Object.freeze({
      receipt: Object.freeze({
        schemaVersion: CHARACTER_SAJU_SP2_COMMIT_SCHEMA_VERSION_V1,
        turnId: input.turnId,
        attemptId: input.attemptId,
        receiptId: `mock-character-saju-sp2-commit:${this.#sequence}`,
        artifactId: input.artifact.artifactId,
        artifactHash: hash,
        rolloutPolicyVersion: input.artifact.rolloutPolicyVersion,
        candidateHash: input.artifact.candidateHash,
        providerKey: input.providerKey,
        modelKey: input.modelKey,
      }),
      artifact: input.artifact,
    }) satisfies CharacterSajuSp2CommittedArtifactV1;

    this.#byTurnId.set(input.turnId, committed);
    return committed;
  }

  get committedCount(): number {
    return this.#byTurnId.size;
  }
}

export function commitAndRevealCharacterSajuSp2ControlledRolloutV1(input: {
  readonly turnId: string;
  readonly attemptId: string;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly rolloutDecision: CharacterSajuSp2ControlledRolloutDecisionV1;
  readonly commitPort: CharacterSajuSp2CommitPortV1;
}): CharacterSajuSp2RolloutOrchestrationResultV1 {
  const turnId = requiredIdentifier(input.turnId, 'turnId');
  const attemptId = requiredIdentifier(input.attemptId, 'attemptId');
  const providerKey = requiredIdentifier(input.providerKey, 'providerKey');
  const modelKey = requiredIdentifier(input.modelKey, 'modelKey');

  const stateTrace: CharacterSajuSp2RolloutOrchestrationStateV1[] = [
    'received',
    'planned',
  ];

  if (input.rolloutDecision.mode === 'protected_fallback') {
    stateTrace.push('fallback_required');
    return Object.freeze({
      status: 'protected_fallback_required' as const,
      reason: input.rolloutDecision.reason,
      failures: Object.freeze([...input.rolloutDecision.failures]),
      stateTrace: Object.freeze(stateTrace),
      revealState: 'forbidden' as const,
    });
  }

  const artifact = input.rolloutDecision.artifactCandidate;
  assertRevealCandidate(artifact);
  stateTrace.push('rollout_validated');

  const existing = input.commitPort.findCommitted(turnId);
  if (existing !== null) {
    if (existing.receipt.artifactHash !== artifactHash(artifact)) {
      throw new CharacterSajuSp2RolloutOrchestrationError(
        'commit',
        'Committed SP-2 turn does not match the currently authorized rollout artifact.',
      );
    }
    stateTrace.push('committed', 'delivered');
    return Object.freeze({
      status: 'delivered' as const,
      replayedCommittedTurn: true,
      stateTrace: Object.freeze(stateTrace),
      revealState: 'controlled_reveal_after_atomic_commit' as const,
      artifact: existing.artifact,
      commitReceipt: existing.receipt,
    });
  }

  let committed: CharacterSajuSp2CommittedArtifactV1;
  try {
    committed = input.commitPort.commit({
      turnId,
      attemptId,
      providerKey,
      modelKey,
      artifact,
    });
  } catch (error) {
    if (error instanceof CharacterSajuSp2RolloutOrchestrationError) {
      throw error;
    }
    throw new CharacterSajuSp2RolloutOrchestrationError(
      'commit',
      error instanceof Error ? error.message : 'SP-2 atomic commit failed.',
    );
  }

  stateTrace.push('committed');

  if (
    committed.receipt.artifactHash !== artifactHash(committed.artifact) ||
    committed.receipt.artifactId !== committed.artifact.artifactId
  ) {
    throw new CharacterSajuSp2RolloutOrchestrationError(
      'deliver',
      'SP-2 commit receipt does not bind the committed artifact exactly.',
    );
  }

  stateTrace.push('delivered');
  return Object.freeze({
    status: 'delivered' as const,
    replayedCommittedTurn: false,
    stateTrace: Object.freeze(stateTrace),
    revealState: 'controlled_reveal_after_atomic_commit' as const,
    artifact: committed.artifact,
    commitReceipt: committed.receipt,
  });
}
