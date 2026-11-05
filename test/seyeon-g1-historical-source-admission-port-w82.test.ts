// Watchtower-Track: security
import {describe,expect,it} from 'vitest';
import {createSeyeonG1HistoricalSourceAdmissionPortV1}
  from '../apps/api/src/postgres-seyeon-g1-historical-source-admission-port-v1.js';
import type {PostgresTransactionQueryV1,PostgresQueryResultV1}
  from '../apps/api/src/postgres-subject-execution.js';

const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const sha=(c:string)=>'sha256:v1:'+c.repeat(64);
const pg=(c:string)=>'sha256:pg-jsonb:v1:'+c.repeat(64);
const input={
  subjectId:id(1),threadId:id(2),turnId:id(3),attemptId:id(4),
  finalModelContextDigest:sha('a'),candidatePgJsonbDigest:pg('b'),
  originalRecordId:id(6),originalGrantId:id(7),historicalSourceCount:2,
  historicalSourceCensusDigest:pg('c'),
};
const valid={
  schemaVersion:'seyeon-g1-historical-source-admission-s0-v1',
  subjectId:input.subjectId,threadId:input.threadId,
  turnId:input.turnId,attemptId:input.attemptId,
  characterId:'seyeon',recordKind:'memory',recordId:input.originalRecordId,
  originalGrantId:input.originalGrantId,
  recordType:'conversation_recall',recordSchemaVersion:'v1',
  projectorVersion:'seyeon-conversation-recall-projector-v1',
  originalPgJsonbDigest:pg('d'),selectedSourcesDigest:sha('e'),
  projectedMemoryDigest:sha('f'),historicalSourceCensusDigest:pg('c'),
  historicalAssistantOriginalSourcesDigest:pg('1'),
  historicalSourceCount:2,candidatePgJsonbDigest:pg('b'),
  finalModelContextDigest:sha('a'),originalsCurrentAtAdmission:true,
  authorizesSourceSelection:true,permitsModelDispatch:false,
  permitsAtomicCommit:false,permitsHttpReveal:false,
};
function fake(response:unknown){
  const calls:{sql:string;params:readonly unknown[]}[]=[];
  const client:PostgresTransactionQueryV1={
    async query<Row=Record<string,unknown>>(
      sql:string,params:readonly unknown[]=[],
    ):Promise<PostgresQueryResultV1<Row>>{
      calls.push({sql,params});
      return {rows:[{admission:response} as unknown as Row]};
    },
  };
  return {port:createSeyeonG1HistoricalSourceAdmissionPortV1(client),calls};
}
describe('W82 DB-issued immutable G1 source-selection admission port (HOLD)',()=>{
  it('accepts exact DB Owner admission with ALL dispatch/commit/reveal flags FALSE',async()=>{
    const {port,calls}=fake(valid);
    const received=await port.admitExactSources(input);
    expect(received).toEqual(valid);
    expect(Object.isFrozen(received)).toBe(true);
    expect(received.authorizesSourceSelection).toBe(true);
    expect(received.permitsModelDispatch).toBe(false);
    expect(received.permitsAtomicCommit).toBe(false);
    expect(received.permitsHttpReveal).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain('cmd_admit_historical_g1_model_sources_s0_v1');
    expect(calls[0]?.params).toEqual([id(1),id(2),id(3),id(4),sha('a')]);
  });
  it.each([
    ['missing admission',null],
    ['extra source field',{...valid,forgedSource:'untracked'}],
    ['forged Provider permission',{...valid,permitsModelDispatch:true}],
    ['forged Commit permission',{...valid,permitsAtomicCommit:true}],
    ['forged Reveal permission',{...valid,permitsHttpReveal:true}],
    ['substituted Grant',{...valid,originalGrantId:id(8)}],
    ['substituted record',{...valid,recordId:id(8)}],
    ['substituted candidate',{...valid,candidatePgJsonbDigest:pg('8')}],
    ['substituted Context',{...valid,finalModelContextDigest:sha('8')}],
    ['altered source window',{...valid,historicalSourceCount:3}],
    ['altered source census',{...valid,historicalSourceCensusDigest:pg('8')}],
    ['altered assistant lineage',{...valid,historicalAssistantOriginalSourcesDigest:'forged'}],
    ['not current originals',{...valid,originalsCurrentAtAdmission:false}],
    ['no source authorization',{...valid,authorizesSourceSelection:false}],
    ['invalid source digest',{...valid,projectedMemoryDigest:'invalid'}],
  ] as const)('rejects %s',async(_name,response)=>{
    const {port}=fake(response);
    await expect(port.admitExactSources(input)).rejects.toThrow(
      /source admission (receipt mismatch|unavailable)/,
    );
  });
  it.each([
    ['invalid subject',{...input,subjectId:'invalid'}],
    ['invalid Context',{...input,finalModelContextDigest:sha('x')}],
    ['invalid Grant',{...input,originalGrantId:'forged'}],
    ['zero history',{...input,historicalSourceCount:0}],
    ['too many messages',{...input,historicalSourceCount:24}],
    ['invalid original census',{...input,historicalSourceCensusDigest:sha('c')}],
  ] as const)('holds %s before database call',async(_name,bad)=>{
    const {port,calls}=fake(valid);
    await expect(port.admitExactSources(bad)).rejects.toThrow('request invalid');
    expect(calls).toHaveLength(0);
  });
});
