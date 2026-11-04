import { describe, expect, it, vi } from 'vitest';
import { handleChatReadRequestV1 } from './chat-read-http.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
const SUBJECT='22222222-2222-4222-8222-222222222222';
const THREAD='33333333-3333-4333-8333-333333333333';
const AUTH='11111111-1111-4111-8111-111111111111';
const rows=[{
  messageId:'77777777-7777-4777-8777-777777777777',
  sequenceNo:2,senderType:'character',characterId:'seyeon',
  bodyText:'An authorized historical reply',messagePayloadJsonb:null,
  messageSchemaVersion:'v1',createdAt:new Date('2026-11-03T06:40:00Z'),
  redacted:false,redactedAt:null,turnState:null,
}];
function fixture(opts:{authenticated?:boolean;installed?:boolean;denied?:boolean;characterId?:string}={}) {
  const calls:string[]=[];
  const verifier:IdentityEvidenceVerificationPortV1={
    verifyRequestIdentity:vi.fn(async()=>opts.authenticated===false
      ?null:{kind:'member' as const,verifiedAuthUserId:AUTH}),
  };
  const pool:PostgresSubjectPoolV1={
    async connect(){
      return {
        async query<Row=Record<string,unknown>>(sql:string){
          calls.push(sql);
          if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SET LOCAL ROLE')||
             sql.includes('assert_myeongha_subject_context_v1'))return {rows:[]};
          if(sql.includes('begin_member_subject_context_v1'))return {rows:[{subjectId:SUBJECT,subjectKind:'member'} as Row]};
          if(sql.includes('qry_chat_thread_runtime_binding_v1')){
            if(opts.denied)throw Object.assign(new Error('other owner private body'),{constraint:'thread_unavailable'});
            return {rows:[{
              threadId:THREAD,status:'active',
              activeContentReleaseId:'55555555-5555-4555-8555-555555555555',
              activeContentBundleId:'66666666-6666-4666-8666-666666666666',
              contentRevision:1,participantCharacterIds:[opts.characterId??'seyeon'],
            } as Row]};
          }
          if(sql.includes('to_regprocedure'))return {rows:[{installed:opts.installed!==false} as Row]};
          if(sql.includes('qry_chat_thread_owner_visible_history_v1'))return {rows:rows.map(x=>({
            ...x,characterId:opts.characterId??'seyeon',
          })) as Row[]};
          if(sql.includes('qry_character_relationship_v1'))return {rows:[]};
          throw Error('Unexpected query: '+sql);
        },
        release:vi.fn(),
      };
    },
  };
  return {
    input:{
      request:new Request(`https://myeongha.test/api/chat/${THREAD}?afterSequenceNo=0`),
      requestId:'owner-read-test',serverTime:'2026-11-03T00:00:00Z',
      identityEvidenceVerifier:verifier,pool,
    },calls,
  };
}
describe('Common Chat historical owner/current-rights read',()=>{
  it.each(['seyeon','yeoul','baekheon'])(
    'returns owner-authorized transcript for %s with no public response cache',async(characterId)=>{
      const {input,calls}=fixture({characterId});
      const response=await handleChatReadRequestV1(input);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const result=(await response.json()).data;
      expect(result.messages).toMatchObject([{bodyText:'An authorized historical reply',characterId}]);
      expect(result.historyWithheld).toBeUndefined();
      expect(calls.some(c=>c.includes('qry_chat_thread_owner_visible_history_v1'))).toBe(true);
      expect(calls.some(c=>c.includes('qry_chat_thread_stream_v2'))).toBe(false);
    },
  );
  it('fails closed when source authority is missing instead of silently clearing history',async()=>{
    const {input,calls}=fixture({installed:false});
    const response=await handleChatReadRequestV1(input);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('CHAT_HISTORY_AUTHORITY_UNAVAILABLE');
    expect(calls.some(c=>c.includes('from public.qry_chat_thread_owner_visible_history_v1'))).toBe(false);
  });
  it('requires login and never touches SQL for unauthenticated requests',async()=>{
    const {input,calls}=fixture({authenticated:false});
    const response=await handleChatReadRequestV1(input);
    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
  });
  it('denies another owner before reading a single historical body',async()=>{
    const {input,calls}=fixture({denied:true});
    const response=await handleChatReadRequestV1(input);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('other owner private body');
    expect(calls.some(c=>c.includes('from public.qry_chat_thread_owner_visible_history_v1'))).toBe(false);
  });
});
