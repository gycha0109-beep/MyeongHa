// Watchtower-Track: commerce-payment
// Dedicated Owner Admin TEST only. Never accept client PSP payment success
// as evidence and never execute a Production credit grant in the browser.
import {getActiveBearer} from './product-auth.js';
import {
 requireOwnerSandboxWalletV1,requireOwnerSandboxPreparedV1,
 requireOwnerSandboxCheckoutV1,requireOwnerSandboxServerPaidV1,
} from './owner-portone-sandbox-contract.js';

const STATUS=document.getElementById('owner-test-status');
const PAY=document.getElementById('owner-test-pay');
const VERIFY=document.getElementById('owner-test-verify');
const ATTEMPT=document.getElementById('owner-test-attempt');
const PROVIDER=document.getElementById('owner-test-provider');
const RETRY_KEY='myeongha.ownerKcpSandboxRetry.v1';
const ATTEMPT_KEY='myeongha.ownerKcpSandboxAttempt.v1';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
let allowed=false;
let busy=false;
let attemptId=null;
let retryToken=null;
let scriptPromise=null;

function status(message){STATUS.textContent=message;}
function setBusy(value){
 busy=value;
 PAY.disabled=!allowed||busy;
 VERIFY.disabled=!allowed||busy||!attemptId;
}
async function memberBearer(){
 const bearer=await getActiveBearer();
 if(!bearer||bearer.kind!=='member'||typeof bearer.token!=='string')
  throw Error('관리자 계정으로 다시 로그인해 주세요.');
 return bearer.token;
}
async function serverRequest(path,body=null){
 const bearer=await memberBearer();
 const response=await fetch(path,{
  method:body===null?'GET':'POST',
  headers:{
   Accept:'application/json',
   Authorization:`Bearer ${bearer}`,
   ...(body===null?{}:{'Content-Type':'application/json'}),
  },
  ...(body===null?{}:{body:JSON.stringify(body)}),
  credentials:'same-origin',
  cache:'no-store',
  redirect:'error',
 });
 if(!response.ok)throw Error('서버에서 해당 관리자 테스트 요청을 허용하지 않았습니다.');
 const envelope=await response.json();
 if(!envelope||typeof envelope!=='object'||envelope.ok!==true)
  throw Error('서버 테스트 결과를 확인할 수 없습니다.');
 return envelope;
}
function createRetryToken(){
 const b=new Uint8Array(16);
 crypto.getRandomValues(b);
 return Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
}
function obtainRetryToken(){
 if(retryToken)return retryToken;
 const existing=sessionStorage.getItem(RETRY_KEY);
 retryToken=/^[a-f0-9]{32}$/u.test(existing??'')?existing:createRetryToken();
 sessionStorage.setItem(RETRY_KEY,retryToken);
 return retryToken;
}
function releaseRetryToken(){
 retryToken=null;
 sessionStorage.removeItem(RETRY_KEY);
}
function displayAttempt(id){
 attemptId=id;
 sessionStorage.setItem(ATTEMPT_KEY,id);
 ATTEMPT.textContent=id;
 VERIFY.disabled=!allowed||busy;
}
function loadPortOneSdk(){
 if(window.PortOne&&typeof window.PortOne.requestPayment==='function')
  return Promise.resolve(window.PortOne);
 if(scriptPromise)return scriptPromise;
 scriptPromise=new Promise((resolve,reject)=>{
  const el=document.createElement('script');
  el.src='https://cdn.portone.io/v2/browser-sdk.js';
  el.async=true;
  el.crossOrigin='anonymous';
  el.onload=()=>{
   if(window.PortOne&&typeof window.PortOne.requestPayment==='function')
    resolve(window.PortOne);
   else reject(Error('포트원 V2 SDK가 준비되지 않았습니다.'));
  };
  el.onerror=()=>reject(Error('포트원 V2 SDK를 불러오지 못했습니다.'));
  document.head.appendChild(el);
 }).catch(e=>{scriptPromise=null;throw e;});
 return scriptPromise;
}
async function verifyWithServer(id){
 status('포트원 서버에서 결제 상태 확인 중…');
 const result=await serverRequest('/api/me/credits/portone/test-verify',{
  paymentAttemptId:id,
 });
 requireOwnerSandboxServerPaidV1(result,id);
 PROVIDER.textContent='포트원 서버 PAID 확인 (읽기 전용)';
 status('테스트 결제 PAID 확인. 영수증 저장 및 운영 크레딧 지급은 수행되지 않았습니다.');
 // A finished attempt cannot be charged again. The next user click must
 // create a new payment request identity, never replay a PAID paymentId.
 releaseRetryToken();
}
async function beginTest(){
 if(!allowed||busy)return;
 setBusy(true);
 try{
  status('관리자 전용 구매 의도 생성 중…');
  const prep=await serverRequest('/api/me/credits/portone/test-prepare',{
   idempotencyToken:obtainRetryToken(),
  });
  const prepared=requireOwnerSandboxPreparedV1(prep);
  displayAttempt(prepared.paymentAttemptId);
  status('서버 발급 결제정보를 확인 중…');
  const handoff=await serverRequest('/api/me/credits/portone/test-checkout',{
   paymentAttemptId:prepared.paymentAttemptId,
  });
  const checkout=requireOwnerSandboxCheckoutV1(handoff,prepared.paymentAttemptId);
  const sdk=await loadPortOneSdk();
  status('KCP 테스트 결제창을 진행해 주세요…');
  // The payment callback is an untrusted hint. Never inspect its paymentId
  // or treat it as a Receipt. Verification uses our original DB-owned UUID.
  const hint=await sdk.requestPayment(checkout);
  if(hint&&typeof hint==='object'&&typeof hint.code==='string'){
   PROVIDER.textContent='브라우저 결제창 취소 또는 실패';
   status('결제창이 완료되지 않았습니다. 새 테스트 결제 요청으로 재시도할 수 있습니다.');
   releaseRetryToken();
   return;
  }
  await verifyWithServer(prepared.paymentAttemptId);
 }catch{
  status('테스트 결제 또는 서버 검증을 완료하지 못했습니다. 새 결제를 요청하기 전에 기존 결제 상태를 확인해 주세요.');
  if(attemptId)PROVIDER.textContent='서버 확인 필요';
 }finally{setBusy(false);}
}
async function checkExisting(){
 if(!allowed||busy||!attemptId)return;
 setBusy(true);
 try{await verifyWithServer(attemptId);}
 catch{
  PROVIDER.textContent='서버 PAID 확인 실패 또는 결제 미완료';
  status('포트원 서버에서 PAID 상태를 확인하지 못했습니다. 운영 크레딧은 지급되지 않습니다.');
 }finally{setBusy(false);}
}
async function initialize(){
 PAY.disabled=true;VERIFY.disabled=true;
 try{
  const data=await serverRequest('/api/me/credits');
  requireOwnerSandboxWalletV1(data);
  allowed=true;
  const stored=sessionStorage.getItem(ATTEMPT_KEY);
  if(typeof stored==='string'&&UUID.test(stored))displayAttempt(stored);
  status('관리자 권한 확인 완료. KCP 테스트 결제창을 열 수 있습니다.');
 }catch{
  allowed=false;
  status('관리자 권한을 확인할 수 없습니다. 명하에 로그인한 Owner Admin에게만 허용됩니다.');
 }finally{setBusy(false);}
}
PAY.addEventListener('click',()=>void beginTest());
VERIFY.addEventListener('click',()=>void checkExisting());
void initialize();
