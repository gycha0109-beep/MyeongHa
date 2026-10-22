// Watchtower-Track: security
// Offline contract for G3 Node-only; no Production DB, HTTP mount or Provider.
import {describe,expect,it} from 'vitest';
import {
  assertSeyeonFirstPositiveNodeDbReadyV1,
  createSeyeonFirstPositiveMemoryLockedReadV1,
  executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1,
  deliverSeyeonCommittedFirstPositiveMemoryNodeTurnV1,
} from '../apps/api/src/seyeon-first-positive-memory-node-delivery-v1.js';
import type { RunProductionSeyeonChatResultV1 } from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import type { ServerResponse } from 'node:http';
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

  it('closes an open first-reply socket on DB_NOT_READY before any runtime/provider call', async () => {
    const connection = new FakeG3Connection(SUBJECT, CANARY, false);
    const pool = new FakeG3Pool(connection);
    let destroyed = false;
    let runtimeCalls = 0;
    const response = {
      headersSent: false,
      writableEnded: false,
      destroyed: false,
      socket: {},
      destroy() { destroyed = true; },
    } as unknown as ServerResponse;
    await expect(executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1({
      response,
      requestSignal: new AbortController().signal,
      pool,
      verifiedEvidence: EVIDENCE,
      threadId: THREAD,
      clientTurnId: TURN,
      text: '안녕하세요',
      requestId: 'g3-test-readiness',
      serverTime: '2026-10-22T00:00:00.000Z',
      runtime: {
        async run(): Promise<never> {
          runtimeCalls += 1;
          throw Error('Provider path must not start');
        },
      },
    })).rejects.toMatchObject({code: 'DB_NOT_READY'});
    expect(destroyed).toBe(true);
    expect(runtimeCalls).toBe(0);
    expect(pool.connects).toBe(1);
    expect(queries(connection)).not.toContainEqual(
      expect.stringContaining('from public.qry_seyeon_positive_first_memory_locked_reveal_v1('),
    );
  });

  it('closes an open socket on a failed DB readiness transaction without provider dispatch', async () => {
    const pool: PostgresSubjectPoolV1 = {
      connect() { throw Error('Database unavailable'); },
    };
    let destroyed = false;
    let runtimeCalls = 0;
    const response = {
      headersSent: false,
      writableEnded: false,
      destroyed: false,
      socket: {},
      destroy() { destroyed = true; },
    } as unknown as ServerResponse;
    await expect(executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1({
      response,
      requestSignal: new AbortController().signal,
      pool,
      verifiedEvidence: EVIDENCE,
      threadId: THREAD,
      clientTurnId: TURN,
      text: '상담 시작',
      requestId: 'g3-test-db-error',
      serverTime: '2026-10-22T00:00:00.000Z',
      runtime: {
        async run(): Promise<never> {
          runtimeCalls += 1;
          throw Error('Provider path must not start');
        },
      },
    })).rejects.toThrow(/Database unavailable/u);
    expect(destroyed).toBe(true);
    expect(runtimeCalls).toBe(0);
  });

  it('closes the Node socket when a ready DB is followed by a failed runtime run', async () => {
    const db = new FakeG3Connection(SUBJECT, CANARY, true);
    const pool = new FakeG3Pool(db);
    let destroyed = false;
    let runtimeCalls = 0;
    const response = {
      headersSent: false,
      writableEnded: false,
      destroyed: false,
      socket: {},
      destroy() { destroyed = true; },
    } as unknown as ServerResponse;
    await expect(executeAndDeliverSeyeonFirstPositiveMemoryNodeTurnV1({
      response,
      requestSignal: new AbortController().signal,
      pool,
      verifiedEvidence: EVIDENCE,
      threadId: THREAD,
      clientTurnId: TURN,
      text: '안녕하세요',
      requestId: 'g3-test-runtime-failure',
      serverTime: '2026-10-22T00:00:00.000Z',
      runtime: {
        async run(): Promise<never> {
          runtimeCalls++;
          throw Error('synthetic governed runtime failure');
        },
      },
    })).rejects.toThrow(/synthetic governed runtime failure/u);
    expect(destroyed).toBe(true);
    expect(runtimeCalls).toBe(1);
    expect(pool.connects).toBe(1);
    expect(queries(db).some(q => q.includes('has_function_privilege'))).toBe(true);
    expect(queries(db)).not.toContainEqual(
      expect.stringContaining('from public.qry_seyeon_positive_first_memory_locked_reveal_v1('),
    );
  });

  it.each([
    ['Commit belongs to another attempt', { attemptId: ATTEMPT, receiptAttemptId: OTHER, attemptReplayed: false, characterId: 'seyeon' }],
    ['executed attempt was actually an in-flight replay', { attemptId: ATTEMPT, receiptAttemptId: ATTEMPT, attemptReplayed: true, characterId: 'seyeon' }],
    ['committed turn was attributed to another Character', { attemptId: ATTEMPT, receiptAttemptId: ATTEMPT, attemptReplayed: false, characterId: 'other-character' }],
    ['attempt receipt is missing', { attemptId: undefined, receiptAttemptId: ATTEMPT, attemptReplayed: false, characterId: 'seyeon' }],
  ])('blocks mismatched G3 executed lineage: %s before original Grant lookup', async (_name, mismatch) => {
    let destroyed = false;
    let dbConnections = 0;
    const pool: PostgresSubjectPoolV1 = {
      connect() {
        dbConnections++;
        throw Error('Wrong attempt must never reach original Grant DB lookup');
      },
    };
    const response = {
      headersSent: false, writableEnded: false, destroyed: false,
      socket: {}, destroy() { destroyed = true; },
    } as unknown as ServerResponse;
    const committedTurn = {
      turnId: TURN,
      attemptId: mismatch.receiptAttemptId,
      assistantMessageId: 'd5000000-0000-4000-8000-000000000006',
      sequenceNo: 1,
      replayed: false,
    };
    const result = {
      subjectId: SUBJECT,
      threadBinding: {threadId: THREAD},
      execution: {
        disposition: 'executed',
        receivedTurn: {turnId: TURN, threadCharacterId: mismatch.characterId},
        attempt: {attemptId: mismatch.attemptId, replayed: mismatch.attemptReplayed},
        committedTurn,
      },
    } as unknown as RunProductionSeyeonChatResultV1;
    await expect(deliverSeyeonCommittedFirstPositiveMemoryNodeTurnV1({
      response,
      requestSignal: new AbortController().signal,
      pool,
      verifiedEvidence: EVIDENCE,
      result,
      expectedThreadId: THREAD,
      requestId: 'g3-exact-attempt',
      serverTime: '2026-10-22T00:00:00.000Z',
    })).rejects.toMatchObject({code: 'INVALID_COMMIT'});
    expect(destroyed).toBe(true);
    expect(dbConnections).toBe(0);
  });

  it.each([
    ['no participants', []],
    ['wrong Character only', ['other-character']],
    ['mixed Character thread', ['seyeon', 'other-character']],
    ['duplicated Se-yeon participants', ['seyeon', 'seyeon']],
    ['missing participant list', undefined],
  ] as const)('holds an ineligible G3 Thread: %s before original Grant lookup', async (_name, participants) => {
    let destroyed = false;
    let dbConnections = 0;
    const pool: PostgresSubjectPoolV1 = {
      connect() {
        dbConnections++;
        throw Error('Wrong Thread must not reach G3 DB lookup');
      },
    };
    const response = {
      headersSent: false, writableEnded: false, destroyed: false,
      socket: {}, destroy() { destroyed = true; },
    } as unknown as ServerResponse;
    const result = {
      subjectId: SUBJECT,
      threadBinding: {threadId: THREAD, participantCharacterIds: participants},
      execution: {
        disposition: 'executed',
        receivedTurn: {turnId: TURN, threadCharacterId: 'seyeon'},
        attempt: {attemptId: ATTEMPT, replayed: false},
        committedTurn: {
          turnId: TURN,
          attemptId: ATTEMPT,
          assistantMessageId: 'd5000000-0000-4000-8000-000000000006',
          sequenceNo: 1,
          replayed: false,
        },
      },
    } as unknown as RunProductionSeyeonChatResultV1;
    await expect(deliverSeyeonCommittedFirstPositiveMemoryNodeTurnV1({
      response,
      requestSignal: new AbortController().signal,
      pool,
      verifiedEvidence: EVIDENCE,
      result,
      expectedThreadId: THREAD,
      requestId: 'g3-thread-single-character',
      serverTime: '2026-10-22T00:00:00.000Z',
    })).rejects.toMatchObject({code: 'INVALID_COMMIT'});
    expect(destroyed).toBe(true);
    expect(dbConnections).toBe(0);
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
});
