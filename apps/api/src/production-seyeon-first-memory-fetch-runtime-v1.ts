// Watchtower-Track: security
import {createProductionSeyeonFirstMemoryExecutionV1,
  type CreateProductionSeyeonFirstMemoryNodeRuntimeInputV1} from './production-seyeon-first-memory-node-runtime-v1.js';
import {handleSeyeonFirstPositiveMemoryFetchV1,handleSeyeonPositiveReplyReceiptV1} from './seyeon-first-positive-memory-fetch-delivery-v1.js';
import {handleSeyeonMemoryGrantRevokeRequestV1} from './seyeon-memory-grant-revoke-http-v1.js';
import {executePostgresSubjectTransactionV1} from './postgres-subject-execution.js';
import type {SeyeonOriginalMemoryGrantRevokeAckV1} from './seyeon-original-grant-revoke-ack-v1.js';

export function createProductionSeyeonFirstMemoryFetchRuntimeV1(
  input:CreateProductionSeyeonFirstMemoryNodeRuntimeInputV1,
){
  const execution=createProductionSeyeonFirstMemoryExecutionV1(input);
  return Object.freeze({
    async handleRequest(request:Request):Promise<Response>{
      const path=new URL(request.url).pathname;
      const requestId=crypto.randomUUID(),serverTime=new Date().toISOString();
      if(path.startsWith('/api/chat/delivery-receipts/')){
        return handleSeyeonPositiveReplyReceiptV1({request,requestId,pool:execution.pool});
      }
      if(/^\/api\/memories\/[^/]+\/grants\/seyeon\/revoke$/u.test(path)){
        return handleSeyeonMemoryGrantRevokeRequestV1({request,requestId,serverTime,
          identityEvidenceVerifier:execution.identityEvidenceVerifier,pool:execution.pool,
          ...(input.approvedPersonalRecordModelUse===undefined?{}:{
            approvedDbWriteAdmission:input.approvedPersonalRecordModelUse}),
          revoke:async({verifiedEvidence,memoryItemId})=>{
            return executePostgresSubjectTransactionV1({pool:execution.pool,verifiedEvidence,
              execute:async({client,resolvedSubject})=>{
                const r=await client.query<{result:unknown}>(`select
                  seyeon_private.cmd_request_seyeon_memory_revoke_v1($1::uuid,$2::uuid) as result`,
                [resolvedSubject.subjectId,memoryItemId]);
                if(r.rows.length!==1)throw Error('Missing withdrawal result');
                // The HTTP boundary validates the entire public result.
                return r.rows[0]?.result as SeyeonOriginalMemoryGrantRevokeAckV1|
                  Readonly<{status:'pending';memoryItemId:string;characterId:'seyeon';newUseBlocked:true}>;
              }});
          }});
      }
      return handleSeyeonFirstPositiveMemoryFetchV1({request,requestId,serverTime,
        pool:execution.pool,identityEvidenceVerifier:execution.identityEvidenceVerifier,
        runtime:execution.runtime});
    },
    close(){return execution.close();},
  });
}
