// Watchtower-Track: character-memory
// Member-scoped PostgreSQL adapter for the independent four-Character runtime.
// The Provider adapter uses costReservationId as its call ID and must reserve
// governed cost before network dispatch. This port persists turns and issues a
// private pending-delivery receipt; it never reveals assistant text.
import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import type {
  FourCharacterAtomicReservationV1,
  FourCharacterGeneratedDraftV1,
  FourCharacterIssuedReceiptV1,
  FourCharacterProductionExecutionPortsV1,
  FourCharacterValidatedReplyV1,
  FourIndependentChatTargetV1,
  PublishedFourCharacterModelSourceV1,
} from './four-character-production-chat-executor-v1.js';
import {
  FourCharacterProductionExecutionHeldV1,
} from './four-character-production-chat-executor-v1.js';
import type {
  PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import type {
  ResolvedSubjectContextV1,
} from './subject-identity-resolver.js';

type Row = Readonly<Record<string, unknown>>;
type Awaitable<T> = T | Promise<T>;

export interface FourCharacterSubjectTransactionRunnerV1 {
  run<T>(
    expectedSubjectId: string,
    execute: (
      client: PostgresTransactionQueryV1,
      resolvedSubject: ResolvedSubjectContextV1,
    ) => Awaitable<T>,
  ): Promise<T>;
}

export const POSTGRES_FOUR_CHARACTER_CHAT_RECEIVE_RUNTIME_BINDING_V1 =
  'public.cmd_receive_four_character_chat_turn_runtime_v1' as const;
export const POSTGRES_FOUR_CHARACTER_CHAT_ATTEMPT_RUNTIME_BINDING_V1 =
  'public.cmd_allocate_four_character_chat_attempt_runtime_v1' as const;
export const POSTGRES_FOUR_CHARACTER_CHAT_CONTEXT_READY_RUNTIME_BINDING_V1 =
  'public.cmd_mark_four_character_chat_context_ready_runtime_v1' as const;
export const POSTGRES_FOUR_CHARACTER_CHAT_FAILURE_RUNTIME_BINDING_V1 =
  'public.cmd_fail_four_character_chat_attempt_runtime_v1' as const;
export const POSTGRES_FOUR_CHARACTER_CHAT_GENERATED_RUNTIME_BINDING_V1 =
  'public.cmd_persist_four_character_chat_generated_runtime_v1' as const;
export const POSTGRES_FOUR_CHARACTER_CHAT_VALIDATED_RUNTIME_BINDING_V1 =
  'public.cmd_persist_four_character_chat_validated_runtime_v1' as const;
export const POSTGRES_FOUR_CHARACTER_CHAT_COMMIT_RUNTIME_BINDING_V1 =
  'public.cmd_commit_four_character_chat_turn_runtime_v1' as const;

const REQUEST_CONTRACT_VERSION = 'four-character-chat-request-v1' as const;
const PLANNER_VERSION = 'four-character-chat-planner-v1' as const;
const RENDERER_VERSION = 'four-character-chat-renderer-v1' as const;
const MESSAGE_SCHEMA_VERSION = 'four-character-chat-message-v1' as const;
const OUTPUT_GUARD_PROVIDER = 'myeongha-internal' as const;
const OUTPUT_GUARD_MODEL = 'deterministic-four-character-output-guard' as const;

const RECEIVE_SQL = `
select
  turn_id::text as "turnId",
  user_message_id::text as "userMessageId",
  user_text as "userText",
  thread_character_id::text as "threadCharacterId",
  content_release_id::text as "contentReleaseId",
  content_bundle_id::text as "contentBundleId",
  turn_state as "turnState",
  committed_attempt_id::text as "committedAttemptId",
  replayed
from public.cmd_receive_four_character_chat_turn_runtime_v1(
  $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb,
  $7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::text,$12::text
)
`.trim();

const ALLOCATE_SQL = `
select attempt_id::text as "attemptId", attempt_no as "attemptNo", replayed
from public.cmd_allocate_four_character_chat_attempt_runtime_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::text
)
`.trim();

const CONTEXT_READY_SQL = `
select public.cmd_mark_four_character_chat_context_ready_runtime_v1(
  $1::uuid,$2::uuid,$3::uuid
) as replayed
`.trim();

const FAILURE_SQL = `
select public.cmd_fail_four_character_chat_attempt_runtime_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::text,$5::text
) as replayed
`.trim();

const GENERATED_SQL = `
select public.cmd_persist_four_character_chat_generated_runtime_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
  $6::text,$7::text,$8::text,$9::text,$10::jsonb,
  $11::text,$12::text,$13::jsonb
) as replayed
`.trim();

const VALIDATED_SQL = `
select public.cmd_persist_four_character_chat_validated_runtime_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,
  $5::text,$6::text,$7::text,$8::text,$9::jsonb,$10::jsonb
) as replayed
`.trim();

const COMMIT_SQL = `
select
  turn_id::text as "turnId",
  attempt_id::text as "attemptId",
  assistant_message_id::text as "assistantMessageId",
  delivery_receipt_id::text as "deliveryReceiptId",
  sequence_no as "sequenceNo",
  committed_at::text as "committedAt",
  replayed
from public.cmd_commit_four_character_chat_turn_runtime_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,
  $7::uuid,$8::text
)
`.trim();

function requiredText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || value.length === 0 ||
      value.trim() !== value || value.length > maxLength) {
    throw new FourCharacterProductionExecutionHeldV1();
  }
  return value;
}

function uuid(value: unknown): string {
  const normalized = requiredText(value, 64).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(normalized)) {
    throw new FourCharacterProductionExecutionHeldV1();
  }
  return normalized;
}

function sourceDigest(value: unknown): string {
  const normalized = requiredText(value, 128);
  if (!/^sha256:v1:[0-9a-f]{64}$/u.test(normalized)) {
    throw new FourCharacterProductionExecutionHeldV1();
  }
  return normalized;
}

function sha256(value: string): string {
  return 'sha256:v1:' + createHash('sha256').update(value, 'utf8').digest('hex');
}

function one(rows: readonly Row[]): Row {
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new FourCharacterProductionExecutionHeldV1();
  }
  return rows[0];
}

function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new FourCharacterProductionExecutionHeldV1();
  return value;
}

function integer(value: unknown): number {
  const parsed = typeof value === 'number' ? value :
    typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new FourCharacterProductionExecutionHeldV1();
  }
  return parsed;
}

function timestamp(value: unknown): string {
  const raw = requiredText(value, 128);
  const epoch = Date.parse(raw);
  if (!Number.isFinite(epoch)) throw new FourCharacterProductionExecutionHeldV1();
  return new Date(epoch).toISOString();
}

function assertMember(
  expectedSubjectId: string,
  resolvedSubject: ResolvedSubjectContextV1,
): void {
  if (resolvedSubject.subjectKind !== 'member' ||
      resolvedSubject.subjectId.toLowerCase() !== expectedSubjectId) {
    throw new FourCharacterProductionExecutionHeldV1();
  }
}

function assertReservationAndSource(
  reservation: FourCharacterAtomicReservationV1,
  source: PublishedFourCharacterModelSourceV1,
): void {
  if (reservation.status !== 'reserved' ||
      reservation.characterId !== source.characterId ||
      reservation.releaseId !== source.releaseId ||
      reservation.bundleId !== source.bundleId ||
      source.status !== 'published' ||
      sourceDigest(reservation.sourceDigest) !== sourceDigest(source.sourceDigest)) {
    throw new FourCharacterProductionExecutionHeldV1();
  }
}

export function createPostgresFourCharacterChatTransactionPortV1(input: Readonly<{
  runner: FourCharacterSubjectTransactionRunnerV1;
}>): FourCharacterProductionExecutionPortsV1['transaction'] {
  return Object.freeze({
    async reserveAttempt(
      request: Parameters<FourCharacterProductionExecutionPortsV1['transaction']['reserveAttempt']>[0],
    ): Promise<FourCharacterAtomicReservationV1> {
      const subjectId = uuid(request.subjectId);
      const threadId = uuid(request.threadId);
      const releaseId = uuid(request.releaseId);
      const bundleId = uuid(request.bundleId);
      const clientTurnId = requiredText(request.clientTurnId, 256);
      const characterId = request.characterId as FourIndependentChatTargetV1;
      const userText = requiredText(request.userText, 8000);
      const digest = sourceDigest(request.sourceDigest);
      const turnId = randomUUID();
      const userMessageId = randomUUID();
      const proposedAttemptId = randomUUID();
      const costReservationId = randomUUID();
      const requestSnapshot = Object.freeze({
        schemaVersion: REQUEST_CONTRACT_VERSION,
        characterId,
        releaseId,
        bundleId,
        sourceDigest: digest,
        userText,
      });
      const requestHash = sha256(canonicalJson(requestSnapshot));
      const userContentHash = sha256(userText);

      try {
        return await input.runner.run(subjectId, async (client, resolvedSubject) => {
          assertMember(subjectId, resolvedSubject);
          const received = one((await client.query<Row>(RECEIVE_SQL, [
            subjectId,
            threadId,
            clientTurnId,
            requestHash,
            REQUEST_CONTRACT_VERSION,
            canonicalJson(requestSnapshot),
            releaseId,
            bundleId,
            turnId,
            userMessageId,
            userText,
            userContentHash,
          ])).rows);
          const actualTurnId = uuid(received.turnId);
          const actualUserMessageId = uuid(received.userMessageId);
          const actualThreadCharacterId = uuid(received.threadCharacterId);
          const actualReleaseId = uuid(received.contentReleaseId);
          const actualBundleId = uuid(received.contentBundleId);
          const turnState = requiredText(received.turnState, 64);
          const replayed = bool(received.replayed);

          if (actualReleaseId !== releaseId || actualBundleId !== bundleId) {
            throw new FourCharacterProductionExecutionHeldV1();
          }

          if (replayed || turnState !== 'received') {
            return Object.freeze({
              status: turnState === 'committed' || turnState === 'delivered'
                ? 'replayed' as const : 'in_flight' as const,
              subjectId,
              threadId,
              threadCharacterId: actualThreadCharacterId,
              characterId,
              releaseId,
              bundleId,
              turnId: actualTurnId,
              attemptId: uuid(received.committedAttemptId ?? proposedAttemptId),
              costReservationId,
            });
          }

          const allocated = one((await client.query<Row>(ALLOCATE_SQL, [
            subjectId, actualTurnId, proposedAttemptId, PLANNER_VERSION,
          ])).rows);
          const attemptId = uuid(allocated.attemptId);
          const allocationReplayed = bool(allocated.replayed);
          if (allocationReplayed || attemptId !== proposedAttemptId) {
            return Object.freeze({
              status: 'in_flight' as const,
              subjectId, threadId,
              threadCharacterId: actualThreadCharacterId,
              characterId, releaseId, bundleId,
              turnId: actualTurnId, attemptId, costReservationId,
            });
          }

          const ready = one((await client.query<Row>(CONTEXT_READY_SQL, [
            subjectId, actualTurnId, attemptId,
          ])).rows);
          if (bool(ready.replayed)) {
            return Object.freeze({
              status: 'in_flight' as const,
              subjectId, threadId,
              threadCharacterId: actualThreadCharacterId,
              characterId, releaseId, bundleId,
              turnId: actualTurnId, attemptId, costReservationId,
            });
          }

          // Keep the idempotency contract tied to the same immutable source.
          if (actualUserMessageId !== userMessageId) {
            throw new FourCharacterProductionExecutionHeldV1();
          }
          return Object.freeze({
            status: 'reserved' as const,
            subjectId, threadId,
            threadCharacterId: actualThreadCharacterId,
            characterId, releaseId, bundleId,
            turnId: actualTurnId, attemptId, costReservationId,
          });
        });
      } catch {
        throw new FourCharacterProductionExecutionHeldV1();
      }
    },

    async commitValidatedAndIssue(
      request: Parameters<FourCharacterProductionExecutionPortsV1['transaction']['commitValidatedAndIssue']>[0],
    ): Promise<FourCharacterIssuedReceiptV1> {
      const reservation = request.reservation;
      const subjectId = uuid(reservation.subjectId);
      const threadId = uuid(reservation.threadId);
      const turnId = uuid(reservation.turnId);
      const attemptId = uuid(reservation.attemptId);
      const threadCharacterId = uuid(reservation.threadCharacterId);
      const digest = sourceDigest(request.source.sourceDigest);
      const assistantMessageId = randomUUID();
      const generationLogId = randomUUID();
      const validationLogId = randomUUID();
      const outboxEventId = randomUUID();
      const deliveryReceiptId = randomUUID();
      const bodyText = requiredText(request.generated.bodyText, 8000);
      const providerKey = requiredText(request.generated.providerKey, 256);
      const modelKey = requiredText(request.generated.modelKey, 256);
      const outputGuardVersion = requiredText(request.validated.outputGuardVersion, 256);
      if (request.generated.characterId !== reservation.characterId ||
          request.validated.characterId !== reservation.characterId ||
          request.validated.approved !== true ||
          request.validated.bodyText !== bodyText ||
          request.validated.groundingRefs.length !== 0 ||
          request.source.characterId !== reservation.characterId ||
          request.source.releaseId !== reservation.releaseId ||
          request.source.bundleId !== reservation.bundleId ||
          request.source.sourceDigest !== digest) {
        throw new FourCharacterProductionExecutionHeldV1();
      }
      if (Object.values(request.generated.usage).some(
        value => !Number.isSafeInteger(value) || value < 0,
      )) {
        throw new FourCharacterProductionExecutionHeldV1();
      }
      const generatedContentHash = sha256(bodyText);
      const messagePayload = Object.freeze({ text: bodyText });
      const validationResult = Object.freeze({
        approved: true,
        characterId: reservation.characterId,
        sourceDigest: digest,
        generatedContentHash,
        outputGuardVersion,
        groundingRefs: [],
      });

      try {
        return await input.runner.run(subjectId, async (client, resolvedSubject) => {
          assertMember(subjectId, resolvedSubject);
          await client.query<Row>(GENERATED_SQL, [
            subjectId, turnId, attemptId, threadCharacterId, generationLogId,
            providerKey, modelKey, RENDERER_VERSION, bodyText,
            canonicalJson(messagePayload), MESSAGE_SCHEMA_VERSION,
            generatedContentHash, '[]',
          ]);
          await client.query<Row>(VALIDATED_SQL, [
            subjectId, turnId, attemptId, validationLogId,
            OUTPUT_GUARD_PROVIDER, OUTPUT_GUARD_MODEL, outputGuardVersion,
            generatedContentHash, canonicalJson(validationResult), '[]',
          ]);
          const row = one((await client.query<Row>(COMMIT_SQL, [
            subjectId, threadId, turnId, attemptId, assistantMessageId,
            outboxEventId, deliveryReceiptId, digest,
          ])).rows);
          const actualReceiptId = uuid(row.deliveryReceiptId);
          const actualAssistantMessageId = uuid(row.assistantMessageId);
          if (actualReceiptId !== deliveryReceiptId ||
              actualAssistantMessageId !== assistantMessageId ||
              bool(row.replayed)) {
            throw new FourCharacterProductionExecutionHeldV1();
          }
          return Object.freeze({
            status: 'issued_pending_ack' as const,
            subjectId,
            threadId,
            characterId: reservation.characterId,
            turnId,
            attemptId,
            assistantMessageId,
            deliveryReceiptId: actualReceiptId,
          });
        });
      } catch {
        throw new FourCharacterProductionExecutionHeldV1();
      }
    },

    async failAttempt(
      request: Parameters<FourCharacterProductionExecutionPortsV1['transaction']['failAttempt']>[0],
    ): Promise<void> {
      const reservation = request.reservation;
      const subjectId = uuid(reservation.subjectId);
      try {
        await input.runner.run(subjectId, async (client, resolvedSubject) => {
          assertMember(subjectId, resolvedSubject);
          await client.query<Row>(FAILURE_SQL, [
            subjectId,
            uuid(reservation.turnId),
            uuid(reservation.attemptId),
            'failed_retryable',
            request.failureCode,
          ]);
        });
      } catch {
        throw new FourCharacterProductionExecutionHeldV1();
      }
    },
  });
}
