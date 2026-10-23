// Watchtower-Track: security
// Actual public.* Production G1/G2 SQL ports. Not mounted or exported by the
// active zero-only Chat runtime; no positive Provider/HTTP capability is given.
import type {PostgresTransactionQueryV1} from './postgres-subject-execution.js';
import type {SeyeonProductionChatCommitReceiptV1} from './seyeon-production-chat-execution-v1.js';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import type {SeyeonExactSelectedPersonalSourceV1} from './seyeon-exact-model-personal-source-selection-v1.js';
import {validateSeyeonPostTurnAnalysisSnapshotV1} from './seyeon-post-turn-analysis-worker-v1.js';

export const SEYEON_POSITIVE_G1_SOURCE_PIN_SQL_V1 =
  'public.cmd_mark_seyeon_positive_context_ready_pinned_v1' as const;
export const SEYEON_POSITIVE_G2_ATOMIC_COMMIT_SQL_V1 =
  'public.cmd_commit_seyeon_positive_chat_turn_v1' as const;

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA=/^sha256:v1:[a-f0-9]{64}$/u;
const PG_SHA=/^sha256:pg-jsonb:v1:[a-f0-9]{64}$/u;

export interface SeyeonPositiveS0SourcePinInputV1 {
  readonly subjectId:string;
  readonly threadId:string;
  readonly turnId:string;
  readonly attemptId:string;
  readonly originalMemoryId:string;
  readonly originalGrantId:string;
  readonly recordType:string;
  readonly schemaVersion:string;
  readonly projectorVersion:string;
  /** Same complete, ordered model selection used to derive selectedSourcesDigest. */
  readonly selectedSources:readonly SeyeonExactSelectedPersonalSourceV1[];
  readonly selectedSourcesDigest:string;
  readonly projectedMemoryDigest:string;
  readonly finalModelContextDigest:string;
  readonly expectedOriginalPgDigest:string;
}

export interface SeyeonPositiveS0AtomicCommitInputV1 {
  readonly subjectId:string;
  readonly threadId:string;
  readonly turnId:string;
  readonly attemptId:string;
  readonly userMessageId:string;
  readonly assistantMessageId:string;
  readonly chatOutboxEventId:string;
  readonly postTurnOutboxEventId:string;
  readonly postTurnSnapshot:unknown;
  readonly postTurnSnapshotHash:string;
  readonly selectedSourcesDigest:string;
  readonly finalModelContextDigest:string;
}

export interface SeyeonPositiveS0OwnerDbPortsV1 {
  /** Call from the canonical, verified Member Subject transaction runner.
   * Server-only source candidates, never an HTTP or LLM-supplied authority.
   * Requires a separately registered type, DB owner roles and positive ACL.
   */
  pinBeforeModel(input:SeyeonPositiveS0SourcePinInputV1):Promise<Readonly<Record<string,unknown>>>;
  /** The DB validates original Grant/current raw record in the same TX as
   * existing v2 Chat/Outbox Commit. This does NOT permit first Reveal.
   */
  commitAfterValidation(
    input:SeyeonPositiveS0AtomicCommitInputV1,
  ):Promise<SeyeonProductionChatCommitReceiptV1>;
}

function exactId(value:string):boolean {return UUID.test(value);}
function digest(value:string):boolean {return SHA.test(value);}
function strictText(value:string):boolean {
  return typeof value==='string' && value.length>0 &&
    value.length<=100 && value===value.trim();
}
function one(rows:readonly Record<string,unknown>[],stage:string){
  if(rows.length!==1||!rows[0])throw Error('Se-yeon positive '+stage+' missing DB owner receipt');
  return rows[0];
}
function receiptText(value:unknown):string{
  if(typeof value!=='string'||!value.trim())throw Error('Se-yeon DB Commit receipt malformed');
  return value;
}
function receiptNumber(value:unknown):number{
  const n=typeof value==='number'?value:typeof value==='string'?Number(value):NaN;
  if(!Number.isSafeInteger(n)||n<1)throw Error('Se-yeon DB Commit sequence malformed');
  return n;
}

export function createSeyeonPositiveS0OwnerDbPortsV1(
  client:PostgresTransactionQueryV1,
):SeyeonPositiveS0OwnerDbPortsV1 {
  return Object.freeze({
    async pinBeforeModel(input:SeyeonPositiveS0SourcePinInputV1):Promise<Readonly<Record<string,unknown>>>{
      if(![input.subjectId,input.threadId,input.turnId,input.attemptId,
          input.originalMemoryId,input.originalGrantId].every(exactId)
        ||![input.recordType,input.schemaVersion,input.projectorVersion].every(strictText)
        ||![input.selectedSourcesDigest,input.projectedMemoryDigest,
            input.finalModelContextDigest].every(digest)
        || !PG_SHA.test(input.expectedOriginalPgDigest)) {
        throw Error('Se-yeon positive G1 requires exact server-created source');
      }
      // §57/§60: bind the immutable DB G1 Pin digest to the SAME actual
      // one-source model selection. A syntactically valid digest is never
      // proof that a matching original Memory/Grant was selected.
      const selected=input.selectedSources;
      const source=Array.isArray(selected)&&selected.length===1?selected[0]:null;
      const sourceKeys=[
        'recordKind','recordId','grantId','recordType','schemaVersion',
        'rawRecordDigest','projectedMemoryDigest','rawRecordPgDigest',
        'projectorVersion',
      ] as const;
      if(!source||typeof source!=='object'||Array.isArray(source)
        ||Object.keys(source).length!==sourceKeys.length
        ||sourceKeys.some(key=>!Object.prototype.hasOwnProperty.call(source,key))
        ||source.recordKind!=='memory'
        ||source.recordId!==input.originalMemoryId
        ||source.grantId!==input.originalGrantId
        ||source.recordType!==input.recordType
        ||source.schemaVersion!==input.schemaVersion
        ||source.projectorVersion!==input.projectorVersion
        ||source.projectedMemoryDigest!==input.projectedMemoryDigest
        ||source.rawRecordPgDigest!==input.expectedOriginalPgDigest
        ||!SHA.test(source.rawRecordDigest)
        ||!SHA.test(source.projectedMemoryDigest)
        ||!PG_SHA.test(source.rawRecordPgDigest)
        ||'sha256:v1:'+createHash('sha256')
          .update(canonicalJson(selected)).digest('hex')!==input.selectedSourcesDigest) {
        throw Error('Se-yeon positive G1 selected source digest mismatch');
      }
      const rows=await client.query<{receipt:unknown}>(`
select public.cmd_mark_seyeon_positive_context_ready_pinned_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,
  $7::text,$8::text,$9::text,$10::text,$11::text,$12::text,
  $13::text
) as receipt`.trim(),[
        input.subjectId,input.threadId,input.turnId,input.attemptId,
        input.originalMemoryId,input.originalGrantId,
        input.recordType,input.schemaVersion,input.projectorVersion,
        input.selectedSourcesDigest,input.projectedMemoryDigest,
        input.finalModelContextDigest,input.expectedOriginalPgDigest,
      ]);
      const receipt=one(rows.rows,'G1').receipt;
      if(receipt===null||typeof receipt!=='object'||Array.isArray(receipt))
        throw Error('Se-yeon G1 owner Pin receipt missing');
      const proof=receipt as Record<string,unknown>;
      // The DB owner defines exactly one original Memory / original Grant
      // proof. Do not promote a partial receipt or a mismatched type/projector
      // to model authority even when the IDs and digest strings happen to fit.
      const expectedKeys=[
        'schemaVersion','subjectId','threadId','turnId','attemptId',
        'characterId','recordKind','recordId','originalGrantId',
        'originalGrantedAt','recordType','recordSchemaVersion',
        'projectorVersion','selectedSourcesDigest','projectedMemoryDigest',
        'originalPgJsonbDigest','finalModelContextDigest',
      ] as const;
      if(Object.keys(proof).length!==expectedKeys.length
        ||expectedKeys.some(key=>!Object.prototype.hasOwnProperty.call(proof,key))
        ||proof.schemaVersion!=='seyeon-positive-original-memory-source-pin-v1'
        ||proof.subjectId!==input.subjectId||proof.threadId!==input.threadId
        ||proof.turnId!==input.turnId||proof.attemptId!==input.attemptId
        ||proof.characterId!=='seyeon'||proof.recordKind!=='memory'
        ||proof.originalGrantId!==input.originalGrantId
        ||proof.recordId!==input.originalMemoryId
        ||proof.recordType!==input.recordType
        ||proof.recordSchemaVersion!==input.schemaVersion
        ||proof.projectorVersion!==input.projectorVersion
        ||typeof proof.originalGrantedAt!=='string'
        ||!Number.isFinite(Date.parse(proof.originalGrantedAt))
        ||proof.selectedSourcesDigest!==input.selectedSourcesDigest
        ||proof.projectedMemoryDigest!==input.projectedMemoryDigest
        ||proof.finalModelContextDigest!==input.finalModelContextDigest
        ||proof.originalPgJsonbDigest!==input.expectedOriginalPgDigest)
        throw Error('Se-yeon G1 original owner Pin receipt mismatch');
      return Object.freeze(proof);
    },
    async commitAfterValidation(
      input:SeyeonPositiveS0AtomicCommitInputV1,
    ):Promise<SeyeonProductionChatCommitReceiptV1>{
      if(![input.subjectId,input.threadId,input.turnId,input.attemptId,
          input.userMessageId,input.assistantMessageId,input.chatOutboxEventId,
          input.postTurnOutboxEventId].every(exactId)
        ||![input.postTurnSnapshotHash,input.selectedSourcesDigest,
             input.finalModelContextDigest].every(digest)
        ||!input.postTurnSnapshot
        ||typeof input.postTurnSnapshot!=='object'
        ||Array.isArray(input.postTurnSnapshot)) {
        throw Error('Se-yeon positive G2 requires exact validated source');
      }
      // Positive G2 may only commit the actual official post-turn snapshot
      // for this server turn and assistant. A checksum-shaped string or
      // self-rehashed ad hoc object is not a validated worker projection.
      // Deny before entering the DB owner commit transaction.
      let verifiedSnapshot: ReturnType<typeof validateSeyeonPostTurnAnalysisSnapshotV1>;
      try {
        verifiedSnapshot=validateSeyeonPostTurnAnalysisSnapshotV1(
          input.postTurnSnapshot,input.postTurnSnapshotHash,
        );
      } catch {
        throw Error('Se-yeon positive G2 Post-turn Snapshot unverified');
      }
      if(verifiedSnapshot.turnId!==input.turnId
        ||verifiedSnapshot.userMessageId!==input.userMessageId
        ||verifiedSnapshot.assistantMessageId!==input.assistantMessageId
        ||canonicalJson(verifiedSnapshot)!==canonicalJson(input.postTurnSnapshot)){
        throw Error('Se-yeon positive G2 Post-turn Snapshot identity mismatched');
      }
      const result=await client.query<Record<string,unknown>>(`
select turn_id::text as "turnId",
       attempt_id::text as "attemptId",
       assistant_message_id::text as "assistantMessageId",
       sequence_no as "sequenceNo",
       committed_at::text as "committedAt",
       post_turn_outbox_event_id::text as "postTurnOutboxEventId",
       replayed
from public.cmd_commit_seyeon_positive_chat_turn_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,
  $7::uuid,$8::uuid,$9::jsonb,$10::text,$11::text,$12::text
)`.trim(),[
        input.subjectId,input.threadId,input.turnId,input.attemptId,
        input.userMessageId,input.assistantMessageId,input.chatOutboxEventId,
        input.postTurnOutboxEventId,JSON.stringify(input.postTurnSnapshot),
        input.postTurnSnapshotHash,input.selectedSourcesDigest,
        input.finalModelContextDigest,
      ]);
      const row=one(result.rows,'G2');
      if(row.replayed!==false||row.turnId!==input.turnId
        ||row.attemptId!==input.attemptId
        ||row.assistantMessageId!==input.assistantMessageId
        ||row.postTurnOutboxEventId!==input.postTurnOutboxEventId){
        throw Error('Se-yeon positive G2 Commit receipt mismatched');
      }
      const committedAt=receiptText(row.committedAt);
      if(!Number.isFinite(Date.parse(committedAt)))
        throw Error('Se-yeon positive G2 Commit timestamp malformed');
      return Object.freeze({
        turnId:receiptText(row.turnId),
        attemptId:receiptText(row.attemptId),
        assistantMessageId:receiptText(row.assistantMessageId),
        sequenceNo:receiptNumber(row.sequenceNo),
        committedAt:new Date(committedAt).toISOString(),
        postTurnOutboxEventId:receiptText(row.postTurnOutboxEventId),
        replayed:false,
      });
    },
  });
}
