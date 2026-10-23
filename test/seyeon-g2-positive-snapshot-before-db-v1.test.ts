// Watchtower-Track: security
// S4/G2 positive source SQL port: synthetic-only, no Production DB/Provider.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../packages/domain/src/index.js';
import {describe, expect, it} from 'vitest';
import {
  createSeyeonPositiveS0OwnerDbPortsV1,
  type SeyeonPositiveS0AtomicCommitInputV1,
} from '../apps/api/src/postgres-seyeon-positive-memory-source-runtime-v1.js';
import type {
  PostgresTransactionQueryV1, PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';

const U=(n:number)=>`d${n}000000-0000-4000-8000-000000000001`;
const SUBJECT=U(1), THREAD=U(2), TURN=U(3), ATTEMPT=U(4);
const ASSISTANT=U(5), OUTBOX=U(6), ANALYSIS=U(7), USER=U(8);
const SOURCE_DIGEST='sha256:v1:'+'a'.repeat(64);
const CONTEXT_DIGEST='sha256:v1:'+'b'.repeat(64);

function checksum(value:unknown):string {
  return 'sha256:v1:'+createHash('sha256').update(canonicalJson(value)).digest('hex');
}
function snapshot(){
  return {
    schemaVersion:'seyeon-post-turn-analysis-snapshot-v1',
    mode:'OFF',
    turnId:TURN,
    userMessageId:USER,
    assistantMessageId:ASSISTANT,
    preparedAt:'2026-10-22T00:00:00.000Z',
    productionAuthorityRef:'production:test-only',
    interpretation:{},
    envelope:{utterance:'offline'},
    eventAuthorityEvidence:{},
    priorEvents:[],
    relationshipBefore:{},
    productionCausalBindings:[],
    identity:{
      experimentalEventId:U(9),
      experimentalEventDedupeKey:'only-test',
      productionEventId:'test-production-event',
      relationshipSyncOutboxEventId:'test-relationship-sync',
    },
  };
}
function input(value:unknown=snapshot()):SeyeonPositiveS0AtomicCommitInputV1{
  return {
    subjectId:SUBJECT, threadId:THREAD, turnId:TURN, attemptId:ATTEMPT,
    userMessageId:USER,
    assistantMessageId:ASSISTANT, chatOutboxEventId:OUTBOX,
    postTurnOutboxEventId:ANALYSIS,
    postTurnSnapshot:value,postTurnSnapshotHash:checksum(value),
    selectedSourcesDigest:SOURCE_DIGEST,
    finalModelContextDigest:CONTEXT_DIGEST,
  };
}
function fakeClient(overrides:Readonly<Record<string,unknown>>={}){
  const statements:string[]=[];
  const client:PostgresTransactionQueryV1={
    async query<Row=Record<string,unknown>>(sql:string):Promise<PostgresQueryResultV1<Row>>{
      statements.push(sql);
      return {rows:[{
        turnId:TURN, attemptId:ATTEMPT, assistantMessageId:ASSISTANT,
        sequenceNo:2, committedAt:'2026-10-22T00:00:00.000Z',
        postTurnOutboxEventId:ANALYSIS, replayed:false,
        ...overrides,
      } as unknown as Row]};
    },
  };
  return {statements,port:createSeyeonPositiveS0OwnerDbPortsV1(client)};
}
describe('S4/G2 positive original Grant adapter admits only verified official Post-turn snapshot',()=>{
  it.each([
    ['incorrect digest',()=>({...input(),postTurnSnapshotHash:'sha256:v1:'+'f'.repeat(64)})],
    ['different turn rehashed',()=>{
      const value={...snapshot(),turnId:U(0)};
      return input(value);
    }],
    ['different assistant rehashed',()=>{
      const value={...snapshot(),assistantMessageId:U(0)};
      return input(value);
    }],
    ['different original user message rehashed',()=>{
      const value={...snapshot(),userMessageId:U(0)};
      return input(value);
    }],
    ['input original user message does not match snapshot',()=>{
      return {...input(),userMessageId:U(0)};
    }],
    ['unrecognized top-level field rehashed',()=>{
      const value={...snapshot(),injected:'extra'};
      return input(value);
    }],
    ['unrecognized identity field rehashed',()=>{
      const value={...snapshot(),identity:{...snapshot().identity,extraGrant:'spoof'}};
      return input(value);
    }],
    ['unsupported mode rehashed',()=>{
      const value={...snapshot(),mode:'ELEVATED'};
      return input(value);
    }],
    ['missing official identity rehashed',()=>{
      const value={...snapshot(),identity:null};
      return input(value);
    }],
    ['invalid original user identity',()=>{
      return {...input(),userMessageId:'not-a-uuid'};
    }],
  ] as const)('holds %s before any DB owner Commit call',async(_name,make)=>{
    const {statements,port}=fakeClient();
    await expect(port.commitAfterValidation(make())).rejects.toThrow();
    expect(statements).toHaveLength(0);
  });

  it.each([
    ['zero sequence', {sequenceNo:0}],
    ['negative sequence', {sequenceNo:-1}],
    ['fractional sequence', {sequenceNo:1.5}],
    ['non-finite sequence', {sequenceNo:Infinity}],
    ['different DB committed assistant', {assistantMessageId:USER}],
    ['different DB committed attempt', {attemptId:USER}],
    ['already-replayed DB receipt', {replayed:true}],
  ] as const)('rejects non-first or mismatched G2 owner Commit receipt: %s',async(_name,override)=>{
    const {statements,port}=fakeClient(override);
    await expect(port.commitAfterValidation(input())).rejects.toThrow();
    expect(statements).toHaveLength(1);
  });

  it('preserves a server-shaped exact canonical snapshot through the current G2 owner SQL',async()=>{
    const {statements,port}=fakeClient();
    const receipt=await port.commitAfterValidation(input());
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('public.cmd_commit_seyeon_positive_chat_turn_v1');
    expect(receipt).toMatchObject({
      turnId:TURN,attemptId:ATTEMPT,assistantMessageId:ASSISTANT,
      sequenceNo:2,replayed:false,postTurnOutboxEventId:ANALYSIS,
    });
  });
});
