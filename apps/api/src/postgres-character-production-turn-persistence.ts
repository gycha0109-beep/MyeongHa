import { createHash } from 'node:crypto';

import {
  CHARACTER_OUTPUT_GUARD_VERSION_V1,
  canonicalJson,
  type CharacterDialogueEnvelopeV1,
} from '../../../packages/domain/src/index.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type {
  CharacterProductionAttemptV1,
  CharacterProductionCommittedTurnV1,
  CharacterProductionTurnPersistencePortV1,
} from './character-standard-reading-production-turn.js';

export type CharacterProductionFailurePhaseV1 =
  | 'context'
  | 'generation'
  | 'validation';

export interface CharacterProductionFailureDecisionV1 {
  readonly failureState: 'failed_retryable' | 'failed_final';
  readonly errorCode: string;
}

export interface CharacterProductionFailurePolicyV1 {
  classify(input: {
    readonly phase: CharacterProductionFailurePhaseV1;
    readonly error: unknown;
  }): CharacterProductionFailureDecisionV1;
}

export interface CharacterProductionGroundingAuthorityV1 {
  readGroundingIds(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly characterId: string;
  }): Promise<readonly string[]> | readonly string[];
}

export interface CreatePostgresCharacterProductionTurnPersistenceInputV1 {
  readonly client: PostgresTransactionQueryV1;
  readonly createUuid: () => string;
  readonly rendererVersion: string;
  readonly rendererPromptVersion: string;
  readonly outputGuardPromptVersion: string;
  readonly failurePolicy: CharacterProductionFailurePolicyV1;
  readonly groundingAuthority: CharacterProductionGroundingAuthorityV1;
}

type AttemptRowV1 = Readonly<{
  attemptId: unknown;
  attemptNo: unknown;
  replayed: unknown;
}>;

type CommitRowV1 = Readonly<{
  turnId: unknown;
  attemptId: unknown;
  messageId: unknown;
  sequenceNo: unknown;
  replayed: unknown;
}>;

type CommittedRowV1 = Readonly<{
  turnId: unknown;
  attemptId: unknown;
  messageId: unknown;
  sequenceNo: unknown;
  provider: unknown;
  model: unknown;
  bodyText: unknown;
  messagePayloadJsonb: unknown;
  messageSchemaVersion: unknown;
}>;

interface GeneratedAttemptStateV1 {
  readonly generatedContentHash: string;
  readonly groundingIds: readonly string[];
}

const READ_COMMITTED_SQL = `
select
  turn_id::text as "turnId",
  attempt_id::text as "attemptId",
  message_id::text as "messageId",
  sequence_no as "sequenceNo",
  provider,
  model,
  body_text as "bodyText",
  message_payload_jsonb as "messagePayloadJsonb",
  message_schema_version as "messageSchemaVersion"
from public.qry_committed_chat_turn_runtime_v1(
  $1::uuid,
  $2::uuid
)
`.trim();

const ALLOCATE_SQL = `
select
  attempt_id::text as "attemptId",
  attempt_no as "attemptNo",
  replayed
from public.cmd_allocate_chat_turn_attempt_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::text
)
`.trim();

const CONTEXT_READY_SQL = `
select public.cmd_mark_chat_turn_context_ready_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid
)
`.trim();

const FAIL_SQL = `
select public.cmd_mark_chat_turn_failed_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::text,
  $5::text
)
`.trim();

const RECORD_AI_SQL = `
select public.cmd_record_chat_success_ai_execution_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5::text,
  $6::text,
  $7::text,
  $8::text,
  $9::text,
  $10::jsonb,
  $11::jsonb,
  $12::jsonb
)
`.trim();

const GENERATED_SQL = `
select public.cmd_mark_chat_turn_generated_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5::text,
  $6::text,
  $7::text,
  $8::jsonb,
  $9::text,
  $10::text,
  $11::jsonb
)
`.trim();

const VALIDATE_SQL = `
select public.cmd_validate_chat_turn_attempt_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5::text,
  $6::jsonb
)
`.trim();

const COMMIT_SQL = `
select
  turn_id::text as "turnId",
  attempt_id::text as "attemptId",
  message_id::text as "messageId",
  sequence_no as "sequenceNo",
  replayed
from public.cmd_commit_chat_turn_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5::uuid,
  $6::uuid
)
`.trim();

function requiredText(value: unknown, path: string, max = 200): string {
  if (typeof value !== 'string') {
    throw new Error(`${path} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > max) {
    throw new Error(`${path} is outside the supported bounds.`);
  }
  return normalized;
}

function requiredBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be boolean.`);
  return value;
}

function requiredPositiveInteger(value: unknown, path: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`${path} must be a positive safe integer.`);
  }
  return value;
}

function requiredUuid(value: unknown, path: string): string {
  const uuid = requiredText(value, path, 64);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      uuid,
    )
  ) {
    throw new Error(`${path} must be a UUID.`);
  }
  return uuid;
}

function stableErrorCode(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Z0-9][A-Z0-9_]{0,127}$/u.test(normalized)) {
    throw new Error('Character Production failure policy returned an invalid error code.');
  }
  return normalized;
}

function generatedContentHash(envelope: CharacterDialogueEnvelopeV1): string {
  return `sha256:v1:${createHash('sha256')
    .update(canonicalJson(envelope), 'utf8')
    .digest('hex')}`;
}

function parseEnvelope(value: unknown): CharacterDialogueEnvelopeV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Committed Character dialogue payload is invalid.');
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 'v1') {
    throw new Error('Committed Character dialogue schemaVersion is invalid.');
  }

  for (const field of [
    'protectedSajuSegments',
    'protectedSajuDisclosures',
    'calculationAmbiguity',
    'memoryProposals',
    'relationshipEventProposals',
    'suggestedActions',
  ] as const) {
    if (!Array.isArray(record[field])) {
      throw new Error(`Committed Character dialogue ${field} is invalid.`);
    }
  }

  if (typeof record.emotion !== 'string' || record.emotion.trim().length === 0) {
    throw new Error('Committed Character dialogue emotion is invalid.');
  }
  if (record.framingBefore !== null && typeof record.framingBefore !== 'string') {
    throw new Error('Committed Character dialogue framingBefore is invalid.');
  }
  if (record.framingAfter !== null && typeof record.framingAfter !== 'string') {
    throw new Error('Committed Character dialogue framingAfter is invalid.');
  }
  if (record.animationCue !== null && typeof record.animationCue !== 'string') {
    throw new Error('Committed Character dialogue animationCue is invalid.');
  }

  return Object.freeze({
    schemaVersion: 'v1',
    framingBefore: record.framingBefore as string | null,
    protectedSajuSegments: Object.freeze([
      ...(record.protectedSajuSegments as CharacterDialogueEnvelopeV1['protectedSajuSegments']),
    ]),
    protectedSajuDisclosures: Object.freeze([
      ...(record.protectedSajuDisclosures as CharacterDialogueEnvelopeV1['protectedSajuDisclosures']),
    ]),
    calculationAmbiguity: Object.freeze([
      ...(record.calculationAmbiguity as readonly string[]),
    ]),
    framingAfter: record.framingAfter as string | null,
    emotion: record.emotion,
    animationCue: record.animationCue as string | null,
    memoryProposals: Object.freeze([
      ...(record.memoryProposals as CharacterDialogueEnvelopeV1['memoryProposals']),
    ]),
    relationshipEventProposals: Object.freeze([
      ...(record.relationshipEventProposals as CharacterDialogueEnvelopeV1['relationshipEventProposals']),
    ]),
    suggestedActions: Object.freeze([
      ...(record.suggestedActions as CharacterDialogueEnvelopeV1['suggestedActions']),
    ]),
  });
}

function validateGroundingIds(values: readonly string[]): readonly string[] {
  if (values.length > 128) {
    throw new Error('Character Production grounding set exceeds the supported bound.');
  }
  const normalized = values.map((value, index) =>
    requiredUuid(value, `groundingIds[${index}]`),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('Character Production grounding ids must be unique.');
  }
  return Object.freeze(normalized);
}

class PostgresCharacterProductionTurnPersistenceV1
implements CharacterProductionTurnPersistencePortV1 {
  readonly #generatedByAttempt = new Map<string, GeneratedAttemptStateV1>();

  constructor(
    private readonly input: CreatePostgresCharacterProductionTurnPersistenceInputV1,
  ) {}

  async readCommitted(input: {
    readonly subjectId: string;
    readonly turnId: string;
  }): Promise<CharacterProductionCommittedTurnV1 | null> {
    const result = await this.input.client.query<CommittedRowV1>(
      READ_COMMITTED_SQL,
      [input.subjectId, input.turnId],
    );
    if (result.rows.length === 0) return null;
    if (result.rows.length !== 1 || result.rows[0] === undefined) {
      throw new Error('Committed Character turn authority returned multiple rows.');
    }
    const row = result.rows[0];
    if (row.messageSchemaVersion !== 'character-dialogue-v1') {
      throw new Error('Committed Character turn has an unsupported message schema.');
    }
    return Object.freeze({
      turnId: requiredUuid(row.turnId, 'committed.turnId'),
      attemptId: requiredUuid(row.attemptId, 'committed.attemptId'),
      messageId: requiredUuid(row.messageId, 'committed.messageId'),
      sequenceNo: requiredPositiveInteger(row.sequenceNo, 'committed.sequenceNo'),
      providerKey: requiredText(row.provider, 'committed.provider'),
      modelKey: requiredText(row.model, 'committed.model'),
      envelope: parseEnvelope(row.messagePayloadJsonb),
    });
  }

  async allocateAttempt(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly plannerVersion: string;
  }): Promise<CharacterProductionAttemptV1> {
    const attemptId = requiredUuid(this.input.createUuid(), 'new attempt id');
    const result = await this.input.client.query<AttemptRowV1>(
      ALLOCATE_SQL,
      [input.subjectId, input.turnId, attemptId, input.plannerVersion],
    );
    if (result.rows.length !== 1 || result.rows[0] === undefined) {
      throw new Error('Character attempt allocation returned an invalid row set.');
    }
    const row = result.rows[0];
    return Object.freeze({
      attemptId: requiredUuid(row.attemptId, 'attempt.attemptId'),
      attemptNo: requiredPositiveInteger(row.attemptNo, 'attempt.attemptNo'),
      replayed: requiredBoolean(row.replayed, 'attempt.replayed'),
    });
  }

  async markContextReady(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
  }): Promise<void> {
    await this.input.client.query(CONTEXT_READY_SQL, [
      input.subjectId,
      input.turnId,
      input.attemptId,
    ]);
  }

  async stageGenerated(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly characterId: string;
    readonly contentBundleId: string;
    readonly providerKey: string;
    readonly modelKey: string;
    readonly envelope: CharacterDialogueEnvelopeV1;
  }): Promise<void> {
    const executionLogId = requiredUuid(
      this.input.createUuid(),
      'renderer execution log id',
    );
    const groundingIds = validateGroundingIds(
      await this.input.groundingAuthority.readGroundingIds({
        subjectId: input.subjectId,
        turnId: input.turnId,
        attemptId: input.attemptId,
        characterId: input.characterId,
      }),
    );
    const contentHash = generatedContentHash(input.envelope);
    const outputRef = { generatedContentHash: contentHash };

    await this.input.client.query(RECORD_AI_SQL, [
      input.subjectId,
      executionLogId,
      input.turnId,
      input.attemptId,
      'renderer',
      input.providerKey,
      input.modelKey,
      requiredText(this.input.rendererPromptVersion, 'rendererPromptVersion'),
      input.characterId,
      JSON.stringify({
        schemaVersion: 'v1',
        source: 'server-admitted-character-runtime',
      }),
      JSON.stringify(outputRef),
      JSON.stringify(groundingIds),
    ]);

    await this.input.client.query(GENERATED_SQL, [
      input.subjectId,
      input.turnId,
      input.attemptId,
      executionLogId,
      requiredText(this.input.rendererVersion, 'rendererVersion'),
      input.characterId,
      null,
      JSON.stringify(input.envelope),
      'character-dialogue-v1',
      contentHash,
      JSON.stringify(groundingIds),
    ]);

    this.#generatedByAttempt.set(
      input.attemptId,
      Object.freeze({ generatedContentHash: contentHash, groundingIds }),
    );
  }

  async stageValidationPassed(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly envelope: CharacterDialogueEnvelopeV1;
  }): Promise<void> {
    const generated = this.#generatedByAttempt.get(input.attemptId);
    if (generated === undefined) {
      throw new Error('Character validation cannot run before generated staging.');
    }
    const contentHash = generatedContentHash(input.envelope);
    if (contentHash !== generated.generatedContentHash) {
      throw new Error('Character validation envelope changed after generated staging.');
    }

    const executionLogId = requiredUuid(
      this.input.createUuid(),
      'Output Guard execution log id',
    );

    await this.input.client.query(RECORD_AI_SQL, [
      input.subjectId,
      executionLogId,
      input.turnId,
      input.attemptId,
      'output_guard',
      'myeongha-server',
      CHARACTER_OUTPUT_GUARD_VERSION_V1,
      requiredText(
        this.input.outputGuardPromptVersion,
        'outputGuardPromptVersion',
      ),
      null,
      JSON.stringify({
        schemaVersion: 'v1',
        generatedContentHash: contentHash,
      }),
      JSON.stringify({ generatedContentHash: contentHash }),
      JSON.stringify(generated.groundingIds),
    ]);

    await this.input.client.query(VALIDATE_SQL, [
      input.subjectId,
      input.turnId,
      input.attemptId,
      executionLogId,
      CHARACTER_OUTPUT_GUARD_VERSION_V1,
      JSON.stringify({
        schemaVersion: 'v1',
        passed: true,
        generatedContentHash: contentHash,
      }),
    ]);
  }

  async recordContextFailure(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly error: unknown;
  }): Promise<void> {
    await this.#recordFailure('context', input);
  }

  async recordGenerationFailure(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly error: unknown;
  }): Promise<void> {
    await this.#recordFailure('generation', input);
  }

  async recordValidationFailure(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly error: unknown;
  }): Promise<void> {
    await this.#recordFailure('validation', input);
  }

  async #recordFailure(
    phase: CharacterProductionFailurePhaseV1,
    input: {
      readonly subjectId: string;
      readonly turnId: string;
      readonly attemptId: string;
      readonly error: unknown;
    },
  ): Promise<void> {
    const decision = this.input.failurePolicy.classify({
      phase,
      error: input.error,
    });
    const failureState =
      decision.failureState === 'failed_retryable' ||
      decision.failureState === 'failed_final'
        ? decision.failureState
        : (() => {
            throw new Error('Character Production failure policy returned an invalid state.');
          })();
    await this.input.client.query(FAIL_SQL, [
      input.subjectId,
      input.turnId,
      input.attemptId,
      failureState,
      stableErrorCode(decision.errorCode),
    ]);
  }

  async commitValidated(input: {
    readonly subjectId: string;
    readonly threadId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly characterId: string;
    readonly providerKey: string;
    readonly modelKey: string;
    readonly envelope: CharacterDialogueEnvelopeV1;
  }): Promise<CharacterProductionCommittedTurnV1> {
    const messageId = requiredUuid(this.input.createUuid(), 'committed message id');
    const outboxEventId = requiredUuid(this.input.createUuid(), 'commit outbox event id');

    const result = await this.input.client.query<CommitRowV1>(
      COMMIT_SQL,
      [
        input.subjectId,
        input.threadId,
        input.turnId,
        input.attemptId,
        messageId,
        outboxEventId,
      ],
    );
    if (result.rows.length !== 1 || result.rows[0] === undefined) {
      throw new Error('Character Production commit returned an invalid row set.');
    }
    const row = result.rows[0];
    const returnedAttemptId = requiredUuid(row.attemptId, 'commit.attemptId');
    if (returnedAttemptId !== input.attemptId) {
      throw new Error('Character Production commit returned a different attempt.');
    }

    return Object.freeze({
      turnId: requiredUuid(row.turnId, 'commit.turnId'),
      attemptId: returnedAttemptId,
      messageId: requiredUuid(row.messageId, 'commit.messageId'),
      sequenceNo: requiredPositiveInteger(row.sequenceNo, 'commit.sequenceNo'),
      providerKey: input.providerKey,
      modelKey: input.modelKey,
      envelope: input.envelope,
    });
  }
}

export function createPostgresCharacterProductionTurnPersistenceV1(
  input: CreatePostgresCharacterProductionTurnPersistenceInputV1,
): CharacterProductionTurnPersistencePortV1 {
  requiredText(input.rendererVersion, 'rendererVersion');
  requiredText(input.rendererPromptVersion, 'rendererPromptVersion');
  requiredText(input.outputGuardPromptVersion, 'outputGuardPromptVersion');

  return new PostgresCharacterProductionTurnPersistenceV1(input);
}
