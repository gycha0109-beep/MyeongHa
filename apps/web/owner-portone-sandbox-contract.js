// Watchtower-Track: commerce-payment
// Browser guards are defense in depth only. The server owns all payment
// authority and verifies the PSP independently; browser callbacks mint nothing.
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const KCP_ID=/^mha_pa_[a-f0-9]{32}$/u;
const STORE=/^store-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const CHANNEL=/^channel-key-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const PRODUCT='myeongha-chat-credits-300-v1';
const NAME='명하 채팅 크레딧 300개';

export function requireOwnerSandboxWalletV1(envelope){
 if(!envelope||envelope.ok!==true||!envelope.data||
   envelope.data.isOwnerAdmin!==true||envelope.data.creditExempt!==true)
  throw Error('Owner-only sandbox access unavailable');
 return true;
}
export function requireOwnerSandboxPreparedV1(envelope){
 const x=envelope?.data;
 if(envelope?.ok!==true||!x||x.environment!=='sandbox'||
   typeof x.paymentAttemptId!=='string'||!UUID.test(x.paymentAttemptId)||
   typeof x.purchaseIntentId!=='string'||!UUID.test(x.purchaseIntentId)||
   typeof x.providerRequestId!=='string'||!KCP_ID.test(x.providerRequestId)||
   x.status!=='created'||typeof x.replayed!=='boolean'||
   x.productionCreditsIssued!==false)throw Error('Invalid server-owned sandbox preparation');
 return Object.freeze({paymentAttemptId:x.paymentAttemptId.toLowerCase()});
}
export function requireOwnerSandboxCheckoutV1(envelope,attemptId){
 const x=envelope?.data;
 const p=x?.checkout;
 if(envelope?.ok!==true||!x||x.environment!=='sandbox'||
   x.paymentAttemptId!==attemptId||
   !p||typeof p.storeId!=='string'||!STORE.test(p.storeId)||
   typeof p.channelKey!=='string'||!CHANNEL.test(p.channelKey)||
   typeof p.paymentId!=='string'||!KCP_ID.test(p.paymentId)||
   p.totalAmount!==1900||p.currency!=='CURRENCY_KRW'||
   p.payMethod!=='CARD'||p.orderName!==NAME||
   !Array.isArray(p.products)||p.products.length!==1||
   p.products[0]?.id!==PRODUCT||p.products[0]?.name!==NAME||
   p.products[0]?.amount!==1900||p.products[0]?.quantity!==1)
   throw Error('Server checkout context is not canonical');
 const keys=Object.keys(p);
 if(keys.length!==8||keys.some(k=>!['storeId','channelKey','paymentId','orderName','totalAmount','currency','payMethod','products'].includes(k)))
   throw Error('Unexpected server checkout fields');
 if(Object.keys(p.products[0]).length!==4)throw Error('Unexpected server product fields');
 return Object.freeze({
   storeId:p.storeId,channelKey:p.channelKey,paymentId:p.paymentId,
   orderName:NAME,totalAmount:1900,currency:'CURRENCY_KRW',
   payMethod:'CARD',products:[{id:PRODUCT,name:NAME,amount:1900,quantity:1}],
 });
}
export function requireOwnerSandboxServerPaidV1(envelope,attemptId){
 const x=envelope?.data;
 if(envelope?.ok!==true||!x||x.paymentAttemptId!==attemptId||
    x.environment!=='sandbox'||x.providerVerifiedPaid!==true||
    x.receiptPersisted!==false||x.productionCreditsIssued!==false)
    throw Error('PortOne server has not confirmed this sandbox payment');
 return Object.freeze({verified:true,receiptPersisted:false,productionCreditsIssued:false});
}
