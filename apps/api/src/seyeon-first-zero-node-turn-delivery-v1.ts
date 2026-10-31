// Watchtower-Track: security
// Candidate only: join the server-committed Seyeon turn to a fresh, DB-locked
// Node socket handoff. NEVER mount this on Vercel's Fetch Response dispatcher.
import type { ServerResponse } from 'node:http';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import type {
  ProductionSeyeonChatRuntimeV1,
  RunProductionSeyeonChatResultV1,
} from './production-seyeon-chat-runtime-v1.js';
import { createSeyeonLockedFirstZeroNodeRevealV1 } from './seyeon-locked-first-zero-node-reveal-v1.js';
import {
  sendSeyeonNodeOriginalGrantResponseV1,
  assertSeyeonNodeChatResponseMetadataV1,
  type SeyeonNodeOriginalGrantSendOutcomeV1,
  type SeyeonNodeChatResponseMetadataV1,
} from './seyeon-node-original-grant-send-boundary-v1.js';

export const SEYEON_FIRST_ZERO_NODE_TURN_DELIVERY_V1 = Object.freeze({
  version: 'seyeon-first-zero-node-turn-delivery-v1',
  productionRouteMounted: false,
  vercelFetchSupported: false,
  positiveOrHistoricalSourcesAllowed: false,
  modelCallBeforeDbReadiness: false,
  clientPayloadAsRevealSource: false,
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const READINESS_SQL = `
select exists(
  select 1 from pg_catalog.pg_proc p
  where p.oid=to_regprocedure(
    'public.qry_seyeon_locked_first_zero_source_reveal_v1(uuid,uuid,uuid,uuid)'
  )
    and p.prosecdef
    and pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    and 'row_security=off'=any(p.proconfig)
    and pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE')
    and pg_catalog.has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE')
    and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    and not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
) as "ready"
`.trim();

export class SeyeonFirstZeroNodeTurnDeliveryErrorV1 extends Error {
  constructor(readonly code: 'INVALID_SCOPE' | 'DB_NOT_READY' | 'INVALID_COMMIT' | 'REPLAY_HOLD') {
    super('Seyeon first zero-source Node turn delivery is unavailable.');
    this.name = 'SeyeonFirstZeroNodeTurnDeliveryErrorV1';
  }
}

function member(evidence: VerifiedSubjectIdentityEvidenceV1): boolean {
  return evidence.kind === 'member' && UUID.test(evidence.verifiedAuthUserId);
}

function validText(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0 &&
    value.trim().length <= 8000;
}

export interface ExecuteAndDeliverSeyeonFirstZeroNodeTurnInputV1 {
  /** Only direct, authenticated Node HTTP transport can be supplied. */
  readonly response: ServerResponse;
  readonly requestSignal: AbortSignal;
  readonly pool: PostgresSubjectPoolV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly threadId: string;
  readonly clientTurnId: string;
  readonly text: string;
  /** Only server-generated request metadata, never caller-supplied. */
  readonly requestId: string;
  readonly serverTime: string;
  readonly runtime: Pick<ProductionSeyeonChatRuntimeV1, 'run'>;
  readonly deadlineMs?: number;
}

/**
 * Check the exact currently installed DB security function and its executor
 * EXECUTE permission before creating a durable Turn or invoking paid models.
 * This check is readiness only, NEVER a permission to reveal private text.
 */
export async function assertSeyeonFirstZeroNodeDbReadyV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
}>): Promise<void> {
  if (!member(input.verifiedEvidence)) {
    throw new SeyeonFirstZeroNodeTurnDeliveryErrorV1('INVALID_SCOPE');
  }
  const ready = await executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: async ({ resolvedSubject, client }) => {
      if (resolvedSubject.subjectKind !== 'member') return false;
      const result = await client.query<{ ready: unknown }>(READINESS_SQL);
      return result.rows.length === 1 && result.rows[0]?.ready === true;
    },
  });
  if (!ready) throw new SeyeonFirstZeroNodeTurnDeliveryErrorV1('DB_NOT_READY');
}

/**
 * Only canonical server execution receipts are locators here. Never serialize
 * execution.assistantText, runtimeResult.utterance, browser text or a cached
 * replay. The separate DB-owner SQL will fetch the *original* committed body
 * under fresh subject/turn/attempt locks while send is in progress.
 */
export async function deliverSeyeonCommittedFirstZeroNodeTurnV1(input: Readonly<{
  response: ServerResponse;
  requestSignal: AbortSignal;
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  result: RunProductionSeyeonChatResultV1;
  expectedThreadId: string;
  requestId: string;
  serverTime: string;
  deadlineMs?: number;
}>): Promise<SeyeonNodeOriginalGrantSendOutcomeV1> {
  const { result } = input;
  const commit = result?.execution?.committedTurn;
  // An already committed/replayed answer is not a new first Reveal.
  // Never ask the DB to re-read original private text for a replay locator.
  if (result?.execution?.disposition === 'committed_replay' || commit?.replayed === true) {
    input.response.destroy();
    throw new SeyeonFirstZeroNodeTurnDeliveryErrorV1('REPLAY_HOLD');
  }
  if (!member(input.verifiedEvidence) ||
      !UUID.test(input.expectedThreadId) ||
      result.threadBinding.threadId !== input.expectedThreadId ||
      !UUID.test(result.subjectId) ||
      !UUID.test(commit?.turnId ?? '') ||
      !UUID.test(commit?.attemptId ?? '') ||
      !UUID.test(commit?.assistantMessageId ?? '') ||
      commit.turnId !== result.execution.receivedTurn.turnId) {
    input.response.destroy();
    throw new SeyeonFirstZeroNodeTurnDeliveryErrorV1('INVALID_COMMIT');
  }

  const chatResponseMetadata: SeyeonNodeChatResponseMetadataV1 = {
    turnId: commit.turnId,
    assistantMessageId: commit.assistantMessageId,
    sequenceNo: commit.sequenceNo,
    replayed:
      result.execution.disposition === 'committed_replay' || commit.replayed,
    requestId: input.requestId,
    serverTime: input.serverTime,
  };
  try {
    assertSeyeonNodeChatResponseMetadataV1(chatResponseMetadata);
  } catch (error) {
    input.response.destroy();
    throw error;
  }

  const withLockedOriginalGrant = createSeyeonLockedFirstZeroNodeRevealV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    serverThreadId: result.threadBinding.threadId,
    serverTurnId: commit.turnId,
    serverAttemptId: commit.attemptId,
  });
  return sendSeyeonNodeOriginalGrantResponseV1({
    response: input.response,
    requestSignal: input.requestSignal,
    withLockedOriginalGrant,
    chatResponseMetadata,
    ...(input.deadlineMs === undefined ? {} : { deadlineMs: input.deadlineMs }),
  });
}

/**
 * An internal, unmounted Node-only orchestration seam. Callers must verify
 * Member credentials and validate the canonical route before constructing it.
 * Untrusted input IDs are accepted only as request locators and are rechecked
 * by the existing chat persistence commands. No public Vercel route calls it.
 */
export async function executeAndDeliverSeyeonFirstZeroNodeTurnV1(
  input: ExecuteAndDeliverSeyeonFirstZeroNodeTurnInputV1,
): Promise<SeyeonNodeOriginalGrantSendOutcomeV1> {
  if (!member(input.verifiedEvidence) || !UUID.test(input.threadId) ||
      !UUID.test(input.clientTurnId) || !validText(input.text) ||
      input.requestSignal.aborted ||
      input.response.headersSent || input.response.writableEnded ||
      input.response.destroyed) {
    input.response.destroy();
    throw new SeyeonFirstZeroNodeTurnDeliveryErrorV1('INVALID_SCOPE');
  }
  // Fail closed on malformed server metadata before DB writes or paid inference.
  try {
    assertSeyeonNodeChatResponseMetadataV1({
      turnId: input.threadId,
      assistantMessageId: input.clientTurnId,
      sequenceNo: 0,
      replayed: false,
      requestId: input.requestId,
      serverTime: input.serverTime,
    });
  } catch (error) {
    input.response.destroy();
    throw error;
  }
  // This must precede runtime.run because that step may charge the provider.
  await assertSeyeonFirstZeroNodeDbReadyV1(input);
  // DB readiness can complete after the peer disconnects. Neither a stale
  // request signal nor a successful readiness result licenses a paid call.
  if (input.requestSignal.aborted || input.response.destroyed ||
      input.response.headersSent || input.response.writableEnded) {
    input.response.destroy();
    throw new SeyeonFirstZeroNodeTurnDeliveryErrorV1('INVALID_SCOPE');
  }

  const result = await input.runtime.run({
    verifiedEvidence: input.verifiedEvidence,
    threadId: input.threadId,
    clientTurnId: input.clientTurnId,
    text: input.text.trim(),
  });
  return deliverSeyeonCommittedFirstZeroNodeTurnV1({
    response: input.response,
    requestSignal: input.requestSignal,
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    result,
    expectedThreadId: input.threadId,
    requestId: input.requestId,
    serverTime: input.serverTime,
    ...(input.deadlineMs === undefined ? {} : { deadlineMs: input.deadlineMs }),
  });
}
