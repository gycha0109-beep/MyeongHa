// Watchtower-Track: security
import {describe,expect,it} from 'vitest';
import {
  createSeyeonG1HistoricalCurrentOriginalsAuditPortV1,
} from '../apps/api/src/postgres-seyeon-g1-historical-current-audit-port-v1.js';
import type {
  PostgresTransactionQueryV1,PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const req={
  subjectId:id(1),threadId:id(2),turnId:id(3),attemptId:id(4),
  expectedHistoricalSourceCount:2,
};
const receipt={
  schemaVersion:'seyeon-historical-current-originals-audit-s0-v1',
  historicalSourceCount:2,originalsCurrentForAudit:true,
  authorizesModel:false,permitsAtomicCommit:false,permitsHttpReveal:false,
};
const fake=(audit:unknown)=>{
  const calls:{sql:string;params:readonly unknown[]}[]=[];
  const client:PostgresTransactionQueryV1={
    async query<Row=Record<string,unknown>>(
      sql:string,params:readonly unknown[]=[],
    ):Promise<PostgresQueryResultV1<Row>>{
      calls.push({sql,params});
      return {rows:[{audit} as unknown as Row]};
    },
  };
  return {port:createSeyeonG1HistoricalCurrentOriginalsAuditPortV1(client),calls};
};
describe('G1/G2 historical original-rights audit owner port (HOLD)',()=>{
  it('accepts only the exact current-rights audit receipt, never authority',async()=>{
    const {port,calls}=fake(receipt);
    const got=await port.recheckCurrentOriginals(req);
    expect(got).toEqual(receipt);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain('qry_recheck_historical_candidate_originals_s0_v1');
    expect(calls[0]?.params).toEqual([id(1),id(2),id(3),id(4)]);
    expect(got.authorizesModel).toBe(false);
    expect(got.permitsAtomicCommit).toBe(false);
    expect(got.permitsHttpReveal).toBe(false);
  });
  it.each([
    ['changed original count',{historicalSourceCount:1}],
    ['forged model permission',{authorizesModel:true}],
    ['forged commit permission',{permitsAtomicCommit:true}],
    ['forged reveal permission',{permitsHttpReveal:true}],
    ['removed current authority',{originalsCurrentForAudit:false}],
    ['wrong schema',{schemaVersion:'other'}],
    ['unrecognized extra authority',{modelAuthorized:true}],
  ] as const)('rejects %s receipt',async(_label,patch)=>{
    const {port}=fake({...receipt,...patch});
    await expect(port.recheckCurrentOriginals(req)).rejects.toThrow('receipt mismatch');
  });
  it.each([
    ['unknown Attempt',{...req,attemptId:'not-an-uuid'}],
    ['zero sources',{...req,expectedHistoricalSourceCount:0}],
    ['too many sources',{...req,expectedHistoricalSourceCount:24}],
  ] as const)('holds %s before querying',async(_label,invalid)=>{
    const {port,calls}=fake(receipt);
    await expect(port.recheckCurrentOriginals(invalid)).rejects.toThrow('input invalid');
    expect(calls).toHaveLength(0);
  });
});
