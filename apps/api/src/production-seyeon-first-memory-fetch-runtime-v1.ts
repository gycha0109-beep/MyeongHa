// Watchtower-Track: security
import {createProductionSeyeonFirstMemoryExecutionV1,
  type CreateProductionSeyeonFirstMemoryNodeRuntimeInputV1} from './production-seyeon-first-memory-node-runtime-v1.js';
import {handleSeyeonFirstPositiveMemoryFetchV1} from './seyeon-first-positive-memory-fetch-delivery-v1.js';
import {handleSeyeonReceiptWithdrawalFetchV1} from './seyeon-receipt-withdrawal-fetch-v1.js';

export function createProductionSeyeonFirstMemoryFetchRuntimeV1(
  input:CreateProductionSeyeonFirstMemoryNodeRuntimeInputV1,
){
  const execution=createProductionSeyeonFirstMemoryExecutionV1(input);
  return Object.freeze({
    async handleRequest(request:Request):Promise<Response>{
      const requestId=crypto.randomUUID(),serverTime=new Date().toISOString();
      const command=await handleSeyeonReceiptWithdrawalFetchV1({
        request,requestId,serverTime,
        identityEvidenceVerifier:execution.identityEvidenceVerifier,
        pool:execution.pool,
        ...(input.approvedPersonalRecordModelUse===undefined?{}:{
          approvedWithdrawalWriteAdmission:input.approvedPersonalRecordModelUse,
        }),
      });
      if(command!==null)return command;
      return handleSeyeonFirstPositiveMemoryFetchV1({request,requestId,serverTime,
        pool:execution.pool,identityEvidenceVerifier:execution.identityEvidenceVerifier,
        runtime:execution.runtime,
        ...(input.zeroSourceFirstReplyApproved===true ? {zeroSourceFirstReplyApproved:true as const}:{}),
      });
    },
    close(){return execution.close();},
  });
}
