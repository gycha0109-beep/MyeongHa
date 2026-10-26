// @ts-ignore Runtime JS session adapter: root and web TS projects resolve it differently.
import {getActiveBearer} from '../../product-auth.js';

export interface CreditWalletViewV1 {
  readonly availableCredits:number;
  readonly totalCredits:number;
  readonly requiredCredits:10;
  readonly operatorFreeChat:boolean;
  readonly operatorSandboxCheckout:boolean;
}
function validCredits(value:unknown):value is number {
  return Number.isSafeInteger(value)&&typeof value==='number'&&value>=0;
}
export async function readMemberCreditWalletV1(
  fetchImpl:typeof fetch=fetch,
):Promise<CreditWalletViewV1> {
  const session=await getActiveBearer();
  if(session?.kind!=='member'||!session.token) throw Error('MEMBER_REQUIRED');
  const response=await fetchImpl('/api/me/credits',{
    method:'GET',cache:'no-store',credentials:'same-origin',
    headers:{Accept:'application/json',Authorization:'Bearer '+session.token},
  });
  if(!response.ok) throw Error('CREDIT_WALLET_UNAVAILABLE');
  const payload:unknown=await response.json();
  if(!payload||typeof payload!=='object'||!('ok' in payload)||
      payload.ok!==true||!('data' in payload)) throw Error('INVALID_CREDIT_WALLET');
  const data=payload.data;
  if(!data||typeof data!=='object'||!('availableCredits' in data)||
      !('totalCredits' in data)||!('requiredCredits' in data)||
      !('operatorFreeChat' in data)||!('operatorSandboxCheckout' in data)||
      !validCredits(data.availableCredits)||!validCredits(data.totalCredits)||
      data.requiredCredits!==10||typeof data.operatorFreeChat!=='boolean'||
      typeof data.operatorSandboxCheckout!=='boolean') {
    throw Error('INVALID_CREDIT_WALLET');
  }
  return Object.freeze({
    availableCredits:data.availableCredits,
    totalCredits:data.totalCredits,
    requiredCredits:10,
    operatorFreeChat:data.operatorFreeChat,
    operatorSandboxCheckout:data.operatorSandboxCheckout,
  });
}
