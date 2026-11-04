import { describe, expect, it } from 'vitest';
import {
  CHAT_READ_HTTP_BINDING_V1, handleChatReadRequestV1,
} from '../apps/api/src/chat-read-http.js';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type {
  PostgresQueryResultV1, PostgresSubjectConnectionV1, PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const AUTH='91000000-0000-4000-8000-000000000001';
const SUBJECT='92000000-0000-4000-8000-000000000001';
const THREAD='93000000-0000-4000-8000-000000000001';
const RELEASE='94000000-0000-4000-8000-000000000001';
const BUNDLE='95000000-0000-4000-8000-000000000001';
const ID='96000000-0000-4000-8000-000000000001';

function visibleUser(sequenceNo=1) {
  return {
    messageId:ID,sequenceNo,senderType:'user',characterId:null,
    bodyText:'persisted user text',messagePayloadJsonb:null,messageSchemaVersion:'v1',
    createdAt:new Date('2026-11-03T00:00:00Z'),redacted:false,redactedAt:null,
    turnState:'failed_retryable',
  };
}
type QueryCall=Readonly<{text:string;values:readonly unknown[]}>;
class Connection implements PostgresSubjectConnectionV1 {
  calls:QueryCall[]=[];
  rows:readonly Record<string,unknown>[]=[visibleUser()];
  characterIds:readonly string[]=['seyeon'];
  installed=true;
  denied=false;
  async query<Row=Record<string,unknown>>(text:string,values:readonly unknown[]=[]):Promise<PostgresQueryResultV1<Row>> {
    this.calls.push({text,values});
    if(text==='BEGIN'||text==='COMMIT'||text==='ROLLBACK'||text.startsWith('SET LOCAL ROLE'))return {rows:[]};
    if(text.includes('begin_member_subject_context_v1'))return {rows:[{subjectId:SUBJECT,subjectKind:'member'} as Row]};
    if(text.includes('assert_myeongha_subject_context_v1'))return {rows:[]};
    if(text.includes('qry_chat_thread_runtime_binding_v1')) {
      if(this.denied)throw Object.assign(new Error('private other-owner evidence'),{constraint:'qry_chat_thread_runtime_binding_thread_unavailable'});
      return {rows:[{
        threadId:THREAD,status:'active',activeContentReleaseId:RELEASE,
        activeContentBundleId:BUNDLE,contentRevision:1,
        participantCharacterIds:this.characterIds,
      } as Row]};
    }
    if(text.includes("to_regprocedure("))return {rows:[{installed:this.installed} as Row]};
    if(text.includes('qry_chat_thread_owner_visible_history_v1'))return {rows:this.rows as readonly Row[]};
    if(text.includes('qry_character_relationship_v1'))return {rows:[]};
    throw Error('Unexpected Chat query: '+text.slice(0,100));
  }
  release():void {}
}
function fixture(url=`https://myeongha.test/api/chat/${THREAD}?afterSequenceNo=0`, authenticated=true) {
  const connection=new Connection();
  const verifier:IdentityEvidenceVerificationPortV1={
    verifyRequestIdentity:async()=>authenticated ? ({kind:'member' as const,verifiedAuthUserId:AUTH}) : null,
  };
  const pool:PostgresSubjectPoolV1={connect:()=>connection};
  const input={request:new Request(url),requestId:'req-chat-history',
    serverTime:'2026-11-03T00:00:00Z',identityEvidenceVerifier:verifier,pool};
  return {connection,input};
}
describe('shared owner-scoped historical Chat read',()=>{
  it('binds every character to a single currently authorized database history source',()=>{
    expect(CHAT_READ_HTTP_BINDING_V1).toMatchObject({
      method:'GET',route:'/api/chat/:threadId',
      streamAuthority:'public.qry_chat_thread_owner_visible_history_v1',
    });
  });
  it.each([{characters:['seyeon']},{characters:['yeoul']},{characters:['baekheon']},{characters:['seyeon','yeoul']}])(
    'restores owner-visible rows for character set $characters',async({characters})=>{
      const f=fixture();
      f.connection.characterIds=characters;
      const res=await handleChatReadRequestV1(f.input);
      expect(res.status).toBe(200);
      const data=(await res.json()).data;
      expect(data.messages).toMatchObject([{bodyText:'persisted user text',turnState:'failed_retryable'}]);
      expect(data.historyWithheld).toBeUndefined();
      const history=f.connection.calls.find(q=>q.text.includes('from public.qry_chat_thread_owner_visible_history_v1'));
      expect(history?.values).toEqual([SUBJECT,THREAD,0,50]);
      expect(f.connection.calls.some(q=>q.text.includes('from public.qry_chat_thread_stream_v2'))).toBe(false);
    },
  );
  it('keeps a truly empty room empty without inventing a historical message',async()=>{
    const f=fixture();f.connection.rows=[];
    const response=await handleChatReadRequestV1(f.input);
    expect(response.status).toBe(200);
    expect((await response.json()).data.messages).toEqual([]);
  });
  it('preserves server-redacted placeholders without exposing bodies or payloads',async()=>{
    const f=fixture();f.connection.rows=[{...visibleUser(),bodyText:null,redacted:true,
      redactedAt:new Date('2026-11-03T00:03:00Z'),messagePayloadJsonb:null}];
    const response=await handleChatReadRequestV1(f.input);
    expect(response.status).toBe(200);
    const body=await response.text();
    expect(JSON.parse(body).data.messages[0]).toMatchObject({bodyText:null,redacted:true});
    expect(body).not.toContain('private other-owner evidence');
  });
  it('refuses reads when the common source authority was not installed',async()=>{
    const f=fixture();f.connection.installed=false;
    const response=await handleChatReadRequestV1(f.input);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('CHAT_HISTORY_AUTHORITY_UNAVAILABLE');
    expect(f.connection.calls.some(q=>q.text.includes('from public.qry_chat_thread_owner_visible_history_v1'))).toBe(false);
  });
  it('does not read another account thread or leak its database denial',async()=>{
    const f=fixture();f.connection.denied=true;
    const response=await handleChatReadRequestV1(f.input);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('private other-owner evidence');
    expect(f.connection.calls.some(q=>q.text.includes('from public.qry_chat_thread_owner_visible_history_v1'))).toBe(false);
  });
  it('rejects missing login before any database query',async()=>{
    const f=fixture(undefined,false);
    const response=await handleChatReadRequestV1(f.input);
    expect(response.status).toBe(401);
    expect(f.connection.calls).toHaveLength(0);
  });
  it('uses the requested sequence cursor and preserves monotonic pagination',async()=>{
    const f=fixture(`https://myeongha.test/api/chat/${THREAD}?afterSequenceNo=4&pageSize=1`);
    f.connection.rows=[visibleUser(5),{...visibleUser(6),messageId:'96000000-0000-4000-8000-000000000002'}];
    const response=await handleChatReadRequestV1(f.input);
    const data=(await response.json()).data;
    expect(data.messages).toHaveLength(1);
    expect(data.pagination).toMatchObject({pageSize:1,hasMore:true,nextAfterSequenceNo:5});
    expect(f.connection.calls.find(q=>q.text.includes('from public.qry_chat_thread_owner_visible_history_v1'))?.values)
      .toEqual([SUBJECT,THREAD,4,1]);
  });
  it.each(['pageSize=0','pageSize=51','afterSequenceNo=-1','subjectId=other'])(
    'rejects client-provided invalid paging or authority: %s',async(query)=>{
      const f=fixture(`https://myeongha.test/api/chat/${THREAD}?${query}`);
      const response=await handleChatReadRequestV1(f.input);
      expect(response.status).toBe(400);
      expect(f.connection.calls).toHaveLength(0);
    },
  );
  it('rejects malformed historical sender data rather than rendering it',async()=>{
    const f=fixture();f.connection.rows=[{...visibleUser(),senderType:'unknown'}];
    await expect(handleChatReadRequestV1(f.input)).rejects.toThrow('sender type is unsupported');
  });
});
