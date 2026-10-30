import {describe,expect,it,vi} from 'vitest';
import {verifyProductionSeyeonG3HistoryHttpV1} from '../../scripts/verify-production-seyeon-g3-history-http.mjs';

const SUBJECT='92000000-0000-4000-8000-000000000001';
const THREAD='93000000-0000-4000-8000-000000000001';
const VERSION='f1234567-0000-4000-8000-000000000001';
const TOKEN='synthetic-t3st-token';
const env={
  DISPATCH_CONFIRM:'VERIFY_SEYEON_G3_HISTORY_HOLD',
  MYEONGHA_PRODUCTION_G3_HISTORY_THREAD_ID:THREAD,
  MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID:SUBJECT,
};
function fixture({
  historicStatus=503,
  historicError='SEYEON_HISTORY_REVEAL_HOLD',
  historicVersion=VERSION,
  memberSubject=SUBJECT,
  historyBodyCanary='',
  historyCache='no-store',
}={}){
  const calls: Array<{url:string;options:{
    method:string;headers:Record<string,string>;redirect:string;signal:AbortSignal;
  }}>=[];
  const acquireSession=vi.fn(async()=>({accessToken:TOKEN}));
  const fetchImpl=vi.fn(async(url:string,options:{
    method:string;headers:Record<string,string>;redirect:string;signal:AbortSignal;
  })=>{
    calls.push({url,options});
    const uri=new URL(url);
    const isAuthed=options.headers.Authorization===`Bearer ${TOKEN}`;
    let status,body,version=VERSION,cache='no-store';
    if(uri.pathname==='/api/me' && isAuthed){
      status=200;body={ok:true,data:{subjectId:memberSubject,subjectKind:'member',subjectStatus:'active'}};
    }else if(uri.pathname===`/api/chat/${THREAD}` && !isAuthed){
      status=401;body={ok:false,error:{code:'AUTH_REQUIRED',retryable:false}};
    }else if(uri.pathname===`/api/chat/${THREAD}` && isAuthed){
      status=historicStatus;body=historicStatus===503
        ?{ok:false,error:{code:historicError,retryable:false}}
        :{ok:true,data:{messages:[{bodyText:historyBodyCanary}]}};
      version=historicVersion;cache=historyCache;
    }else throw Error('Unexpected test request');
    return new Response(JSON.stringify(body),{
      status,headers:{
        'content-type':'application/json','cache-control':cache,
        'x-myeongha-worker-version':version,
      },
    });
  });
  return {calls,acquireSession,fetchImpl};
}

describe('governed production Se-yeon G3 historical HTTP proof',()=>{
  it('checks anonymous 401, verified Member 200 and historical 503 on one Worker version',async()=>{
    const f=fixture();
    const result=await verifyProductionSeyeonG3HistoryHttpV1({
      env,fetchImpl:f.fetchImpl,acquireSession:f.acquireSession,
    });
    expect(result).toMatchObject({
      anonymous:401,member:200,historicalGet:503,
      error:'SEYEON_HISTORY_REVEAL_HOLD',noStore:true,
      sameWorkerVersion:true,workerVersion:VERSION,disclosureAuthorized:false,
    });
    expect(f.calls).toHaveLength(3);
    expect(f.calls[0]?.url).toBe(
      `https://myeongha.gycha0109.workers.dev/api/chat/${THREAD}?afterSequenceNo=400&pageSize=1`);
    expect(f.calls[0]?.options.headers.Authorization).toBeUndefined();
    expect(f.calls.slice(1).map(c=>c.options.headers.Authorization))
      .toEqual([`Bearer ${TOKEN}`,`Bearer ${TOKEN}`]);
    expect(f.calls.every(c=>c.options.method==='GET' && c.options.redirect==='error'))
      .toBe(true);
  });

  it('refuses a missing governed historical Thread before any HTTP or Auth call',async()=>{
    const f=fixture();
    await expect(verifyProductionSeyeonG3HistoryHttpV1({
      env:{...env,MYEONGHA_PRODUCTION_G3_HISTORY_THREAD_ID:''},
      fetchImpl:f.fetchImpl,acquireSession:f.acquireSession,
    })).rejects.toThrow('Missing or invalid production owned history Thread');
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(f.acquireSession).not.toHaveBeenCalled();
  });

  it('rejects a 200 response without exposing any private transcript bytes',async()=>{
    const canary='THIS_PROTECTED_HISTORY_MUST_NOT_APPEAR_IN_ANY_ERROR';
    const f=fixture({historicStatus:200,historyBodyCanary:canary});
    let error;
    try{
      await verifyProductionSeyeonG3HistoryHttpV1({
        env,fetchImpl:f.fetchImpl,acquireSession:f.acquireSession,
      });
    }catch(e){error=e;}
    expect(error).toBeInstanceOf(Error);
    const message=error instanceof Error ? error.message : '';
    expect(message).toContain('expected HTTP 503');
    expect(message).not.toContain(canary);
    expect(f.calls).toHaveLength(3);
  });

  it('rejects Worker version drift, bad G3 error and cacheable history',async()=>{
    for(const overrides of [
      {historicVersion:'f1234567-0000-4000-8000-000000000002'},
      {historicError:'UNRELATED_ERROR'},
      {historyCache:'public,max-age=600'},
      {memberSubject:'92000000-0000-4000-8000-000000000002'},
    ]){
      const f=fixture(overrides);
      await expect(verifyProductionSeyeonG3HistoryHttpV1({
        env,fetchImpl:f.fetchImpl,acquireSession:f.acquireSession,
      })).rejects.toThrow();
    }
  });

  it('denies background or alternate dispatch modes without contacting Production',async()=>{
    const f=fixture();
    await expect(verifyProductionSeyeonG3HistoryHttpV1({
      env:{...env,DISPATCH_CONFIRM:'VERIFY_MEMBER_ME'},
      fetchImpl:f.fetchImpl,acquireSession:f.acquireSession,
    })).rejects.toThrow('explicit governed dispatch');
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(f.acquireSession).not.toHaveBeenCalled();
  });
});
