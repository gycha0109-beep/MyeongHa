// Watchtower-Track: security
// Offline contract for G3 Node-only; no Production DB, HTTP mount or Provider.
import {describe,expect,it} from 'vitest';
import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import type { RunProductionSeyeonChatResultV1 } from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import {
  assertSeyeonFirstPositiveNodeDbReadyV1,
  createSeyeonFirstPositiveMemoryLockedReadV1,
  deliverSeyeonCommittedFirstPositiveMemoryNodeTurnV1,
  executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1,
} from '../apps/api/src/seyeon-first-positive-memory-node-delivery-v1.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const AUTH='d0000000-0000-4000-8000-000000000001';
const SUBJECT='d1000000-0000-4000-8000-000000000001';
const OTHER='d1000000-0000-4000-8000-000000000002';
const THREAD='d2000000-0000-4000-8000-000000000003';
const TURN='d3000000-0000-4000-8000-000000000004';
const ATTEMPT='d4000000-0000-4000-8000-000000000005';
const ASSISTANT='d5000000-0000-4000-8000-000000000006';
const CLIENT_TURN='d6000000-0000-4000-8000-000000000007';
const CANARY='G3_OFFLINE_CURRENT_ORIGINAL_MEMORY';
const EVIDENCE={kind:'member' as const,verifiedAuthUserId:AUTH};
type Call={text:string;values:readonly unknown[]};

class FakeG3Connection implements PostgresSubjectConnectionV1 {
  readonly calls:Call[]=[];
  readonly releases:unknown[]=[];
  constructor(
    readonly resolvedSubjectId:string,
    readonly authorizedText:string|null=CANARY,
    readonly ready=false,
  ){}
  async query<Row=Record<string,unknown>>(
    text:string,values:readonly unknown[]=[],
  ):Promise<PostgresQueryResultV1<Row>>{
    this.calls.push({text,values});
    if(text.includes('begin_member_subject_context_v1')){
      return {rows:[{subjectId:this.resolvedSubjectId,subjectKind:'member'}] as unknown as readonly Row[]};
    }
    if(text.includes('to_regprocedure(')){
      return {rows:[{ready:this.ready}] as unknown as readonly Row[]};
    }
    if(text.includes('from public.qry_seyeon_positive_first_memory_locked_reveal_v1(')){
      return {rows:[{assistantText:this.authorizedText}] as unknown as readonly Row[]};
    }
    return {rows:[]};
  }
  release(error?:unknown):void{this.releases.push(error);}
}

class FakeG3Pool implements PostgresSubjectPoolV1 {
  connects=0;
  constructor(readonly connection:FakeG3Connection){}
  connect():PostgresSubjectConnectionV1{
    this.connects++;
    return this.connection;
  }
}
function read(pool:PostgresSubjectPoolV1,expectedSubjectId=SUBJECT){
  return createSeyeonFirstPositiveMemoryLockedReadV1({
    pool,verifiedEvidence:EVIDENCE,expectedSubjectId,
    threadId:THREAD,turnId:TURN,attemptId:ATTEMPT,
  });
}
function queries(db:FakeG3Connection){return db.calls.map(q=>q.text);}

type FakeNodeResponse = EventEmitter & {
  headersSent:boolean;
  writableEnded:boolean;
  destroyed:boolean;
  socket:object;
  statusCode:number;
  setHeader:(name:string,value:string)=>void;
  end:(data?:Buffer)=>void;
  destroy:()=>void;
};
function fakeNodeResponse(){
  const outbound:string[]=[];
  const fake=new EventEmitter() as FakeNodeResponse;
  fake.headersSent=false;
  fake.writableEnded=false;
  fake.destroyed=false;
  fake.socket={};
  fake.statusCode=200;
  fake.setHeader=()=>{};
  fake.end=(data?:Buffer)=>{
    if(data) outbound.push(data.toString('utf8'));
    fake.writableEnded=true;
    fake.emit('finish');
  };
  fake.destroy=()=>{ fake.destroyed=true;fake.emit('close'); };
  return {response:fake as unknown as ServerResponse,outbound,closed:()=>fake.destroyed};
}
function forgedCommit(
  subjectId=SUBJECT,
  override:Readonly<{
    receivedReplay?:boolean;
    attemptReplay?:boolean;
    attemptId?:string;
  }>={},
):RunProductionSeyeonChatResultV1{
  return {
    subjectId,
    threadBinding:{threadId:THREAD},
    execution:{
      disposition:'executed',
      receivedTurn:{turnId:TURN,replayed:override.receivedReplay??false},
      attempt:{attemptId:override.attemptId??ATTEMPT,replayed:override.attemptReplay??false},
      committedTurn:{
        turnId:TURN,attemptId:ATTEMPT,assistantMessageId:ASSISTANT,
        sequenceNo:2,replayed:false,
      },
    },
  } as unknown as RunProductionSeyeonChatResultV1;
}

describe('Se-yeon G3 Node-only original-Grant current Subject fence',()=>{
  it('binds DB-resolved Subject and locks original Grant through delivery before COMMIT',async()=>{
    const db=new FakeG3Connection(SUBJECT);
    const locked=read(new FakeG3Pool(db));
    const events:string[]=[];
    await locked({
      signal:new AbortController().signal,
      deliver:async body=>{
        expect(body).toBe(CANARY);
        expect(queries(db).at(-1)).toContain(
          'from public.qry_seyeon_positive_first_memory_locked_reveal_v1(',
        );
        expect(queries(db)).not.toContain('COMMIT');
        events.push('delivered-under-lock');
      },
    });
    expect(events).toEqual(['delivered-under-lock']);
    expect(queries(db)).toEqual([
      'BEGIN','SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('public.begin_member_subject_context_v1'),
      expect.stringContaining('public.assert_myeongha_subject_context_v1'),
      expect.stringContaining('from public.qry_seyeon_positive_first_memory_locked_reveal_v1('),
      'COMMIT',
    ]);
    expect(db.calls[4]?.values).toEqual([SUBJECT,THREAD,TURN,ATTEMPT]);
    expect(db.releases).toEqual([undefined]);
  });

  it('refuses a different DB-authenticated Subject before any G3 Grant or message read',async()=>{
    const db=new FakeG3Connection(OTHER);
    const port=read(new FakeG3Pool(db),SUBJECT);
    let delivered=false;
    await expect(port({
      signal:new AbortController().signal,
      deliver:async()=>{delivered=true;},
    })).rejects.toMatchObject({code:'INVALID_SCOPE'});
    expect(delivered).toBe(false);
    expect(queries(db).some(q=>q.includes(
      'from public.qry_seyeon_positive_first_memory_locked_reveal_v1(',
    ))).toBe(false);
    expect(queries(db).at(-1)).toBe('ROLLBACK');
    expect(queries(db)).not.toContain('COMMIT');
    expect(db.releases).toEqual([undefined]);
  });

  it('never treats a NULL original-Grant answer as cached authorized text',async()=>{
    const db=new FakeG3Connection(SUBJECT,null);
    const bodies:(string|null)[]=[];
    await read(new FakeG3Pool(db))({
      signal:new AbortController().signal,
      deliver:async body=>{bodies.push(body);},
    });
    expect(bodies).toEqual([null]);
  });

  it('enforces one single-use G3 original read per committed attempt',async()=>{
    const db=new FakeG3Connection(SUBJECT);
    const pool=new FakeG3Pool(db);
    const port=read(pool);
    await port({
      signal:new AbortController().signal,
      deliver:async()=>{},
    });
    await expect(port({
      signal:new AbortController().signal,
      deliver:async()=>{throw Error('must not repeat');},
    })).rejects.toMatchObject({code:'INVALID_SCOPE'});
    expect(pool.connects).toBe(1);
  });

  it('keeps absent G1/G2/G3 owner RPC and EXECUTE privileges before Provider at DB_NOT_READY',async()=>{
    const db=new FakeG3Connection(SUBJECT,CANARY,false);
    await expect(assertSeyeonFirstPositiveNodeDbReadyV1({
      pool:new FakeG3Pool(db),verifiedEvidence:EVIDENCE,
    })).rejects.toMatchObject({code:'DB_NOT_READY'});
    expect(queries(db).some(q=>q.includes('has_function_privilege'))).toBe(true);
    expect(queries(db)).not.toContainEqual(
      expect.stringContaining('from public.qry_seyeon_positive_first_memory_locked_reveal_v1('),
    );
  });
  it('rejects a mixed-subject executed Commit before Grant read or any HTTP body',async()=>{
    const db=new FakeG3Connection(OTHER);
    const pool=new FakeG3Pool(db);
    const node=fakeNodeResponse();
    await expect(deliverSeyeonCommittedFirstPositiveMemoryNodeTurnV1({
      response:node.response,
      requestSignal:new AbortController().signal,
      pool,
      verifiedEvidence:EVIDENCE,
      result:forgedCommit(SUBJECT),
      expectedThreadId:THREAD,
      requestId:'g3-cross-subject',
      serverTime:'2026-10-22T04:15:00.000Z',
    })).rejects.toMatchObject({code:'INVALID_SCOPE'});
    expect(queries(db)).toEqual([
      'BEGIN','SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('public.begin_member_subject_context_v1'),
      expect.stringContaining('public.assert_myeongha_subject_context_v1'),
      'ROLLBACK',
    ]);
    expect(node.outbound).toEqual([]);
    expect(node.closed()).toBe(true);
    expect(db.releases).toEqual([undefined]);
  });

  it('closes the Node socket and never invokes a provider when G1/G2/G3 RPCs are not ready',async()=>{
    const db=new FakeG3Connection(SUBJECT,CANARY,false);
    const pool=new FakeG3Pool(db);
    const node=fakeNodeResponse();
    let providerCalls=0;
    await expect(executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1({
      response:node.response,
      requestSignal:new AbortController().signal,
      pool,
      verifiedEvidence:EVIDENCE,
      threadId:THREAD,
      clientTurnId:CLIENT_TURN,
      text:'offline only',
      requestId:'g3-before-provider',
      serverTime:'2026-10-22T04:15:00.000Z',
      runtime:{run:async()=>{providerCalls++;throw Error('provider must not run');}},
    })).rejects.toMatchObject({code:'DB_NOT_READY'});
    expect(providerCalls).toBe(0);
    expect(node.outbound).toEqual([]);
    expect(node.closed()).toBe(true);
    expect(queries(db).some(q=>q.includes(
      'from public.qry_seyeon_positive_first_memory_locked_reveal_v1(',
    ))).toBe(false);
    expect(queries(db).at(-1)).toBe('COMMIT');
  });

  it('rejects replayed receive, replayed attempt and mixed attempt locators before DB G3',async()=>{
    for(const altered of [
      {receivedReplay:true},
      {attemptReplay:true},
      {attemptId:OTHER},
    ]){
      const db=new FakeG3Connection(SUBJECT);
      const pool=new FakeG3Pool(db);
      const node=fakeNodeResponse();
      await expect(deliverSeyeonCommittedFirstPositiveMemoryNodeTurnV1({
        response:node.response,
        requestSignal:new AbortController().signal,
        pool,
        verifiedEvidence:EVIDENCE,
        result:forgedCommit(SUBJECT,altered),
        expectedThreadId:THREAD,
        requestId:'g3-mixed-attempt',
        serverTime:'2026-10-22T04:15:00.000Z',
      })).rejects.toMatchObject({code:'INVALID_COMMIT'});
      expect(node.outbound).toEqual([]);
      expect(node.closed()).toBe(true);
      expect(pool.connects).toBe(0);
    }
  });

  it('binds a fresh non-replay attempt to the original DB body under the Node callback',async()=>{
    const db=new FakeG3Connection(SUBJECT);
    const pool=new FakeG3Pool(db);
    const node=fakeNodeResponse();
    const outcome=await deliverSeyeonCommittedFirstPositiveMemoryNodeTurnV1({
      response:node.response,
      requestSignal:new AbortController().signal,
      pool,
      verifiedEvidence:EVIDENCE,
      result:forgedCommit(),
      expectedThreadId:THREAD,
      requestId:'g3-new-attempt',
      serverTime:'2026-10-22T04:15:00.000Z',
    });
    expect(outcome).toBe('assistant_sent');
    expect(queries(db).at(-1)).toBe('COMMIT');
    expect(node.outbound).toHaveLength(1);
    expect(JSON.parse(node.outbound[0]!)).toMatchObject({
      ok:true,data:{assistantText:CANARY,replayed:false,turnId:TURN,assistantMessageId:ASSISTANT},
    });
  });

  it('rejects an invalid send deadline without leaving the direct Node socket open',async()=>{
    const db=new FakeG3Connection(SUBJECT);
    const pool=new FakeG3Pool(db);
    const node=fakeNodeResponse();
    await expect(deliverSeyeonCommittedFirstPositiveMemoryNodeTurnV1({
      response:node.response,
      requestSignal:new AbortController().signal,
      pool,
      verifiedEvidence:EVIDENCE,
      result:forgedCommit(),
      expectedThreadId:THREAD,
      requestId:'g3-invalid-deadline',
      serverTime:'2026-10-22T04:15:00.000Z',
      deadlineMs:1,
    })).rejects.toThrow('Invalid bounded send deadline');
    expect(node.outbound).toEqual([]);
    expect(node.closed()).toBe(true);
    expect(pool.connects).toBe(0);
  });

  it('closes the Node socket when the pre-model gate succeeds but the runtime throws',async()=>{
    const db=new FakeG3Connection(SUBJECT,CANARY,true);
    const pool=new FakeG3Pool(db);
    const node=fakeNodeResponse();
    let calls=0;
    await expect(executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1({
      response:node.response,
      requestSignal:new AbortController().signal,
      pool,
      verifiedEvidence:EVIDENCE,
      threadId:THREAD,
      clientTurnId:CLIENT_TURN,
      text:'offline only',
      requestId:'g3-runtime-error',
      serverTime:'2026-10-22T04:15:00.000Z',
      runtime:{run:async()=>{calls++;throw Error('synthetic runtime failure');}},
    })).rejects.toThrow('synthetic runtime failure');
    expect(calls).toBe(1);
    expect(node.outbound).toEqual([]);
    expect(node.closed()).toBe(true);
    expect(queries(db).some(q=>q.includes('from public.qry_seyeon_positive_first_memory_locked_reveal_v1('))).toBe(false);
  });

  it('rolls back current original Grant locks if the transport callback fails',async()=>{
    const db=new FakeG3Connection(SUBJECT);
    const port=read(new FakeG3Pool(db));
    await expect(port({
      signal:new AbortController().signal,
      deliver:async()=>{ throw Error('simulated socket failure'); },
    })).rejects.toThrow('simulated socket failure');
    expect(queries(db).at(-1)).toBe('ROLLBACK');
    expect(queries(db)).not.toContain('COMMIT');
  });

});
