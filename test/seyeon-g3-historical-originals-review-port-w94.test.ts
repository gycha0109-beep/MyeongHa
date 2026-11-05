// Watchtower-Track: security
import {describe,expect,it} from 'vitest';
import {
  createSeyeonG3HistoricalOriginalsReviewPortV1,
  SeyeonG3HistoricalOriginalsReviewHoldV1,
} from '../apps/api/src/postgres-seyeon-g3-historical-originals-review-port-v1.js';
import type {PostgresTransactionQueryV1,PostgresQueryResultV1}
  from '../apps/api/src/postgres-subject-execution.js';

const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const input={
  subjectId:id(1),threadId:id(2),turnId:id(3),attemptId:id(4),
  purpose:'audit_only' as const,historicalSourceCount:2,
};
const first={
  ...input,purpose:'first' as const,
  expectedUserMessageId:id(5),expectedAssistantMessageId:id(6),
  expectedPostTurnOutboxEventId:id(7),expectedClientTurnId:'synthetic-first-1',
};
const valid={
  schemaVersion:'seyeon-g3-historical-current-originals-review-s0-v1',
  historicalSourceCount:2,originalsCurrentForReview:true,
  authorizesFirstReveal:false,authorizesCommittedReplay:false,
  permitsStreaming:false,permitsHttpReveal:false,
};
function fake(raw:unknown,throwSql=false){
  const calls:{sql:string;params:readonly unknown[]}[]=[];
  const client:PostgresTransactionQueryV1={
    async query<Row=Record<string,unknown>>(
      sql:string,params:readonly unknown[]=[],
    ):Promise<PostgresQueryResultV1<Row>>{
      calls.push({sql,params});
      if(throwSql)throw Error('PRIVATE_DB_GRANT_INTERNAL_DETAIL');
      return {rows:[{review:raw} as unknown as Row]};
    },
  };
  return {port:createSeyeonG3HistoricalOriginalsReviewPortV1(client),calls};
}
describe('W94 restricted G3 historical original-rights DB review port (HOLD)',()=>{
  it('accepts audit-only current-original review without creating Reveal rights',async()=>{
    const {port,calls}=fake(valid);
    const r=await port.reviewCurrentOriginals(input);
    expect(r).toEqual(valid);
    expect(Object.isFrozen(r)).toBe(true);
    expect(r.authorizesFirstReveal).toBe(false);
    expect(r.authorizesCommittedReplay).toBe(false);
    expect(r.permitsHttpReveal).toBe(false);
    expect(r.permitsStreaming).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain(
      'qry_review_historical_first_reveal_originals_s0_v1',
    );
    expect(calls[0]?.params).toEqual([
      id(1),id(2),id(3),id(4),'audit_only',null,null,null,null,
    ]);
  });
  it('passes exact first-Review original locators only to private DB; no Reply returned',async()=>{
    const {port,calls}=fake(valid);
    const r=await port.reviewCurrentOriginals(first);
    expect(r).toEqual(valid);
    expect(calls[0]?.params).toEqual([
      id(1),id(2),id(3),id(4),'first',id(5),id(6),id(7),
      'synthetic-first-1',
    ]);
    expect('assistantText' in r).toBe(false);
  });
  it.each([
    ['nil',null],
    ['nonobject',[]],
    ['extra private assistant text',{...valid,assistantText:'PRIVATE_CANARY'}],
    ['altered source count',{...valid,historicalSourceCount:3}],
    ['other version',{...valid,schemaVersion:'forged'}],
    ['current originals false',{...valid,originalsCurrentForReview:false}],
    ['forged first Reveal permit',{...valid,authorizesFirstReveal:true}],
    ['forged replay permit',{...valid,authorizesCommittedReplay:true}],
    ['forged streaming permit',{...valid,permitsStreaming:true}],
    ['forged HTTP permit',{...valid,permitsHttpReveal:true}],
  ] as const)('fails closed for %s',async(_name,raw)=>{
    const {port}=fake(raw);
    await expect(port.reviewCurrentOriginals(input))
      .rejects.toBeInstanceOf(SeyeonG3HistoricalOriginalsReviewHoldV1);
  });
  it.each([
    ['replay',{...input,purpose:'committed_replay'}],
    ['invalid subject',{...input,subjectId:'fake'}],
    ['empty sources',{...input,historicalSourceCount:0}],
    ['too many sources',{...input,historicalSourceCount:24}],
    ['unexpected first locators in audit',{...input,expectedAssistantMessageId:id(6)}],
    ['audit optional locator present but undefined',{
      ...input,expectedAssistantMessageId:undefined,
    }],
    ['extra private body',{...input,assistantText:'PRIVATE_CANARY'}],
    ['forged first permit',{...input,authorizesFirstReveal:true}],
    ['forged replay permit',{...first,authorizesCommittedReplay:true}],
    ['forged source record',{...first,originalRecordId:id(9)}],
    ['non-enumerable extra object key',Object.defineProperty(
      {...input},'privateSource',{value:'PRIVATE_CANARY',enumerable:false},
    )],
    ['missing first message',{...first,expectedAssistantMessageId:undefined}],
    ['incorrect original User',{...first,expectedUserMessageId:'forged'}],
    ['invalid post-turn Outbox',{...first,expectedPostTurnOutboxEventId:'forged'}],
    ['empty Client Turn',{...first,expectedClientTurnId:''}],
    ['space-padded Client Turn',{...first,expectedClientTurnId:' test '}],
    ['oversized Client Turn',{...first,expectedClientTurnId:'a'.repeat(257)}],
  ] as const)('rejects %s before any DB call',async(_name,request)=>{
    const {port,calls}=fake(valid);
    await expect(port.reviewCurrentOriginals(request as never))
      .rejects.toBeInstanceOf(SeyeonG3HistoricalOriginalsReviewHoldV1);
    expect(calls).toHaveLength(0);
  });
  it('treats hostile Client Turn text ONLY as a parameter, not SQL',async()=>{
    const injection="client-turn-x'); drop table public.memory_items; --";
    const {port,calls}=fake(valid);
    const receipt=await port.reviewCurrentOriginals({
      ...first,expectedClientTurnId:injection,
    });
    expect(receipt.permitsHttpReveal).toBe(false);
    expect(receipt.authorizesFirstReveal).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.params[8]).toBe(injection);
    expect(calls[0]?.sql).toContain('$9::text');
    expect(calls[0]?.sql).not.toContain(injection);
    expect(calls[0]?.sql).not.toContain('drop table');
  });
  it('does not turn DB exceptions into a disclosure or permit',async()=>{
    const {port}=fake(valid,true);
    await expect(port.reviewCurrentOriginals(input)).rejects.toMatchObject({
      code:'SEYEON_G3_HISTORICAL_ORIGINALS_REVIEW_HOLD',
      message:'Historical G3 original rights review unavailable.',
    });
  });
});
