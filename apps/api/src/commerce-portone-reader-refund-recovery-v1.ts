import type {
  PortOneV2PaymentHttpFetchV1,
} from './portone-v2-payment-verification-adapter.js';

/**
 * Recover an uncertain full cancellation after the POST response was lost.
 * A previously dispatched provider request is NEVER sent again. The only
 * admissible recovery is a fresh, authenticated PortOne GET proving that
 * exactly ONE successful cancellation belongs to the original full payment.
 * The normal full-cancellation verifier runs AGAIN after this lookup.
 */
export async function recoverExactPortOneFullCancellationIdV1(input: Readonly<{
  paymentId:string;
  transactionId:string;
  originalAmountMinor:number;
  originalCurrency:string;
  apiSecret:string;
  timeoutMs:number;
  fetchImpl?:PortOneV2PaymentHttpFetchV1;
}>):Promise<string|null>{
  const controller=new AbortController();
  let timer: ReturnType<typeof setTimeout>|undefined;
  const providerId=/^[^\u0000-\u001f\u007f]{1,512}$/u;
  if(!providerId.test(input.paymentId)||!providerId.test(input.transactionId)
    ||!Number.isSafeInteger(input.originalAmountMinor)
    ||input.originalAmountMinor<=0
    ||!/^[A-Z]{3}$/u.test(input.originalCurrency)
    ||typeof input.apiSecret!=='string'||input.apiSecret.length<16
    ||input.apiSecret.trim()!==input.apiSecret
    ||!Number.isSafeInteger(input.timeoutMs)||input.timeoutMs<1
    ||input.timeoutMs>30_000) return null;
  try{
    const deadline=new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{
        controller.abort();
        reject(Error('REFUND_RECONCILIATION_TIMEOUT'));
      },input.timeoutMs);
    });
    const fetchImpl=input.fetchImpl??(async(url,init)=>fetch(url,init));
    const response=await Promise.race([
      fetchImpl('https://api.portone.io/payments/'+encodeURIComponent(input.paymentId),{
        method:'GET',redirect:'manual',signal:controller.signal,
        headers:Object.freeze({
          authorization:'PortOne '+input.apiSecret,
          accept:'application/json',
        }),
      }),
      deadline,
    ]);
    if(response.status!==200
      ||!/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type')??''))return null;
    const contentLength=response.headers.get('content-length');
    if(contentLength!==null
      &&(!/^\d+$/u.test(contentLength)||Number(contentLength)>65_536)) return null;
    const raw=await Promise.race([response.text(),deadline]);
    if(Buffer.byteLength(raw,'utf8')>65_536)return null;
    const value:unknown=JSON.parse(raw);
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const payment=value as Record<string,unknown>;
    if(payment.id!==input.paymentId||payment.transactionId!==input.transactionId
      ||payment.status!=='CANCELLED'||payment.currency!==input.originalCurrency)return null;
    const amount=payment.amount;
    if(!amount||typeof amount!=='object'||Array.isArray(amount)
      ||(amount as Record<string,unknown>).total!==input.originalAmountMinor)return null;
    // Recovery may record an ID before the later independent verifier.
    // A fully CANCELLED payment assembled from multiple partial cancels is
    // not the single original full-refund operation being recovered.
    if(!Array.isArray(payment.cancellations)
      ||payment.cancellations.length!==1)return null;
    const candidate:unknown=payment.cancellations[0];
    if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))return null;
    const cancellation=candidate as Record<string,unknown>;
    if(cancellation.status!=='SUCCEEDED'
      ||cancellation.totalAmount!==input.originalAmountMinor
      ||typeof cancellation.id!=='string'
      ||!providerId.test(cancellation.id))return null;
    return cancellation.id;
  }catch{
    return null;
  }finally{
    if(timer!==undefined)clearTimeout(timer);
  }
}
