// Watchtower-Track: commerce-payment
// PortOne V2 browser request builder: input is an immutable server-issued
// Purchase Intent projection, NOT caller-controlled price/payment identity.
// The SDK result is ONLY a hint; server-side PortOne lookup must verify PAID
// before the separate Commerce credit wallet awards any credits.
export const CHAT_CREDIT_PORTONE_V2_OFFER_V1=Object.freeze({
  externalProductId:'myeongha-chat-credits-300-v1',
  amountMinor:1900,
  currency:'KRW',
  credits:300,
  paymentMethod:'CARD',
  paymentProductName:'명하 채팅 크레딧 300개',
});

export type PortOneCreditCheckoutModeV1='sandbox'|'production';
export interface ServerVerifiedCreditCheckoutV1 {
  readonly purchaseIntentId:string;
  readonly paymentId:string;
  readonly productOfferId:string;
  readonly externalProductId:string;
  readonly amountMinor:number;
  readonly currency:string;
  readonly quantityCredits:number;
  readonly environment:PortOneCreditCheckoutModeV1;
  readonly storeId:string;
  readonly channelKey:string;
  /** Materialized from server-verified DB Owner Admin, never from client. */
  readonly ownerAdminSandboxAllowed:boolean;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PROVIDER_ID=/^[a-zA-Z0-9_-]{6,128}$/u;
function requireTrustedCheckoutValue(value:string,label:string):string{
  if(typeof value!=='string'||value.length>128||!/^[a-zA-Z0-9_-]+$/u.test(value))
    throw Error('Untrusted PortOne '+label);
  return value;
}
export function buildPortOneChatCreditCheckoutV1(
  source:ServerVerifiedCreditCheckoutV1,
):Readonly<{
  storeId:string;
  channelKey:string;
  paymentId:string;
  orderName:string;
  totalAmount:1900;
  currency:'CURRENCY_KRW';
  payMethod:'CARD';
  products: readonly [Readonly<{
    id:'myeongha-chat-credits-300-v1';
    name:'명하 채팅 크레딧 300개';
    amount:1900;
    quantity:1;
  }>];
}> {
  if(!UUID.test(source.purchaseIntentId)||!UUID.test(source.productOfferId)||
      !PROVIDER_ID.test(source.paymentId)||
      (source.environment==='sandbox'&&source.paymentId.length>40)||
      source.externalProductId!==CHAT_CREDIT_PORTONE_V2_OFFER_V1.externalProductId||
      source.amountMinor!==CHAT_CREDIT_PORTONE_V2_OFFER_V1.amountMinor||
      source.currency!=='KRW'||
      source.quantityCredits!==CHAT_CREDIT_PORTONE_V2_OFFER_V1.credits||
      (source.environment!=='sandbox'&&source.environment!=='production')||
      (source.environment==='sandbox'&&!source.ownerAdminSandboxAllowed))
    throw Error('PortOne credit checkout authority unavailable');
  return Object.freeze({
    storeId:requireTrustedCheckoutValue(source.storeId,'storeId'),
    channelKey:requireTrustedCheckoutValue(source.channelKey,'channelKey'),
    paymentId:source.paymentId,
    orderName:CHAT_CREDIT_PORTONE_V2_OFFER_V1.paymentProductName,
    totalAmount:1900 as const,
    currency:'CURRENCY_KRW' as const,
    payMethod:'CARD' as const,
    products:Object.freeze([Object.freeze({
      id:CHAT_CREDIT_PORTONE_V2_OFFER_V1.externalProductId,
      name:CHAT_CREDIT_PORTONE_V2_OFFER_V1.paymentProductName,
      amount:1900 as const,quantity:1 as const,
    })]) as readonly [Readonly<{
      id:'myeongha-chat-credits-300-v1';
      name:'명하 채팅 크레딧 300개';
      amount:1900;quantity:1;
    }>],
  });
}
