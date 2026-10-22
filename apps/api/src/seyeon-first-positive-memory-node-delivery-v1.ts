// Watchtower-Track: security
// S5/G3 first response for ONE DB-authorized original Memory in a direct,
// self-owned Node socket ONLY. Never mount on Vercel/Workers Fetch or a proxy.
// The positive DB function is in unmerged Draft #2422; no ACL/Provider release.
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
import {
  sendSeyeonNodeOriginalGrantResponseV1,
  assertSeyeonNodeChatResponseMetadataV1,
  type SeyeonNodeChatResponseMetadataV1,
  type SeyeonNodeOriginalGrantSendOutcomeV1,
  type SeyeonOriginalGrantLockedReadV1,
} from './seyeon-node-original-grant-send-boundary-v1.js';

export const SEYEON_G3_FIRST_POSITIVE_MEMORY_NODE_V1 = Object.freeze({
  version: 'seyeon-g3-first-positive-memory-node-v1',
  dbAuthority: 'public.qry_seyeon_positive_first_memory_locked_reveal_v1',
  transport: 'node:http.ServerResponse',
  publicRouteMounted: false,
  availableForProduction: false,
  availableForFetchOrProxy: false,
  historicalReplayAllowed: false,
  privateStreamingAllowed: false,
  memoryCount: 1,
  modelUseRegistryEnabled: false,
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const LOCKED_G3_SQL = `
select assistant_text as "assistantText"
from public.qry_seyeon_positive_first_memory_locked_reveal_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid
)
`.trim();

// Readiness is deliberately a stronger, no-inference PRECONDITION. It does
// not certify an approved original Grant or final-client receipt, and must
// happen before any runtime.run() that can invoke a metered Provider.
const OWNER_READINESS_SQL = `
select
  to_regprocedure(
    'public.cmd_mark_seyeon_positive_context_ready_pinned_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text)'
  ) is not null
  and to_regprocedure(
    'public.cmd_commit_seyeon_positive_chat_turn_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text)'
  ) is not null
  and to_regprocedure(
    'public.qry_seyeon_positive_first_memory_locked_reveal_v1(uuid,uuid,uuid,uuid)'
  ) is not null
  and (
    select count(*)
    from pg_catalog.pg_proc p
    where p.oid in (
      to_regprocedure(
        'public.cmd_mark_seyeon_positive_context_ready_pinned_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text)'
      ),
      to_regprocedure(
        'public.cmd_commit_seyeon_positive_chat_turn_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text)'
      ),
      to_regprocedure(
        'public.qry_seyeon_positive_first_memory_locked_reveal_v1(uuid,uuid,uuid,uuid)'
      )
    )
      and p.prosecdef
      and pg_catalog.has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
      and (
        (p.proname='qry_seyeon_positive_first_memory_locked_reveal_v1'
         and pg_catalog.pg_get_userbyid(p.proowner)='postgres'
         and 'row_security=off'=any(p.proconfig))
        or
        (p.proname<>'qry_seyeon_positive_first_memory_locked_reveal_v1'
         and pg_catalog.pg_get_userbyid(p.proowner)=
           'myeongha_seyeon_chat_runtime_owner')
      )
  )=3 as "ready"
`.trim();

export class SeyeonG3FirstPositiveNodeUnavailableV1 extends Error {
  constructor(readonly code: 'INVALID_SCOPE' | 'DB_NOT_READY' | 'INVALID_COMMIT') {
    super('First positive Memory Reveal requires current DB and last-hop authority.');
    this.name = 'SeyeonG3FirstPositiveNodeUnavailableV1';
  }
}

function member(e: VerifiedSubjectIdentityEvidenceV1): boolean {
  return e.kind==='member' && UUID.test(e.verifiedAuthUserId);
}

function responseWritable(response: ServerResponse, signal: AbortSignal): boolean {
  return !signal.aborted && !response.headersSent &&
    !response.writableEnded && !response.destroyed && response.socket !== null;
}

/**
 * This is NOT a deploy admission. It ensures that absent G1/G2/G3 migration
 * or missing API EXECUTE cannot cause a paid model request, even on a
 * mistakenly referenced but unmounted Node-only candidate handler.
 */
export async function assertSeyeonFirstPositiveNodeDbReadyV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
}>): Promise<void> {
  if (!member(input.verifiedEvidence)) {
    throw new SeyeonG3FirstPositiveNodeUnavailableV1('INVALID_SCOPE');
  }
  const ready = await executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: async ({ client, resolvedSubject }) => {
      if (resolvedSubject.subjectKind!=='member') return false;
      const result=await client.query<{ready:unknown}>(OWNER_READINESS_SQL);
      return result.rows.length===1 && result.rows[0]?.ready===true;
    },
  });
  if (!ready) throw new SeyeonG3FirstPositiveNodeUnavailableV1('DB_NOT_READY');
}

/**
 * Only server-owned commit locators; never the result's assistantText,
 * client JSON or any replay cache. An independent DB-owner G3 function
 * rechecks current original Grant+Memory and holds row locks until deliver
 * finishes on the SAME direct Node socket, or rollback on interruption.
 */
export function createSeyeonFirstPositiveMemoryLockedReadV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  expectedSubjectId: string;
  threadId: string;
  turnId: string;
  attemptId: string;
}>): SeyeonOriginalGrantLockedReadV1 {
  if (!member(input.verifiedEvidence) ||
      ![input.expectedSubjectId,input.threadId,input.turnId,
        input.attemptId].every(value=>UUID.test(value))) {
    throw new SeyeonG3FirstPositiveNodeUnavailableV1('INVALID_SCOPE');
  }
  let used=false;
  return async ({signal,deliver})=>{
    if (used || signal.aborted) {
      throw new SeyeonG3FirstPositiveNodeUnavailableV1('INVALID_SCOPE');
    }
    used=true;
    await executePostgresSubjectTransactionV1({
      pool:input.pool,
      verifiedEvidence:input.verifiedEvidence,
      execute:async ({client,resolvedSubject})=>{
        if (resolvedSubject.subjectKind!=='member' ||
            resolvedSubject.subjectId!==input.expectedSubjectId ||
            signal.aborted) {
          throw new SeyeonG3FirstPositiveNodeUnavailableV1('INVALID_SCOPE');
        }
        const result=await client.query<{assistantText:unknown}>(LOCKED_G3_SQL,[
          resolvedSubject.subjectId,input.threadId,input.turnId,input.attemptId,
        ]);
        const value=result.rows.length===1 ? result.rows[0]?.assistantText : null;
        const body=typeof value==='string'&&value.trim().length>0&&
          Buffer.byteLength(value,'utf8')<=65_536 ? value : null;
        if(signal.aborted)throw new SeyeonG3FirstPositiveNodeUnavailableV1('INVALID_SCOPE');
        await deliver(body);
        if(signal.aborted)throw new SeyeonG3FirstPositiveNodeUnavailableV1('INVALID_SCOPE');
      },
    });
  };
}

export async function deliverSeyeonCommittedFirstPositiveMemoryNodeTurnV1(
  input: Readonly<{
    response:ServerResponse;
    requestSignal:AbortSignal;
    pool:PostgresSubjectPoolV1;
    verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
    result:RunProductionSeyeonChatResultV1;
    expectedThreadId:string;
    requestId:string;
    serverTime:string;
    deadlineMs?:number;
  }>,
):Promise<SeyeonNodeOriginalGrantSendOutcomeV1>{
  const receipt=input.result?.execution?.committedTurn;
  // An old committed Replay must not inherit the first-send admission.
  if (!member(input.verifiedEvidence) ||
      !UUID.test(input.expectedThreadId) ||
      !responseWritable(input.response,input.requestSignal) ||
      input.result?.threadBinding?.threadId!==input.expectedThreadId ||
      input.result?.execution?.disposition!=='executed' ||
      input.result?.execution?.receivedTurn?.turnId!==receipt?.turnId ||
      !receipt || receipt.replayed!==false ||
      ![input.result.subjectId,receipt.turnId,receipt.attemptId,
        receipt.assistantMessageId].every(s=>UUID.test(s))) {
    input.response.destroy();
    throw new SeyeonG3FirstPositiveNodeUnavailableV1('INVALID_COMMIT');
  }
  const metadata:SeyeonNodeChatResponseMetadataV1={
    turnId:receipt.turnId,
    assistantMessageId:receipt.assistantMessageId,
    sequenceNo:receipt.sequenceNo,
    replayed:false,
    requestId:input.requestId,
    serverTime:input.serverTime,
  };
  try {
    assertSeyeonNodeChatResponseMetadataV1(metadata);
  } catch {
    input.response.destroy();
    throw new SeyeonG3FirstPositiveNodeUnavailableV1('INVALID_COMMIT');
  }
  return sendSeyeonNodeOriginalGrantResponseV1({
    response:input.response,
    requestSignal:input.requestSignal,
    withLockedOriginalGrant:createSeyeonFirstPositiveMemoryLockedReadV1({
      pool:input.pool,
      verifiedEvidence:input.verifiedEvidence,
      expectedSubjectId:input.result.subjectId,
      threadId:input.expectedThreadId,
      turnId:receipt.turnId,
      attemptId:receipt.attemptId,
    }),
    chatResponseMetadata:metadata,
    ...(input.deadlineMs===undefined?{}:{deadlineMs:input.deadlineMs}),
  });
}

/** Server-only pre-model+send seam. No HTTP router mounts or exports it. */
export async function executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1(
  input:Readonly<{
    response:ServerResponse;
    requestSignal:AbortSignal;
    pool:PostgresSubjectPoolV1;
    verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
    threadId:string;
    clientTurnId:string;
    text:string;
    requestId:string;
    serverTime:string;
    runtime:Pick<ProductionSeyeonChatRuntimeV1,'run'>;
    deadlineMs?:number;
  }>,
):Promise<SeyeonNodeOriginalGrantSendOutcomeV1>{
  if (!member(input.verifiedEvidence) ||
      ![input.threadId,input.clientTurnId].every(x=>UUID.test(x)) ||
      typeof input.text!=='string'||input.text.trim().length===0 ||
      input.text.length>8_000 ||
      !responseWritable(input.response,input.requestSignal)) {
    input.response.destroy();
    throw new SeyeonG3FirstPositiveNodeUnavailableV1('INVALID_SCOPE');
  }
  // Check all exact real DB owner RPCs before runtime.run can send paid
  // Interpreter/Renderer requests or persist any personal context.
  // Owner/ACL readiness can fail while the unmounted Node handler still
  // owns an open socket. Terminate it before propagating the HOLD so no
  // outer fallback can accidentally write an unapproved response.
  try {
    await assertSeyeonFirstPositiveNodeDbReadyV1(input);
  } catch (error) {
    input.response.destroy();
    throw error;
  }
  if (!responseWritable(input.response,input.requestSignal)) {
    input.response.destroy();
    throw new SeyeonG3FirstPositiveNodeUnavailableV1('INVALID_SCOPE');
  }
  // A governed runtime/provider failure must not leave a writable Node
  // response that an outer catch/fallback can turn into an unauthorized
  // success or an error containing private model text.
  let result: RunProductionSeyeonChatResultV1;
  try {
    result=await input.runtime.run({
      verifiedEvidence:input.verifiedEvidence,
      threadId:input.threadId,
      clientTurnId:input.clientTurnId,
      text:input.text.trim(),
    });
  } catch (error) {
    input.response.destroy();
    throw error;
  }
  return deliverSeyeonCommittedFirstPositiveMemoryNodeTurnV1({
    response:input.response,
    requestSignal:input.requestSignal,
    pool:input.pool,
    verifiedEvidence:input.verifiedEvidence,
    result,
    expectedThreadId:input.threadId,
    requestId:input.requestId,
    serverTime:input.serverTime,
    ...(input.deadlineMs===undefined?{}:{deadlineMs:input.deadlineMs}),
  });
}
