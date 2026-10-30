import {
  inspectPortOneV2CancellationReadbackEvidenceV1,
  type PortOneV2CancellationReadbackReviewV1,
} from './portone-v2-cancellation-readback-evidence-v1.js';

export const PORTONE_V2_CANCELLATION_READBACK_GET_V1 = Object.freeze({
  productionMounted: false,
  externalCancellationPostEnabled: false,
  paymentLookupHttpMethod: 'GET',
  endpoint: 'https://api.portone.io',
  maxResponseBytes: 262144,
  timeoutMilliseconds: 10000,
  entitlementMutationEnabled: false,
} as const);

type FetchV1=typeof fetch;
const ID=/^[^\u0000-\u001f\u007f]{1,512}$/u;
function validIdentity(v:unknown):v is string {
  return typeof v==='string'&&ID.test(v)&&v.trim()===v;
}
function providerError():Error{
  return new Error('PortOne V2 cancellation readback unavailable.');
}
async function readBoundedJson(
  response:Response,
  maxBytes:number,
):Promise<unknown> {
  const contentType=response.headers.get('content-type');
  if(!contentType||!/^application\/json(?:\s*;|$)/iu.test(contentType))
    throw providerError();
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/u.test(length)||BigInt(length)>BigInt(maxBytes)))
    throw providerError();
  if(!response.body)throw providerError();
  const reader=response.body.getReader();
  let bytes=0;
  const chunks:Uint8Array[]=[];
  let completed=false;
  try{
    while(true){
      const read=await reader.read();
      if(read.done){completed=true;break;}
      if(!(read.value instanceof Uint8Array))throw providerError();
      bytes+=read.value.byteLength;
      if(bytes>maxBytes)throw providerError();
      chunks.push(read.value);
    }
  }finally{
    if(!completed)await reader.cancel().catch(()=>undefined);
    reader.releaseLock();
  }
  if(bytes===0)throw providerError();
  const all=new Uint8Array(bytes);
  let offset=0;
  for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
  try{
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all)) as unknown;
  }catch{throw providerError();}
}

/**
 * Internal operations-only GET. Unmounted: no public route, no stored secret,
 * and no POST /cancel. The original receipt input must come from a trusted
 * complete-visibility Commerce evidence lookup, never webhook data.
 */
export async function inspectPortOneV2CancellationViaGetCandidateV1(input:Readonly<{
  providerPaymentId:string;
  originalTransactionId:string;
  originalVerifiedPaidAmountMinor:number;
  originalCurrency:string;
  environment:'production'|'sandbox';
  cancellationId?:string|undefined;
  apiSecret:string;
  fetchImpl?:FetchV1|undefined;
}>):Promise<PortOneV2CancellationReadbackReviewV1&Readonly<{
  providerReadbackFromAuthenticatedGet:true;
}>>{
  if(!validIdentity(input.providerPaymentId)||
     !validIdentity(input.originalTransactionId)||
     (input.cancellationId!==undefined&&!validIdentity(input.cancellationId))||
     typeof input.apiSecret!=='string'||
     input.apiSecret.length<16||input.apiSecret.length>4096||
     input.apiSecret.trim()!==input.apiSecret||
     /[\r\n\u0000-\u001f\u007f]/u.test(input.apiSecret))
    throw new Error('Invalid internal PortOne V2 cancellation lookup configuration.');
  const controller=new AbortController();
  let timeout:ReturnType<typeof setTimeout>|undefined;
  let didTimeout=false;
  const signal=controller.signal;
  const deadline=new Promise<never>((_,reject)=>{
    timeout=setTimeout(()=>{
      didTimeout=true;
      controller.abort();
      reject(providerError());
    },PORTONE_V2_CANCELLATION_READBACK_GET_V1.timeoutMilliseconds);
  });
  try{
    const operation=(async()=>{
      const response=await (input.fetchImpl??fetch)(
        `${PORTONE_V2_CANCELLATION_READBACK_GET_V1.endpoint}/payments/${encodeURIComponent(input.providerPaymentId)}`,
        {method:'GET',redirect:'manual',signal,
          headers:{accept:'application/json',authorization:`PortOne ${input.apiSecret}`}},
      );
      if(response.status!==200)throw providerError();
      return readBoundedJson(response,PORTONE_V2_CANCELLATION_READBACK_GET_V1.maxResponseBytes);
    })();
    const raw=await Promise.race([operation,deadline]);
    const classified=inspectPortOneV2CancellationReadbackEvidenceV1({
      paymentId:input.providerPaymentId,
      originalTransactionId:input.originalTransactionId,
      originalVerifiedPaidAmountMinor:input.originalVerifiedPaidAmountMinor,
      originalCurrency:input.originalCurrency,
      environment:input.environment,
      ...(input.cancellationId===undefined?{}:{cancellationId:input.cancellationId}),
      paymentReadback:raw,
    });
    return Object.freeze({...classified,providerReadbackFromAuthenticatedGet:true as const});
  }catch{
    throw providerError();
  }finally{
    if(timeout!==undefined)clearTimeout(timeout);
    if(didTimeout)controller.abort();
  }
}
