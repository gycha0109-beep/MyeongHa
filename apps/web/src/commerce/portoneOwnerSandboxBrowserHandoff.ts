// Watchtower-Track: commerce-payment
// Browser-only PortOne V2 SDK handoff. There is NO public checkout route yet.
// This module consumes a server-owned immutable Purchase Intent/Attempt DTO.
// A browser SDK callback NEVER constitutes a verified payment or credit grant.
export const PORTONE_V2_OWNER_SANDBOX_BROWSER_HANDOFF_V1=Object.freeze({
  environment:'sandbox',
  paymentProvider:'portone_v2',
  requiresServerVerifiedReceipt:true,
  publicCheckoutEnabled:false,
  productionCheckoutEnabled:false,
  sandboxCreditMintEnabled:false,
} as const);

export interface PortOneCardPaymentRequestV2 {
  readonly storeId:string;
  readonly channelKey:string;
  readonly paymentId:string;
  readonly orderName:'명하 채팅 크레딧 300개';
  readonly totalAmount:1900;
  readonly currency:'CURRENCY_KRW';
  readonly payMethod:'CARD';
  readonly products:readonly [Readonly<{
    id:'myeongha-chat-credits-300-v1';name:'명하 채팅 크레딧 300개';amount:1900;quantity:1;
  }>];
}

export interface PortOneBrowserSdkV2 {
  requestPayment(request:PortOneCardPaymentRequestV2):Promise<unknown>;
}

export interface PortOneOwnerSandboxBrowserHandoffV1 {
  readonly paymentAttemptId:string;
  readonly environment:'sandbox';
  readonly checkout:PortOneCardPaymentRequestV2;
}

export type PortOneBrowserHandoffOutcomeV1 =
  | Readonly<{kind:'verification_required';paymentAttemptId:string}>
  | Readonly<{kind:'sdk_result_untrusted';paymentAttemptId:string}>;

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const STORE=/^store-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const CHANNEL=/^channel-key-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const PAYMENT=/^[A-Za-z0-9_-]{6,40}$/u;
const FIELDS=new Set(['storeId','channelKey','paymentId','orderName','totalAmount','currency','payMethod','products']);

function deny():never{
  throw new Error('PortOne V2 sandbox checkout request unavailable.');
}
function asRecord(value:unknown):Record<string,unknown>{
  if(value===null||typeof value!=='object'||Array.isArray(value))return deny();
  const proto=Object.getPrototypeOf(value) as unknown;
  if(proto!==Object.prototype&&proto!==null)return deny();
  return value as Record<string,unknown>;
}
function parseServerCheckout(value:unknown):PortOneCardPaymentRequestV2{
  const x=asRecord(value);
  if(Reflect.ownKeys(x).length!==FIELDS.size||
     !Reflect.ownKeys(x).every(k=>typeof k==='string'&&FIELDS.has(k))||
     typeof x.storeId!=='string'||!STORE.test(x.storeId)||
     typeof x.channelKey!=='string'||!CHANNEL.test(x.channelKey)||
     typeof x.paymentId!=='string'||!PAYMENT.test(x.paymentId)||
     x.orderName!=='명하 채팅 크레딧 300개'||
     x.totalAmount!==1900||x.currency!=='CURRENCY_KRW'||
     x.payMethod!=='CARD'||!Array.isArray(x.products)||x.products.length!==1)return deny();
  const product=asRecord(x.products[0]);
  if(Reflect.ownKeys(product).length!==4||
     !['id','name','amount','quantity'].every(k=>Object.hasOwn(product,k))||
     product.id!=='myeongha-chat-credits-300-v1'||
     product.name!=='명하 채팅 크레딧 300개'||
     product.amount!==1900||product.quantity!==1)return deny();
  return Object.freeze({
    storeId:x.storeId,
    channelKey:x.channelKey,
    paymentId:x.paymentId,
    orderName:'명하 채팅 크레딧 300개',
    totalAmount:1900,currency:'CURRENCY_KRW',payMethod:'CARD',
    products:Object.freeze([Object.freeze({
      id:'myeongha-chat-credits-300-v1',name:'명하 채팅 크레딧 300개',
      amount:1900,quantity:1,
    })]) as PortOneCardPaymentRequestV2['products'],
  });
}
function parseServerEnvelope(value:unknown):PortOneOwnerSandboxBrowserHandoffV1{
  const x=asRecord(value);
  if(Reflect.ownKeys(x).length!==3||
     !['paymentAttemptId','environment','checkout'].every(k=>Object.hasOwn(x,k))||
     typeof x.paymentAttemptId!=='string'||!UUID.test(x.paymentAttemptId)||
     x.environment!=='sandbox')return deny();
  return Object.freeze({
    paymentAttemptId:x.paymentAttemptId.toLowerCase(),
    environment:'sandbox',
    checkout:parseServerCheckout(x.checkout),
  });
}

/**
 * Call ONLY in the browser after a trusted same-origin server has returned the
 * DB-approved Owner Admin's sandbox checkout handoff.
 *
 * Never trust SDK response.paymentId/code/message or any redirect query as
 * paid evidence. A successful-looking callback merely means the server may
 * now verify the ORIGINAL paymentAttemptId against PortOne itself.
 */
export async function requestPortOneOwnerSandboxBrowserHandoffV1(
  serverEnvelope:unknown,
  sdk:PortOneBrowserSdkV2,
):Promise<PortOneBrowserHandoffOutcomeV1>{
  const data=parseServerEnvelope(serverEnvelope);
  if(!sdk||typeof sdk.requestPayment!=='function')return deny();
  const response=await sdk.requestPayment(data.checkout);
  // SDK can report a failure/cancellation via code. It is NOT authoritative
  // for success, and must never unlock Production/credit capabilities.
  if(response!==null&&typeof response==='object'&&
     Object.hasOwn(response,'code')&&
     typeof (response as {code?:unknown}).code==='string'){
    return Object.freeze({kind:'sdk_result_untrusted',paymentAttemptId:data.paymentAttemptId});
  }
  return Object.freeze({kind:'verification_required',paymentAttemptId:data.paymentAttemptId});
}
