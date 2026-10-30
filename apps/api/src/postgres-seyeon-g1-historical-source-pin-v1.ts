// Watchtower-Track: security
// Model-selected historical message identities: DB owner exact G0 source Pin.
// Pinning alone does not authorize Provider/Commit/Reveal or history replay.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import type {SeyeonRecentMessageV2} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type {PostgresTransactionQueryV1} from './postgres-subject-execution.js';

export const POSTGRES_SEYEON_G1_HISTORICAL_MODEL_PIN_RPC_V1=
  'public.cmd_pin_seyeon_g1_historical_model_messages_v1' as const;

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const DIGEST=/^sha256:v1:[a-f0-9]{64}$/u;

export interface SeyeonG1HistoricalModelMessagesPinInputV1 {
  readonly subjectId:string;
  readonly threadId:string;
  readonly turnId:string;
  readonly attemptId:string;
  readonly currentUserMessageId:string;
  readonly selectedModelMessages:readonly SeyeonRecentMessageV2[];
}

export interface SeyeonG1HistoricalModelMessagesPinPortV1 {
  pinHistoricalModelMessages(input:SeyeonG1HistoricalModelMessagesPinInputV1):Promise<void>;
}

export function createPostgresSeyeonG1HistoricalModelMessagesPinPortV1(
  client:PostgresTransactionQueryV1,
):SeyeonG1HistoricalModelMessagesPinPortV1 {
  return Object.freeze({
    async pinHistoricalModelMessages(input:SeyeonG1HistoricalModelMessagesPinInputV1):Promise<void> {
      const msgs=input.selectedModelMessages;
      if(![input.subjectId,input.threadId,input.turnId,input.attemptId,
            input.currentUserMessageId].every(id=>typeof id==='string'&&UUID.test(id)) ||
         !Array.isArray(msgs)||msgs.length<2||msgs.length>24 ||
         msgs[msgs.length-1]?.messageId!==input.currentUserMessageId ||
         msgs[msgs.length-1]?.role!=='user' ||
         new Set(msgs.map(m=>m.messageId)).size!==msgs.length ||
         msgs.some(m=>!UUID.test(m.messageId) ||
           (m.role!=='user'&&m.role!=='assistant') ||
           typeof m.text!=='string'||m.text.trim().length===0)) {
        throw Error('G1 historical model source selection is invalid');
      }
      // Identity/order/source text are the actual model-selected view, not
      // a free-text statement by the browser, provider or derived sourceRef.
      const ids=msgs.map(m=>m.messageId);
      const digest='sha256:v1:'+createHash('sha256')
        .update(canonicalJson(msgs)).digest('hex');
      const rows=await client.query<{receipt:unknown}>(`
select public.cmd_pin_seyeon_g1_historical_model_messages_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid[],$7::text
) as receipt`,[
        input.subjectId,input.threadId,input.turnId,input.attemptId,
        input.currentUserMessageId,ids,digest,
      ]);
      if(rows.rows.length!==1||!rows.rows[0]||
         typeof rows.rows[0].receipt!=='object'||
         rows.rows[0].receipt===null||Array.isArray(rows.rows[0].receipt)){
        throw Error('G1 historical model source DB Pin receipt absent');
      }
      const proof=rows.rows[0].receipt as Record<string,unknown>;
      const sources=proof.sources;
      if(proof.schemaVersion!=='seyeon-g1-historical-model-source-pin-v1'||
         proof.subjectId!==input.subjectId||proof.threadId!==input.threadId||
         proof.turnId!==input.turnId||proof.attemptId!==input.attemptId||
         proof.currentUserMessageId!==input.currentUserMessageId||
         proof.modelMessagesDigest!==digest||!DIGEST.test(digest)||
         !Array.isArray(sources)||sources.length!==msgs.length||
         sources.some((source,i)=>source===null||typeof source!=='object'||
           (source as {messageId?:unknown}).messageId!==ids[i]||
           !Number.isSafeInteger(Number((source as {sequenceNo?:unknown}).sequenceNo))||
           typeof (source as {contentHash?:unknown}).contentHash!=='string')){
        throw Error('G1 historical model source DB Pin receipt mismatch');
      }
    },
  });
}
