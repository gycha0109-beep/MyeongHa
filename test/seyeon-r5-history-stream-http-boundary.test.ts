import { describe, expect, it } from 'vitest';
import {
  createSeyeonOfflineHistoryDisclosurePortR5,
  createSeyeonOfflineStreamDisclosurePortR5,
  createSeyeonOfflineTurnDisclosurePortR5,
  SEYEON_OFFLINE_R5_DISPATCH_MODE,
} from '../apps/api/src/seyeon-offline-history-stream-disclosure-r5.js';
import { getChatThreadStream } from '../apps/api/src/chat-thread-stream-read.js';
import { handleChatReadRequestV1 } from '../apps/api/src/chat-read-http.js';
import { handleSeyeonChatTurnSendRequestV1 } from '../apps/api/src/chat-turn-send-http.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
  PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';

const subject='d2000000-0000-4000-8000-000000000001';
const thread='d4000000-0000-4000-8000-000000000001';
const turn='d7000000-0000-4000-8000-000000000001';
const attempt='d7200000-0000-4000-8000-000000000001';
const message='d8300000-0000-4000-8000-000000000001';
const identity={kind:'member' as const,verifiedAuthUserId:
  'd1000000-0000-4000-8000-000000000001'};
const approved={
  messageId:message,sequenceNo:2,senderType:'character',
  characterId:'seyeon',bodyText:'DB_CURRENT_GRANT_APPROVED',
  messagePayloadJsonb:null,messageSchemaVersion:'chat-character-message-v1',
  createdAt:new Date('2026-10-15T00:00:00.000Z'),redacted:false,
  redactedAt:null,
};
const user={
  ...approved,messageId:'d7100000-0000-4000-8000-000000000001',
  sequenceNo:1,senderType:'user',characterId:null,bodyText:'합성 질문',
  messageSchemaVersion:'chat-request-v1',
};
type FakeValue={rows:readonly Record<string,unknown>[]};

class FakeConnection implements PostgresSubjectConnectionV1 {
  readonly calls:{sql:string;params:readonly unknown[]}[]=[];
  returnedSubject=subject;
  authorized=true;
  ownerPage:readonly Record<string,unknown>[]=[user,approved];
  releaseCount=0;

  async query<Row=Record<string,unknown>>(sql:string,params:readonly unknown[]=[]):
    Promise<PostgresQueryResultV1<Row>> {
    this.calls.push({sql,params});
    let rows:readonly Record<string,unknown>[]=[];
    if (sql.includes('begin_member_subject_context_v1')) {
      rows=[{subjectId:this.returnedSubject,subjectKind:'member'}];
    } else if (sql.includes('qry_chat_thread_runtime_binding_v1')) {
      rows=[{
        threadId:thread,status:'active',
        activeContentReleaseId:'d3100000-0000-4000-8000-000000000001',
        activeContentBundleId:'d3000000-0000-4000-8000-000000000001',
        contentRevision:0,participantCharacterIds:['seyeon'],
      }];
    } else if (sql.includes('read_authorized_page_r5')) {
      if(!this.authorized) {
        throw Object.assign(new Error('held'),{
          constraint:'seyeon_offline_r5_page_held',code:'23514',
        });
      }
      rows=this.ownerPage;
    } else if (sql.includes('reveal_http_r5')) {
      rows=[{assistantText:this.authorized?'DB_CURRENT_GRANT_APPROVED':null}];
    } else if (sql.includes('qry_chat_thread_stream_v2')) {
      throw new Error('Generic stream was illegally used for Se-yeon');
    } else if (sql.includes('qry_character_relationship_v1')) {
      throw new Error('Derived relationship query illegally used for Se-yeon');
    }
    return {rows:rows as readonly Row[]};
  }
  release():void {this.releaseCount++;}
}
function poolFor(connection:FakeConnection):PostgresSubjectPoolV1 {
  return {connect:()=>connection};
}
const page={
  subjectId:subject,threadId:thread,afterSequenceNo:0,
  pageSize:50,characterId:'seyeon' as const,
};
function historyRequest() {
  return new Request('https://myeongha.example/api/chat/'+thread+
    '?afterSequenceNo=0');
}

describe('offline R5 History / polling Stream / HTTP response closed boundaries',()=>{
  it('never auto-enables production; reads only owner page and strips payload',async()=>{
    expect(SEYEON_OFFLINE_R5_DISPATCH_MODE).toBe('OFFLINE_HOLD_PRODUCTION');
    const c=new FakeConnection();
    const port=createSeyeonOfflineHistoryDisclosurePortR5();
    const result=await port.readAuthorizedPage({
      client:c,...page,
    });
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      senderType:'character',bodyText:'DB_CURRENT_GRANT_APPROVED',
      messagePayloadJsonb:null,
    });
    expect(c.calls.map(x=>x.sql).some(x=>x.includes('read_authorized_page_r5'))).toBe(true);
    expect(c.calls.some(x=>x.sql.includes('qry_chat_thread_stream_v2'))).toBe(false);
  });

  it('polling Stream uses SAME current Grant owner page, not legacy raw SQL',async()=>{
    const c=new FakeConnection();
    const response=await getChatThreadStream({
      resolvedSubjectId:subject,threadId:thread,afterSequenceNo:0,
      authorityPort:createSeyeonOfflineStreamDisclosurePortR5(c),
    });
    expect(response.messages.map(x=>x.bodyText)).toEqual([
      '합성 질문','DB_CURRENT_GRANT_APPROVED',
    ]);
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0]?.sql).toContain('read_authorized_page_r5');
    expect(c.calls[0]?.sql).not.toContain('qry_chat_thread_stream_v2');
  });

  it('untrusted owner rows fail closed before history or stream publication',async()=>{
    const c=new FakeConnection();
    const port=createSeyeonOfflineHistoryDisclosurePortR5();
    const variants=[
      {...approved,messagePayloadJsonb:{secret:'RAW_PERSONAL'}},
      {...approved,characterId:'another'},
      {...approved,sequenceNo:0},
      {...approved,redacted:true,redactedAt:new Date(),bodyText:'secret'},
      {...approved,senderType:'system'},
    ];
    for(const row of variants) {
      c.ownerPage=[user,row];
      await expect(port.readAuthorizedPage({client:c,...page}))
        .rejects.toThrow();
    }
  });

  it('existing GET Chat History injected adapter exposes approved text only; held page returns 503',async()=>{
    const c=new FakeConnection();
    const input={
      request:historyRequest(),requestId:'req-r5-history',
      serverTime:'2026-10-15T00:00:00Z',
      identityEvidenceVerifier:{
        verifyRequestIdentity:()=>identity,
      },
      pool:poolFor(c),
      seyeonHistoryDisclosurePort:createSeyeonOfflineHistoryDisclosurePortR5(),
    };
    const ok=await handleChatReadRequestV1(input);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    const data=await ok.json();
    expect(data.data.messages).toHaveLength(2);
    expect(data.data.latestCharacterMessage.bodyText)
      .toBe('DB_CURRENT_GRANT_APPROVED');
    expect(data.data.relationship).toBeNull();
    expect(c.calls.some(x=>x.sql.includes('qry_chat_thread_stream_v2'))).toBe(false);
    c.authorized=false;
    const held=await handleChatReadRequestV1(input);
    expect(held.status).toBe(503);
    expect(held.headers.get('Cache-Control')).toBe('no-store');
    expect(await held.text()).not.toContain('DB_CURRENT_GRANT_APPROVED');
  });

  it('HTTP first/replay adapter uses verified canonical Subject, exact IDs and no raw text fallback',async()=>{
    const c=new FakeConnection();
    const controlled=createSeyeonOfflineTurnDisclosurePortR5(poolFor(c));
    const request={
      verifiedEvidence:identity,subjectId:subject,threadId:thread,
      turnId:turn,attemptId:attempt,assistantMessageId:message,
      disposition:'committed_replay' as const,
    };
    await expect(controlled.reveal(request)).resolves.toEqual({
      state:'authorized',assistantText:'DB_CURRENT_GRANT_APPROVED',
    });
    expect(c.calls.some(x=>x.sql.includes('reveal_http_r5'))).toBe(true);
    c.authorized=false;
    await expect(controlled.reveal(request)).resolves.toEqual({state:'held'});
    const before=c.calls.filter(x=>x.sql.includes('reveal_http_r5')).length;
    c.returnedSubject='d2000000-0000-4000-8000-000000000099';
    await expect(controlled.reveal(request)).resolves.toEqual({state:'held'});
    expect(c.calls.filter(x=>x.sql.includes('reveal_http_r5')).length).toBe(before);
  });

  it('existing POST response never publishes runtime-provided text, and a revoked replay yields 503',async()=>{
    const c=new FakeConnection();
    const disclosure=createSeyeonOfflineTurnDisclosurePortR5(poolFor(c));
    const runtime={
      async run() {
        return {
          runtimeVersion:'production-seyeon-chat-runtime-v1',
          subjectId:subject,
          threadBinding:{threadId:thread,participantCharacterIds:['seyeon']},
          bundleManifest:{},
          execution:{
            version:'seyeon-production-chat-execution-v1',
            disposition:'committed_replay',
            committedTurn:{
              turnId:turn,attemptId:attempt,assistantMessageId:message,
              sequenceNo:2,replayed:true,
            },
            assistantText:'UNAUTHORIZED_RAW_RUNTIME_SECRET',
          },
        } as never;
      },
    };
    const req=()=>new Request('https://myeongha.example/api/chat/'+thread+'/turns',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({
        clientTurnId:'d9000000-0000-4000-8000-000000000001',
        text:'안녕하세요',
      }),
    });
    const makeInput=()=>({
      request:req(),requestId:'req-r5-send',
      serverTime:'2026-10-15T00:00:00Z',
      identityEvidenceVerifier:{verifyRequestIdentity:()=>identity},
      runtime,
      controlledDisclosurePort:disclosure,
    });
    const ok=await handleSeyeonChatTurnSendRequestV1(makeInput());
    expect(ok.status).toBe(200);
    const wire=await ok.text();
    expect(wire).toContain('DB_CURRENT_GRANT_APPROVED');
    expect(wire).not.toContain('UNAUTHORIZED_RAW_RUNTIME_SECRET');

    c.authorized=false;
    const held=await handleSeyeonChatTurnSendRequestV1(makeInput());
    expect(held.status).toBe(503);
    const heldWire=await held.text();
    expect(heldWire).not.toContain('UNAUTHORIZED_RAW_RUNTIME_SECRET');
    expect(heldWire).not.toContain('DB_CURRENT_GRANT_APPROVED');
  });
});
