// Watchtower-Track: security
// S0 G1 immutable historical final-context receipt never grants AI or Commit.
import {describe,expect,it} from 'vitest';
import {
  createSeyeonG1HistoricalFinalContextSealPortV1,
} from '../apps/api/src/postgres-seyeon-g1-historical-final-context-seal-port-v1.js';
import type {
  PostgresTransactionQueryV1,PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const finalDigest='sha256:v1:'+'a'.repeat(64);
const preDigest='sha256:v1:'+'b'.repeat(64);
const req={
  subjectId:id(1),threadId:id(2),turnId:id(3),attemptId:id(4),
  actualFinalModelContextDigest:finalDigest,preModelContextDigest:preDigest,
  historicalSourceCount:2,
};
const seal={
  schemaVersion:'seyeon-g1-historical-final-context-seal-s0-v1',
  subjectId:id(1),threadId:id(2),turnId:id(3),attemptId:id(4),
  candidatePgJsonbDigest:'sha256:pg-jsonb:v1:'+'c'.repeat(64),
  finalModelContextDigest:finalDigest,preModelContextDigest:preDigest,
  historicalSourceCount:2,originalsCurrentAtSeal:true,
  authorizesModel:false,permitsAtomicCommit:false,permitsHttpReveal:false,
};
const fake=(reply:unknown)=>{
  const calls:{sql:string;params:readonly unknown[]}[]=[];
  const client:PostgresTransactionQueryV1={
    async query<Row=Record<string,unknown>>(
      sql:string,params:readonly unknown[]=[],
    ):Promise<PostgresQueryResultV1<Row>>{
      calls.push({sql,params});
      return {rows:[{seal:reply} as unknown as Row]};
    },
  };
  return {port:createSeyeonG1HistoricalFinalContextSealPortV1(client),calls};
};
describe('S0 G1 immutable historical final Context database seal (HOLD)',()=>{
  it('seals exact source fingerprint but never admits a model or Commit/Reveal',async()=>{
    const {port,calls}=fake(seal);
    const got=await port.sealAfterContextVerification(req);
    expect(got).toEqual(seal);
    expect(Object.isFrozen(got)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain('cmd_seal_historical_final_context_s0_v1');
    expect(calls[0]?.params).toEqual([
      id(1),id(2),id(3),id(4),finalDigest,preDigest,
    ]);
    expect(got.authorizesModel).toBe(false);
    expect(got.permitsAtomicCommit).toBe(false);
    expect(got.permitsHttpReveal).toBe(false);
  });
  it.each([
    ['altered actual final context',{finalModelContextDigest:'sha256:v1:'+'d'.repeat(64)}],
    ['altered original candidate',{candidatePgJsonbDigest:'invalid'}],
    ['altered pre-model input',{preModelContextDigest:'sha256:v1:'+'d'.repeat(64)}],
    ['wrong historical source count',{historicalSourceCount:1}],
    ['substituted Attempt',{attemptId:id(9)}],
    ['incorrect current original status',{originalsCurrentAtSeal:false}],
    ['forged model permission',{authorizesModel:true}],
    ['forged Commit permission',{permitsAtomicCommit:true}],
    ['forged Reveal permission',{permitsHttpReveal:true}],
    ['unlisted source attribute',{historicalSource:'fake'}],
  ] as const)('rejects %s in immutable receipt',async(_label,extra)=>{
    const {port}=fake({...seal,...extra});
    await expect(port.sealAfterContextVerification(req))
      .rejects.toThrow('receipt mismatch');
  });
  it.each([
    ['invalid subject',{...req,subjectId:'forged'}],
    ['invalid context digest',{...req,actualFinalModelContextDigest:'sha256:v1:broken'}],
    ['missing original history',{...req,historicalSourceCount:0}],
    ['oversized original history',{...req,historicalSourceCount:24}],
  ] as const)('holds %s before owner call',async(_label,changed)=>{
    const {port,calls}=fake(seal);
    await expect(port.sealAfterContextVerification(changed))
      .rejects.toThrow('input invalid');
    expect(calls).toHaveLength(0);
  });
});
