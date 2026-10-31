import { createHmac, timingSafeEqual } from 'node:crypto';
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
 * One shared fixed-origin, bounded, authenticated GET transport for the
 * individual-cancellation and complete-set read-only inspectors.
 * The returned payload stays in the private call stack, never an API response.
 */
export async function getPortOneV2PaymentReadbackPrivateV1(input:Readonly<{
  providerPaymentId:string;
  apiSecret:string;
  fetchImpl?:FetchV1|undefined;
}>):Promise<unknown>{
  if(!validIdentity(input.providerPaymentId)||
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
    return await Promise.race([operation,deadline]);
  }catch{
    throw providerError();
  }finally{
    if(timeout!==undefined)clearTimeout(timeout);
    if(didTimeout)controller.abort();
  }
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
  cancellationIdHmac?:string|undefined;
  sourceHmacSecret?:string|undefined;
  apiSecret:string;
  fetchImpl?:FetchV1|undefined;
}>):Promise<PortOneV2CancellationReadbackReviewV1&Readonly<{
  providerReadbackFromAuthenticatedGet:true;
}>>{
  const recheckByHmac=input.cancellationIdHmac!==undefined||
    input.sourceHmacSecret!==undefined;
  if(!validIdentity(input.providerPaymentId)||
     !validIdentity(input.originalTransactionId)||
     (recheckByHmac&&(
       input.cancellationId!==undefined||
       typeof input.cancellationIdHmac!=='string'||
       !/^hmac-sha256:k1:[0-9a-f]{64}$/u.test(input.cancellationIdHmac)||
       typeof input.sourceHmacSecret!=='string'||
       Buffer.byteLength(input.sourceHmacSecret,'utf8')<32||
       Buffer.byteLength(input.sourceHmacSecret,'utf8')>4096||
       input.sourceHmacSecret.trim()!==input.sourceHmacSecret||
       /[\r\n\u0000-\u001f\u007f]/u.test(input.sourceHmacSecret)
     ))||
     (input.cancellationId!==undefined&&!validIdentity(input.cancellationId))||
     typeof input.apiSecret!=='string'||
     input.apiSecret.length<16||input.apiSecret.length>4096||
     input.apiSecret.trim()!==input.apiSecret||
     /[\r\n\u0000-\u001f\u007f]/u.test(input.apiSecret))
    throw new Error('Invalid internal PortOne V2 cancellation lookup configuration.');
  try{
    const raw=await getPortOneV2PaymentReadbackPrivateV1({
      providerPaymentId:input.providerPaymentId,
      apiSecret:input.apiSecret,
      fetchImpl:input.fetchImpl,
    });
    // The source ledger holds only a keyed HMAC, not a raw cancellationId.
    // Match each bounded current GET item in memory; never return/store raw ID.
    let matchedId=input.cancellationId;
    if(recheckByHmac){
      const payload=raw as Record<string,unknown>|null;
      const items=payload!==null&&typeof payload==='object'&&
        !Array.isArray(payload)?payload.cancellations:null;
      if(!Array.isArray(items)||items.length>64)throw providerError();
      const target=Buffer.from(input.cancellationIdHmac!.slice('hmac-sha256:k1:'.length),'hex');
      let count=0;
      for(const item of items){
        if(item===null||typeof item!=='object'||Array.isArray(item))
          throw providerError();
        const rawId=(item as Record<string,unknown>).id;
        if(!validIdentity(rawId))throw providerError();
        const candidate=createHmac('sha256',input.sourceHmacSecret!)
          .update(JSON.stringify([
            'portone-cancellation-item-v1',input.providerPaymentId,rawId,
          ]),'utf8').digest();
        if(timingSafeEqual(candidate,target)){
          matchedId=rawId;
          count++;
        }
      }
      if(count!==1)throw providerError();
    }
    const classified=inspectPortOneV2CancellationReadbackEvidenceV1({
      paymentId:input.providerPaymentId,
      originalTransactionId:input.originalTransactionId,
      originalVerifiedPaidAmountMinor:input.originalVerifiedPaidAmountMinor,
      originalCurrency:input.originalCurrency,
      environment:input.environment,
      ...(matchedId===undefined?{}:{cancellationId:matchedId}),
      paymentReadback:raw,
    });
    return Object.freeze({...classified,providerReadbackFromAuthenticatedGet:true as const});
  }catch{
    throw providerError();
  }
}
