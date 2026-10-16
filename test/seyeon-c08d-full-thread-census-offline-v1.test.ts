import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {assembleSeyeonRuntimeContextV2} from
 '../packages/domain/src/seyeon-runtime-context-v2.js';
import {
 createSeyeonFastDialogueShadowV1,
 SEYEON_FIRST_TURN_CENSUS_SHADOW_VERSION_V1,
 type SeyeonFullThreadCensusShadowPortV1,
} from '../apps/api/src/seyeon-fast-dialogue-shadow-v1.js';

const current={messageId:'user-turn-current',role:'user' as const,text:'안녕, 세연아.'};
const valid={
 schemaVersion:SEYEON_FIRST_TURN_CENSUS_SHADOW_VERSION_V1,
 subjectId:'subject-123',threadId:'thread-123',
 currentUserMessageId:current.messageId,
 messageCount:1,latestSenderType:'user',complete:true,
};
function context(){
 return assembleSeyeonRuntimeContextV2({
  relationship:null,recentMessages:[current],
  retrievedMemories:[],integrityDecisions:[],
  governedPreflightApplied:true,
  disclosure:{decision:null,retrievedSources:[]},
 });
}
function scenario(answer:unknown=valid,withoutPort=false){
 const read=vi.fn(async()=>answer);
 const candidate=vi.fn(async(_request:unknown)=>{throw Error('SYNTHETIC_COMBINED_STAGE_REACHED');});
 const reviewer=vi.fn(async()=>{throw Error('SYNTHETIC_REVIEWER_SHOULD_NOT_RUN');});
 const port:SeyeonFullThreadCensusShadowPortV1={
  subjectId:'subject-123',threadId:'thread-123',
  readFullThreadCensus:read,
 };
 const shadow=createSeyeonFastDialogueShadowV1({
  candidateProvider:{providerKey:'fixture',modelKey:'fixture',generate:candidate},
  reviewerProvider:{providerKey:'fixture',modelKey:'fixture',generate:reviewer},
  ...(withoutPort?{}:{fullThreadCensus:port}),
 });
 return {read,candidate,reviewer,shadow,port};
}

describe('C08-D full-thread census Shadow admission: bounded recent context is not proof',()=>{
 it('fails closed without an authoritative full-thread census port, even with one clean recent message',async()=>{
  const h=scenario(valid,true);
  await expect(h.shadow.evaluate(context())).rejects.toMatchObject({
   code:'FAST_THREAD_CENSUS_REJECTED',
  });
  expect(h.read).not.toHaveBeenCalled();
  expect(h.candidate).not.toHaveBeenCalled();
  expect(h.reviewer).not.toHaveBeenCalled();
 });

 it('rejects a truncated recent window if the authoritative full thread contains earlier turns',async()=>{
  for(const total of [0,2,3,1000]){
   const h=scenario({...valid,messageCount:total});
   await expect(h.shadow.evaluate(context())).rejects.toMatchObject({
    code:'FAST_THREAD_CENSUS_REJECTED',
   });
   expect(h.read).toHaveBeenCalledExactlyOnceWith({
    subjectId:valid.subjectId,threadId:valid.threadId,
    currentUserMessageId:current.messageId,
   });
   expect(h.candidate).not.toHaveBeenCalled();
   expect(h.reviewer).not.toHaveBeenCalled();
  }
 });

 it('rejects all missing, stale, cross-subject/thread and invented census claims before AI',async()=>{
  const cases:unknown[]=[
   null,{},[],{...valid,complete:false},
   {...valid,complete:undefined},
   {...valid,latestSenderType:'character'},
   {...valid,latestSenderType:'assistant'},
   {...valid,currentUserMessageId:'another-turn'},
   {...valid,subjectId:'some-other-subject'},
   {...valid,threadId:'some-other-thread'},
   {...valid,messageCount:'1'},
   {...valid,messageCount:1.5},
   {...valid,schemaVersion:'model-invented-authority'},
   {...valid,mayReveal:true},
  ];
  for(const item of cases){
   const h=scenario(item);
   await expect(h.shadow.evaluate(context())).rejects.toMatchObject({
    code:'FAST_THREAD_CENSUS_REJECTED',
   });
   expect(h.candidate).not.toHaveBeenCalled();
   expect(h.reviewer).not.toHaveBeenCalled();
  }
 });

 it('hides storage error text and never retries the census read automatically',async()=>{
  const h=scenario();
  h.read.mockImplementationOnce(async()=>{
   throw Error('synthetic-private-row-and-secret-must-not-appear');
  });
  const failure=await h.shadow.evaluate(context()).then(
   ()=>null,(error:unknown)=>error,
  );
  expect(failure).toMatchObject({code:'FAST_THREAD_CENSUS_REJECTED'});
  expect(String(failure)).not.toContain('synthetic-private-row');
  expect(h.read).toHaveBeenCalledOnce();
  expect(h.candidate).not.toHaveBeenCalled();
  expect(h.reviewer).not.toHaveBeenCalled();
 });

 it('valid, exactly matched full-thread evidence allows only the combined offline Shadow stage',async()=>{
  const h=scenario();
  await expect(h.shadow.evaluate(context())).rejects.toThrow(
   'SYNTHETIC_COMBINED_STAGE_REACHED',
  );
  expect(h.read).toHaveBeenCalledOnce();
  expect(h.candidate).toHaveBeenCalledOnce();
  expect(h.candidate.mock.calls[0]?.[0]).toMatchObject({
   purpose:'turn_interpret_render_shadow',
  });
  expect(h.reviewer).not.toHaveBeenCalled();
 });

 it('does not activate Production or assert DB transaction/snapshot authority',()=>{
  const runtime=readFileSync(new URL(
   '../apps/api/src/production-seyeon-chat-runtime-v1.ts',import.meta.url),'utf8');
  const candidate=readFileSync(new URL(
   '../apps/api/src/seyeon-fast-dialogue-shadow-v1.ts',import.meta.url),'utf8');
  expect(runtime).not.toContain('createSeyeonFastDialogueShadowV1');
  expect(runtime).not.toContain('SeyeonFullThreadCensusShadowPortV1');
  expect(candidate).not.toContain('process.env.'+'OPENAI_API_KEY');
  expect(candidate).not.toContain('fetch'+'(');
 });
});
