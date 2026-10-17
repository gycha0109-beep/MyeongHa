import { describe, expect, it } from 'vitest';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  observeOfficialReaderUnknownCommitWithMinimalReadV1,
  createOfficialReaderUnknownCommitReadTransactionV1,
} from './postgres-official-reader-unknown-commit-read-tx-v1.js';
import {
  MINIMAL_UNKNOWN_COMMIT_READ_SQL,
} from './official-reader-unknown-commit-minimal-v1.js';

const subject='11390000-0000-0000-0000-000000000001';
const receipt='33333333-3333-4333-8333-333333333333';
const begin='BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY';
const role='SET LOCAL ROLE myeongha_api_executor';
const bind="select pg_catalog.set_config('myeongha.subject_id',$1,true)";

function mock(observation: unknown = 'NO_COMMITTED_EFFECT_VISIBLE', failSql?: string) {
  const calls: Array<{sql:string; values:readonly unknown[]|undefined}> = [];
  const released: unknown[] = [];
  let connectionCount=0;
  const pool: PostgresSubjectPoolV1={
    async connect() {
      connectionCount++;
      return {
        async query<Row=Record<string,unknown>>(sql:string, values?:readonly unknown[]) {
          calls.push({sql,values});
          if (failSql === sql) throw new Error('simulated DB error');
          return {rows: (
            sql===MINIMAL_UNKNOWN_COMMIT_READ_SQL ? [{observation}] : []
          ) as readonly Row[]};
        },
        release(error?:unknown) {released.push(error);},
      };
    },
  };
  return {pool,calls,released,get connectionCount(){return connectionCount;}};
}

describe('M1-17 approved minimal HOLD-only read transaction',()=>{
  it('sets trusted subject after app role and returns only one classified result', async()=>{
    const m=mock('COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY');
    const result=await observeOfficialReaderUnknownCommitWithMinimalReadV1({
      pool:m.pool,verifiedSubjectId:subject,receiptId:receipt,
    });
    expect(result).toEqual({
      status:'held',reason:'COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY',
      automaticRetryAuthorized:false,publicDisclosureAuthorized:false,
    });
    expect(m.calls.map(x=>x.sql)).toEqual([
      'ROLLBACK',begin,role,bind,MINIMAL_UNKNOWN_COMMIT_READ_SQL,'COMMIT',
    ]);
    expect(m.calls[3]?.values).toEqual([subject]);
    expect(m.calls[4]?.values).toEqual([subject,receipt]);
    expect(m.released).toEqual([undefined]);
  });

  it.each([
    'SOURCE_UNAVAILABLE','NO_COMMITTED_EFFECT_VISIBLE',
    'COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY',
    'INCOMPLETE_OR_CONFLICTING_AUTHORITY','STALE_SNAPSHOT_UNSUPPORTED',
  ])('never promotes observation %s to issuance or paid Reader',async(observation)=>{
    const m=mock(observation);
    const result=await observeOfficialReaderUnknownCommitWithMinimalReadV1({
      pool:m.pool,verifiedSubjectId:subject,receiptId:receipt,
    });
    expect(result.reason).toEqual(observation);
    expect(result.automaticRetryAuthorized).toBe(false);
    expect(result.publicDisclosureAuthorized).toBe(false);
  });

  it('invalid Receipt never borrows DB connection',async()=>{
    const m=mock();
    const result=await observeOfficialReaderUnknownCommitWithMinimalReadV1({
      pool:m.pool,verifiedSubjectId:subject,receiptId:'not-a-uuid',
    });
    expect(result.reason).toBe('SOURCE_UNAVAILABLE');
    expect(m.connectionCount).toBe(0);
  });

  it.each(['arbitrary SQL','',undefined])('denies noncanonical SQL %s in subject-bound transaction',async(sql)=>{
    const m=mock();
    const tx=createOfficialReaderUnknownCommitReadTransactionV1(m.pool,subject);
    await expect(tx.execute(async client=>client.query(sql as string,[subject,receipt])))
      .rejects.toThrow('only one canonical read-only Receipt query');
    expect(m.calls.map(x=>x.sql)).toEqual(['ROLLBACK',begin,role,bind,'ROLLBACK']);
    expect(m.released).toEqual([undefined]);
  });

  it('cannot execute old full-ledger query inside subject-bound minimal port',async()=>{
    const m=mock();
    const tx=createOfficialReaderUnknownCommitReadTransactionV1(m.pool,subject);
    await expect(tx.execute(async client=>client.query(
      'select * from public.commerce_receipts',[receipt],
    ))).rejects.toThrow();
    expect(m.calls.map(x=>x.sql).filter(x=>/commerce_receipts/u.test(x))).toHaveLength(0);
  });

  it('rolls back on subject binding error and returns nonauthorizing HOLD',async()=>{
    const m=mock('NO_COMMITTED_EFFECT_VISIBLE',bind);
    const result=await observeOfficialReaderUnknownCommitWithMinimalReadV1({
      pool:m.pool,verifiedSubjectId:subject,receiptId:receipt,
    });
    expect(result.reason).toBe('SOURCE_UNAVAILABLE');
    expect(m.calls.map(x=>x.sql)).toEqual(['ROLLBACK',begin,role,bind,'ROLLBACK']);
    expect(m.released).toEqual([undefined]);
  });

  it('never treats malformed DB enums as purchased authority',async()=>{
    const m=mock({grantId:'secret'});
    const result=await observeOfficialReaderUnknownCommitWithMinimalReadV1({
      pool:m.pool,verifiedSubjectId:subject,receiptId:receipt,
    });
    expect(result.reason).toBe('SOURCE_UNAVAILABLE');
    expect(result.automaticRetryAuthorized).toBe(false);
  });

  it('denies forwarding a different claimed subject to an existing trusted lease',async()=>{
    const m=mock();
    const tx=createOfficialReaderUnknownCommitReadTransactionV1(m.pool,subject);
    await expect(tx.execute(async client=>client.query(
      MINIMAL_UNKNOWN_COMMIT_READ_SQL,
      ['00000000-0000-4000-8000-000000000001',receipt],
    ))).rejects.toThrow();
    expect(m.calls.map(x=>x.sql)).toEqual(['ROLLBACK',begin,role,bind,'ROLLBACK']);
  });
});
