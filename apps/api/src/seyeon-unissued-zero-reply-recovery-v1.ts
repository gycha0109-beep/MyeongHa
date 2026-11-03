import { createHash, randomBytes } from 'node:crypto';
import { executePostgresSubjectTransactionV1, type PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const SEYEON_UNISSUED_ZERO_REPLY_RPC_V1='public.cmd_recover_seyeon_unissued_zero_reply_v1(uuid,uuid,text,bytea)';

/** Recover the first issuance only. Never use cached runtime/model text. */
export async function recoverSeyeonUnissuedZeroReplyV1(input: Readonly<{
  pool: PostgresSubjectPoolV1; verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  threadId: string; text: string; signal: AbortSignal; requestId: string; serverTime: string;
}>): Promise<string|null> {
  const challenge=randomBytes(32).toString('hex');
  const receiptHash=createHash('sha256').update(challenge,'utf8').digest();
  return executePostgresSubjectTransactionV1({pool:input.pool,verifiedEvidence:input.verifiedEvidence,
    execute:async({client,resolvedSubject})=>{
      if(resolvedSubject.subjectKind!=='member'||input.signal.aborted)throw Error('Original Subject unavailable');
      const r=await client.query<{turnId:string;attemptId:string;assistantMessageId:string;sequenceNo:string;assistantText:string}>(`
        select turn_id::text as "turnId",attempt_id::text as "attemptId",
          assistant_message_id::text as "assistantMessageId",sequence_no::text as "sequenceNo",assistant_text as "assistantText"
        from public.cmd_recover_seyeon_unissued_zero_reply_v1($1::uuid,$2::uuid,$3::text,$4::bytea)`,
        [resolvedSubject.subjectId,input.threadId,input.text,receiptHash]);
      if(r.rows.length===0)return null;
      const row=r.rows[0];
      if(r.rows.length!==1||!row||![row.turnId,row.attemptId,row.assistantMessageId].every(id=>typeof id==='string'&&UUID.test(id))||
         !/^[1-9][0-9]*$/u.test(row.sequenceNo)||!Number.isSafeInteger(Number(row.sequenceNo))||
         typeof row.assistantText!=='string'||!row.assistantText.trim()||Buffer.byteLength(row.assistantText,'utf8')>65536||input.signal.aborted)
        throw Error('Original first issuance unavailable');
      // Serialize under the locked transaction; expose only after COMMIT ACK.
      return JSON.stringify({ok:true,data:{turnId:row.turnId,assistantMessageId:row.assistantMessageId,
        // First receipt issuance, rather than a replay of previously revealed bytes.
        assistantText:row.assistantText,sequenceNo:Number(row.sequenceNo),replayed:false,
        deliveryReceipt:{attemptId:row.attemptId,challenge}},
        meta:{apiContractVersion:'v0.9',requestId:input.requestId,serverTime:input.serverTime}});
    }});
}
