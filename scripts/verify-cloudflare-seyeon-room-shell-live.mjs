// Watchtower-Track: security
// Controlled production Member E2E. No token, member ID, message, thread ID,
// credentials, request body, source text or response JSON is ever logged.
import {acquireProductionMemberSmokeSession} from './production-member-smoke-session.mjs';

const ORIGIN='https://myeongha.gycha0109.workers.dev';
const EXPECTED=process.env.CLOUDFLARE_EXPECTED_WORKER_VERSION;
const SUBJECT=process.env.MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function check(value,message){if(!value)throw Error(message);}
function noStore(res){
  check((res.headers.get('cache-control')||'').toLowerCase().includes('no-store'),
    'NO_STORE_MISSING');
}
function version(res){
  check(res.headers.get('x-myeongha-worker-version')===EXPECTED,
    'WORKER_VERSION_CHANGED');
}
function jsonRecord(value){
  check(value!==null&&typeof value==='object'&&!Array.isArray(value),
    'INVALID_ENVELOPE');
  return value;
}
async function call(path,token,options={}){
  check(path.startsWith('/')&&!path.startsWith('//'),'INVALID_PATH');
  const res=await fetch(ORIGIN+path,{
    method:options.method||'GET',
    redirect:'error',
    cache:'no-store',
    signal:AbortSignal.timeout(20_000),
    headers:{
      Accept:'application/json',
      ...(token?{Authorization:'Bearer '+token}:{}),
      ...(options.method==='POST'?{
        Origin:ORIGIN,'Content-Type':'application/json',
      }:{}),
    },
    ...(options.method==='POST'?{body:JSON.stringify(options.body)}:{}),
  });
  version(res);noStore(res);
  check(!res.headers.has('set-cookie'),'UNEXPECTED_COOKIE');
  const raw=await res.text();
  check(raw.length<=16384,'OVERSIZE_RESPONSE');
  let body;
  try{body=JSON.parse(raw)}catch{throw Error('NON_JSON_RESPONSE')}
  return {status:res.status,body:jsonRecord(body)};
}
check(typeof EXPECTED==='string'&&UUID.test(EXPECTED),'WORKER_VERSION_REQUIRED');
check(typeof SUBJECT==='string'&&UUID.test(SUBJECT),'TEST_SUBJECT_REQUIRED');
const health=await call('/api/health');
check(health.status===200&&health.body.status==='ok','HEALTH_FAILED');
const session=await acquireProductionMemberSmokeSession({
  origin:ORIGIN,expectedCloudflareVersion:EXPECTED,
});
const token=session.accessToken;
const me=await call('/api/me',token);
check(me.status===200&&me.body.ok===true&&
  me.body.data?.subjectId===SUBJECT&&me.body.data?.subjectKind==='member',
  'MEMBER_OWNERSHIP_FAILED');
const opened=await call('/api/chat',token,{
  method:'POST',body:{characterId:'seyeon'},
});
check(opened.status===200&&opened.body.ok===true&&
  opened.body.data?.characterId==='seyeon','CHAT_OPEN_FAILED');
const threadId=opened.body.data?.threadId;
check(typeof threadId==='string'&&UUID.test(threadId),'CHAT_THREAD_INVALID');
const read=await call('/api/chat/'+threadId+'?afterSequenceNo=0',token);
check(read.status===200&&read.body.ok===true,'OWNER_ROOM_SHELL_FAILED');
const room=jsonRecord(read.body.data);
check(room.threadId===threadId&&room.characterId==='seyeon',
  'ROOM_BINDING_CHANGED');
check(room.afterSequenceNo===0&&room.lastSequenceNo===0&&
  Array.isArray(room.messages)&&room.messages.length===0&&
  typeof room.historyWithheld==='boolean'&&
  room.pagination?.hasMore===false&&
  room.pagination?.nextAfterSequenceNo===null,
  'ROOM_HISTORY_NOT_WITHHELD');
check(room.latestCharacterMessage===null&&room.relationship===null,
  'ROOM_PRIVATE_STATE_EXPOSED');
check(Object.keys(room).sort().join(',')===
  ['threadId','characterId','afterSequenceNo','lastSequenceNo',
   'messages','historyWithheld','pagination','latestCharacterMessage',
   'relationship'].sort().join(','),'ROOM_UNAPPROVED_FIELDS');
check(!JSON.stringify(read.body).includes(SUBJECT),'SUBJECT_DISCLOSED');
const paged=await call('/api/chat/'+threadId+'?afterSequenceNo=1',token);
check(paged.status===503&&paged.body.ok===false,
  'HISTORY_PAGINATION_UNEXPECTEDLY_OPEN');
const anon=await call('/api/chat/'+threadId+'?afterSequenceNo=0');
check(anon.status!==200&&anon.body.ok===false,
  'ANONYMOUS_ROOM_OPEN');

// The S0 read-only lifecycle authority is installed independently from the
// model source and from Receipt. Discover only one owned current Memory through
// the existing Member Records API; never log its identity or content.
const memories=await call('/api/memories?pageSize=1',token);
check(memories.status===200&&memories.body.ok===true,'MEMBER_MEMORIES_READ_FAILED');
const ownerMemories=jsonRecord(memories.body.data).memories;
check(Array.isArray(ownerMemories)&&ownerMemories.length===1,
  'NO_OWNED_CURRENT_MEMORY_FOR_GRANT_CHECK');
const ownedMemory=jsonRecord(ownerMemories[0]);
// A current Memory is not necessarily the one approved for S0 model input.
// Do not call an unrelated personal record a Se-yeon source verification.
check(ownedMemory.memoryType==='conversation_recall'&&
  ownedMemory.schemaVersion==='v1','S0_ORIGINAL_SOURCE_TYPE_MISMATCH');
check(typeof ownedMemory.memoryItemId==='string'&&UUID.test(ownedMemory.memoryItemId),
  'OWNER_MEMORY_ID_INVALID');
const grantPath='/api/memories/'+ownedMemory.memoryItemId+'/grants/seyeon';
const grant=await call(grantPath,token);
check(grant.status===200&&grant.body.ok===true,'OWNER_GRANT_STATUS_NOT_AVAILABLE');
const state=jsonRecord(grant.body.data);
check(Object.keys(state).sort().join(',')===
  ['memoryItemId','characterId','currentlyGranted','grantedAt','grantState'].sort().join(','),
  'GRANT_STATUS_UNAPPROVED_FIELDS');
check(state.memoryItemId===ownedMemory.memoryItemId&&state.characterId==='seyeon',
  'OWNER_GRANT_STATUS_MISMATCH');
check(['active','withdrawal_pending','not_granted'].includes(state.grantState),
  'OWNER_GRANT_LIFECYCLE_UNVERIFIED');
check(state.currentlyGranted===(state.grantState==='active'),
  'OWNER_GRANT_CURRENT_USE_MISMATCH');
check(state.grantState==='active'
  ? typeof state.grantedAt==='string'&&Number.isFinite(Date.parse(state.grantedAt))
  : state.grantedAt===null,
  'OWNER_GRANT_TIMESTAMP_MISMATCH');
check(!JSON.stringify(grant.body).includes(token),'OWNER_GRANT_REFLECTED_TOKEN');
const anonymousGrant=await call(grantPath);
check(anonymousGrant.status===401&&anonymousGrant.body.ok===false&&
  anonymousGrant.body.error?.code==='AUTH_REQUIRED',
  'ANONYMOUS_GRANT_STATUS_NOT_DENIED');

console.log('SEYEON_OWNER_ROOM_SHELL_E2E_PASS; historyWithheld='+
  String(room.historyWithheld)+
  '; historyPageHeld=true; anonymousDenied=true; modelNotCalled=true'+
  '; ownerGrantLifecycleVerified=true; anonymousGrantDenied=true; sourceContentLogged=false');
