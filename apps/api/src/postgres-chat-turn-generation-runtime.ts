import { createHash } from 'node:crypto';

import {
  canonicalJson,
  type CharacterDialogueEnvelopeV1,
} from '../../../packages/domain/src/index.js';
import {
  assertServerValidatedCharacterDialogueEnvelopeV1,
} from '../../../packages/domain/src/character-output-guard.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const CHAT_TURN_GENERATED_RUNTIME_AUTHORITY_BINDING_V1 =
  'public.cmd_stage_chat_turn_generated_runtime_v1' as const;
export const CHAT_TURN_VALIDATED_RUNTIME_AUTHORITY_BINDING_V1 =
  'public.cmd_validate_chat_turn_generated_runtime_v1' as const;
export const CHAT_TURN_COMMIT_NO_EFFECTS_RUNTIME_AUTHORITY_BINDING_V1 =
  'public.cmd_commit_chat_turn_no_effects_runtime_v1' as const;

export const CHARACTER_DIALOGUE_MESSAGE_SCHEMA_VERSION_V1 =
  'character-dialogue-v1' as const;

type BooleanRowV1 = Readonly<{ replayed: unknown }>;

type CommitRowV1 = Readonly<{
  turnId: unknown;
  attemptId: unknown;
  messageId: unknown;
  sequenceNo: unknown;
  replayed: unknown;
}>;

export interface CharacterDialoguePersistenceProjectionV1 {
  readonly bodyText: string | null;
  readonly messagePayload: CharacterDialogueEnvelopeV1;
  readonly messageSchemaVersion: typeof CHARACTER_DIALOGUE_MESSAGE_SCHEMA_VERSION_V1;
  readonly contentHash: string;
}

export interface PersistValidatedCharacterGenerationResultV1
  extends CharacterDialoguePersistenceProjectionV1 {
  readonly generatedReplayed: boolean;
  readonly validationReplayed: boolean;
}

export interface CommitCharacterChatTurnNoEffectsResultV1 {
  readonly turnId: string;
  readonly attemptId: string;
  readonly messageId: string;
  readonly sequenceNo: number;
  readonly replayed: boolean;
}

export class ChatTurnGenerationRuntimeAuthorityErrorV1 extends Error {
  override readonly name = 'ChatTurnGenerationRuntimeAuthorityErrorV1';

  constructor(message: string) {
    super(message);
  }
}

const STAGE_GENERATED_SQL = `
select public.cmd_stage_chat_turn_generated_runtime_v1(
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
  $11::text,
  $12::text,
  $13::jsonb
) as replayed
`.trim();

const VALIDATE_GENERATED_SQL = `
select public.cmd_validate_chat_turn_generated_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5::text,
  $6::jsonb,
  $7::boolean,
  $8::text
) as replayed
`.trim();

const COMMIT_NO_EFFECTS_SQL = `
select
  turn_id::text as "turnId",
  attempt_id::text as "attemptId",
  message_id::text as "messageId",
  sequence_no as "sequenceNo",
  replayed
from public.cmd_commit_chat_turn_no_effects_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5::uuid,
  $6::uuid
)
`.trim();

function requiredText(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ChatTurnGenerationRuntimeAuthorityErrorV1(
      `${path} is required.`,
    );
  }
  return normalized;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ChatTurnGenerationRuntimeAuthorityErrorV1(
      `${path} is invalid.`,
    );
  }
  return value;
}

function requireInteger(value: unknown, path: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ChatTurnGenerationRuntimeAuthorityErrorV1(
      `${path} is invalid.`,
    );
  }
  return parsed;
}

function requireSingleRow<Row>(
  rows: readonly Row[],
  path: string,
): Row {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new ChatTurnGenerationRuntimeAuthorityErrorV1(
      `${path} did not return exactly one row.`,
    );
  }
  return row;
}

function sha256Canonical(value: unknown): string {
  return `sha256:v1:${createHash('sha256')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function uniqueGroundingRefs(values: readonly string[]): readonly string[] {
  const normalized = values.map((value, index) => {
    const ref = requiredText(value, `groundingRefs[${index}]`);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        ref,
      )
    ) {
      throw new ChatTurnGenerationRuntimeAuthorityErrorV1(
        `groundingRefs[${index}] must be a UUID.`,
      );
    }
    return ref.toLowerCase();
  });

  if (new Set(normalized).size !== normalized.length) {
    throw new ChatTurnGenerationRuntimeAuthorityErrorV1(
      'groundingRefs must not contain duplicates.',
    );
  }
  return Object.freeze(normalized);
}

/**
 * Exact-text fallback projection for Chat stream/read surfaces.
 *
 * It introduces no labels, summaries, paraphrases, or Character claims. Every
 * included fragment already exists in the server-validated envelope.
 */
export function projectCharacterDialogueEnvelopeBodyTextV1(
  envelope: CharacterDialogueEnvelopeV1,
): string | null {
  assertServerValidatedCharacterDialogueEnvelopeV1(envelope);

  const fragments = [
    envelope.framingBefore,
    ...envelope.protectedSajuSegments.map((segment) => segment.text),
    ...envelope.protectedSajuDisclosures.map((disclosure) => disclosure.text),
    ...envelope.calculationAmbiguity,
    envelope.framingAfter,
  ].filter((value): value is string => value !== null && value.length > 0);

  return fragments.length === 0 ? null : fragments.join('\n\n');
}

export function projectValidatedCharacterDialogueForPersistenceV1(
  envelope: CharacterDialogueEnvelopeV1,
): CharacterDialoguePersistenceProjectionV1 {
  assertServerValidatedCharacterDialogueEnvelopeV1(envelope);

  const bodyText = projectCharacterDialogueEnvelopeBodyTextV1(envelope);
  const messageSchemaVersion = CHARACTER_DIALOGUE_MESSAGE_SCHEMA_VERSION_V1;
  const contentHash = sha256Canonical({
    bodyText,
    messagePayload: envelope,
    messageSchemaVersion,
  });

  return Object.freeze({
    bodyText,
    messagePayload: envelope,
    messageSchemaVersion,
    contentHash,
  });
}

/**
 * Persists an envelope only after the server Output Guard has minted it.
 *
 * Guard computation happens before persistence; durable lifecycle ordering is
 * still recorded as GENERATED followed immediately by VALIDATED against the
 * exact same canonical content hash.
 */
export async function persistValidatedCharacterGenerationV1(input: {
  readonly client: PostgresTransactionQueryV1;
  readonly resolvedSubjectId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly generationAiExecutionLogId: string;
  readonly validationAiExecutionLogId: string;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly promptVersion: string;
  readonly rendererVersion: string;
  readonly outputGuardVersion: string;
  readonly envelope: CharacterDialogueEnvelopeV1;
  readonly groundingRefs: readonly string[];
}): Promise<PersistValidatedCharacterGenerationResultV1> {
  const projection =
    projectValidatedCharacterDialogueForPersistenceV1(input.envelope);
  const groundingRefs = uniqueGroundingRefs(input.groundingRefs);

  const common = [
    requiredText(input.resolvedSubjectId, 'resolvedSubjectId'),
    requiredText(input.turnId, 'turnId'),
    requiredText(input.attemptId, 'attemptId'),
  ] as const;

  const generated = await input.client.query<BooleanRowV1>(
    STAGE_GENERATED_SQL,
    [
      ...common,
      requiredText(
        input.generationAiExecutionLogId,
        'generationAiExecutionLogId',
      ),
      requiredText(input.providerKey, 'providerKey'),
      requiredText(input.modelKey, 'modelKey'),
      requiredText(input.promptVersion, 'promptVersion'),
      requiredText(input.rendererVersion, 'rendererVersion'),
      projection.bodyText,
      JSON.stringify(projection.messagePayload),
      projection.messageSchemaVersion,
      projection.contentHash,
      JSON.stringify(groundingRefs),
    ],
  );
  const generatedRow = requireSingleRow(
    generated.rows,
    'Chat generated runtime authority',
  );

  const validationResult = Object.freeze({
    schemaVersion: 'v1',
    passed: true,
    generatedContentHash: projection.contentHash,
    outputGuardVersion: requiredText(
      input.outputGuardVersion,
      'outputGuardVersion',
    ),
  });

  const validated = await input.client.query<BooleanRowV1>(
    VALIDATE_GENERATED_SQL,
    [
      ...common,
      requiredText(
        input.validationAiExecutionLogId,
        'validationAiExecutionLogId',
      ),
      validationResult.outputGuardVersion,
      JSON.stringify(validationResult),
      true,
      'failed_final',
    ],
  );
  const validatedRow = requireSingleRow(
    validated.rows,
    'Chat validation runtime authority',
  );

  return Object.freeze({
    ...projection,
    generatedReplayed: requireBoolean(
      generatedRow.replayed,
      'generated replay marker',
    ),
    validationReplayed: requireBoolean(
      validatedRow.replayed,
      'validation replay marker',
    ),
  });
}

export async function commitCharacterChatTurnNoEffectsV1(input: {
  readonly client: PostgresTransactionQueryV1;
  readonly resolvedSubjectId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly messageId: string;
  readonly outboxEventId: string;
}): Promise<CommitCharacterChatTurnNoEffectsResultV1> {
  const result = await input.client.query<CommitRowV1>(
    COMMIT_NO_EFFECTS_SQL,
    [
      requiredText(input.resolvedSubjectId, 'resolvedSubjectId'),
      requiredText(input.threadId, 'threadId'),
      requiredText(input.turnId, 'turnId'),
      requiredText(input.attemptId, 'attemptId'),
      requiredText(input.messageId, 'messageId'),
      requiredText(input.outboxEventId, 'outboxEventId'),
    ],
  );

  const row = requireSingleRow(result.rows, 'Chat commit runtime authority');
  return Object.freeze({
    turnId: requiredText(String(row.turnId ?? ''), 'returned turnId'),
    attemptId: requiredText(String(row.attemptId ?? ''), 'returned attemptId'),
    messageId: requiredText(String(row.messageId ?? ''), 'returned messageId'),
    sequenceNo: requireInteger(row.sequenceNo, 'sequenceNo'),
    replayed: requireBoolean(row.replayed, 'replayed'),
  });
}
