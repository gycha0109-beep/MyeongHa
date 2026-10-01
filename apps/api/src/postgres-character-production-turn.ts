import { createHash, randomUUID } from 'node:crypto';

import {
  CHARACTER_OUTPUT_GUARD_VERSION_V1,
  canonicalJson,
  type CharacterDialogueEnvelopeV1,
} from '../../../packages/domain/src/index.js';
import type {
  CharacterProductionAttemptV1,
  CharacterProductionCommittedTurnV1,
  CharacterProductionTurnPersistencePortV1,
} from './character-standard-reading-production-turn.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const CHARACTER_PRODUCTION_TURN_POSTGRES_BINDINGS_V1 = Object.freeze({
  readCommitted: 'public.qry_character_production_committed_turn_runtime_v1',
  allocateAttempt: 'public.cmd_character_production_allocate_attempt_runtime_v1',
  markContextReady: 'public.cmd_character_production_context_ready_runtime_v1',
  failAttempt: 'public.cmd_character_production_fail_runtime_v1',
  stageGenerated: 'public.cmd_character_production_stage_generated_runtime_v1',
  validateGenerated: 'public.cmd_character_production_validate_runtime_v1',
  commitValidated: 'public.cmd_character_production_commit_runtime_v1',
} as const);

export interface CharacterProductionTurnIdFactoryV1 {
  (): string;
}

type CommittedRowV1 = Readonly<{
  turnId: unknown;
  attemptId: unknown;
  messageId: unknown;
  sequenceNo: unknown;
  providerKey: unknown;
  modelKey: unknown;
  envelope: unknown;
}>;

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

const READ_COMMITTED_SQL = `
select
  turn_id::text as "turnId",
  attempt_id::text as "attemptId",
  message_id::text as "messageId",
  sequence_no as "sequenceNo",
  provider_key as "providerKey",
  model_key as "modelKey",
  envelope_jsonb as "envelope"
from public.qry_character_production_committed_turn_runtime_v1(
  $1::uuid,
  $2::uuid
)
`.trim();

const ALLOCATE_ATTEMPT_SQL = `
select
  attempt_id::text as "attemptId",
  attempt_no as "attemptNo",
  replayed
from public.cmd_character_production_allocate_attempt_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::text
)
`.trim();

const MARK_CONTEXT_READY_SQL = `
select public.cmd_character_production_context_ready_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid
) as "replayed"
`.trim();

const FAIL_ATTEMPT_SQL = `
select public.cmd_character_production_fail_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::text
) as "replayed"
`.trim();

const STAGE_GENERATED_SQL = `
select public.cmd_character_production_stage_generated_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5::text,
  $6::uuid,
  $7::uuid,
  $8::text,
  $9::text,
  $10::text,
  $11::text,
  $12::jsonb,
  $13::text
) as "replayed"
`.trim();

const VALIDATE_GENERATED_SQL = `
select public.cmd_character_production_validate_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5::text,
  $6::text
) as "replayed"
`.trim();

const COMMIT_VALIDATED_SQL = `
select
  turn_id::text as "turnId",
  attempt_id::text as "attemptId",
  message_id::text as "messageId",
  sequence_no as "sequenceNo",
  replayed
from public.cmd_character_production_commit_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5::uuid,
  $6::uuid,
  $7::text,
  $8::text,
  $9::text,
  $10::text
)
`.trim();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Character production PostgreSQL ${name} is invalid.`);
  }
  return value.trim();
}

function requirePositiveInteger(name: string, value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Character production PostgreSQL ${name} is invalid.`);
  }
  return parsed;
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Character production PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function requireNullableString(name: string, value: unknown): void {
  if (value !== null && typeof value !== 'string') {
    throw new Error(`Character production PostgreSQL ${name} is invalid.`);
  }
}

function requireArray(name: string, value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Character production PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function requireStoredEnvelope(value: unknown): CharacterDialogueEnvelopeV1 {
  if (!isRecord(value) || value.schemaVersion !== 'v1') {
    throw new Error('Character production PostgreSQL envelope schema is invalid.');
  }

  requireNullableString('framingBefore', value.framingBefore);
  requireArray('protectedSajuSegments', value.protectedSajuSegments);
  requireArray('protectedSajuDisclosures', value.protectedSajuDisclosures);
  requireArray('calculationAmbiguity', value.calculationAmbiguity);
  requireNullableString('framingAfter', value.framingAfter);
  requireString('emotion', value.emotion);
  requireNullableString('animationCue', value.animationCue);
  requireArray('memoryProposals', value.memoryProposals);
  requireArray('relationshipEventProposals', value.relationshipEventProposals);
  requireArray('suggestedActions', value.suggestedActions);

  return value as unknown as CharacterDialogueEnvelopeV1;
}

function hashEnvelope(envelope: CharacterDialogueEnvelopeV1): string {
  return `sha256:v1:${createHash('sha256')
    .update(canonicalJson(envelope))
    .digest('hex')}`;
}

function oneRow<Row>(name: string, rows: readonly Row[]): Row {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error(`Character production PostgreSQL ${name} did not return exactly one row.`);
  }
  return row;
}

function failureCode(
  stage: 'CONTEXT' | 'GENERATION' | 'VALIDATION',
  error: unknown,
): string {
  if (typeof error === 'object' && error !== null) {
    const constraint = (error as { constraint?: unknown }).constraint;
    if (
      typeof constraint === 'string' &&
      /^[a-zA-Z0-9_.:-]{1,80}$/u.test(constraint)
    ) {
      return `CHARACTER_${stage}_${constraint}`.slice(0, 120);
    }
  }
  return `CHARACTER_${stage}_FAILED`;
}

function mapCommittedRow(row: CommittedRowV1): CharacterProductionCommittedTurnV1 {
  return Object.freeze({
    turnId: requireString('committed turn id', row.turnId),
    attemptId: requireString('committed attempt id', row.attemptId),
    messageId: requireString('committed message id', row.messageId),
    sequenceNo: requirePositiveInteger('committed sequence', row.sequenceNo),
    providerKey: requireString('renderer provider', row.providerKey),
    modelKey: requireString('renderer model', row.modelKey),
    envelope: requireStoredEnvelope(row.envelope),
  });
}

class PostgresCharacterProductionTurnPersistencePortV1
implements CharacterProductionTurnPersistencePortV1 {
  constructor(
    private readonly client: PostgresTransactionQueryV1,
    private readonly idFactory: CharacterProductionTurnIdFactoryV1,
  ) {}

  async readCommitted(
    input: Parameters<CharacterProductionTurnPersistencePortV1['readCommitted']>[0],
  ): Promise<CharacterProductionCommittedTurnV1 | null> {
    const result = await this.client.query<CommittedRowV1>(READ_COMMITTED_SQL, [
      input.subjectId,
      input.turnId,
    ]);

    if (result.rows.length === 0) return null;
    return mapCommittedRow(oneRow('committed read', result.rows));
  }

  async allocateAttempt(
    input: Parameters<CharacterProductionTurnPersistencePortV1['allocateAttempt']>[0],
  ): Promise<CharacterProductionAttemptV1> {
    const result = await this.client.query<AttemptRowV1>(ALLOCATE_ATTEMPT_SQL, [
      input.subjectId,
      input.turnId,
      this.idFactory(),
      input.plannerVersion,
    ]);
    const row = oneRow('attempt allocation', result.rows);

    return Object.freeze({
      attemptId: requireString('attempt id', row.attemptId),
      attemptNo: requirePositiveInteger('attempt number', row.attemptNo),
      replayed: requireBoolean('attempt replay marker', row.replayed),
    });
  }

  async markContextReady(
    input: Parameters<CharacterProductionTurnPersistencePortV1['markContextReady']>[0],
  ): Promise<void> {
    await this.client.query(MARK_CONTEXT_READY_SQL, [
      input.subjectId,
      input.turnId,
      input.attemptId,
    ]);
  }

  async stageGenerated(
    input: Parameters<CharacterProductionTurnPersistencePortV1['stageGenerated']>[0],
  ): Promise<void> {
    const contentHash = hashEnvelope(input.envelope);
    await this.client.query(STAGE_GENERATED_SQL, [
      input.subjectId,
      input.turnId,
      input.attemptId,
      this.idFactory(),
      input.characterId,
      input.readingId,
      input.contentBundleId,
      input.providerKey,
      input.modelKey,
      input.rendererVersion,
      input.promptVersion,
      input.envelope,
      contentHash,
    ]);
  }

  async stageValidationPassed(
    input: Parameters<CharacterProductionTurnPersistencePortV1['stageValidationPassed']>[0],
  ): Promise<void> {
    await this.client.query(VALIDATE_GENERATED_SQL, [
      input.subjectId,
      input.turnId,
      input.attemptId,
      this.idFactory(),
      CHARACTER_OUTPUT_GUARD_VERSION_V1,
      hashEnvelope(input.envelope),
    ]);
  }

  async recordContextFailure(
    input: Parameters<CharacterProductionTurnPersistencePortV1['recordContextFailure']>[0],
  ): Promise<void> {
    await this.recordFailure('CONTEXT', input);
  }

  async recordGenerationFailure(
    input: Parameters<CharacterProductionTurnPersistencePortV1['recordGenerationFailure']>[0],
  ): Promise<void> {
    await this.recordFailure('GENERATION', input);
  }

  async recordValidationFailure(
    input: Parameters<CharacterProductionTurnPersistencePortV1['recordValidationFailure']>[0],
  ): Promise<void> {
    await this.recordFailure('VALIDATION', input);
  }

  private async recordFailure(
    stage: 'CONTEXT' | 'GENERATION' | 'VALIDATION',
    input: {
      readonly subjectId: string;
      readonly turnId: string;
      readonly attemptId: string;
      readonly error: unknown;
    },
  ): Promise<void> {
    await this.client.query(FAIL_ATTEMPT_SQL, [
      input.subjectId,
      input.turnId,
      input.attemptId,
      failureCode(stage, input.error),
    ]);
  }

  async commitValidated(
    input: Parameters<CharacterProductionTurnPersistencePortV1['commitValidated']>[0],
  ): Promise<CharacterProductionCommittedTurnV1> {
    const result = await this.client.query<CommitRowV1>(COMMIT_VALIDATED_SQL, [
      input.subjectId,
      input.threadId,
      input.turnId,
      input.attemptId,
      this.idFactory(),
      this.idFactory(),
      input.characterId,
      input.providerKey,
      input.modelKey,
      hashEnvelope(input.envelope),
    ]);
    const row = oneRow('validated commit', result.rows);

    requireBoolean('commit replay marker', row.replayed);

    return Object.freeze({
      turnId: requireString('committed turn id', row.turnId),
      attemptId: requireString('committed attempt id', row.attemptId),
      messageId: requireString('committed message id', row.messageId),
      sequenceNo: requirePositiveInteger('committed sequence', row.sequenceNo),
      providerKey: input.providerKey,
      modelKey: input.modelKey,
      envelope: input.envelope,
    });
  }
}

export function createPostgresCharacterProductionTurnPersistencePortV1(
  client: PostgresTransactionQueryV1,
  idFactory: CharacterProductionTurnIdFactoryV1 = randomUUID,
): CharacterProductionTurnPersistencePortV1 {
  return new PostgresCharacterProductionTurnPersistencePortV1(
    client,
    idFactory,
  );
}
