// Watchtower-Track: security
import {describe,expect,it} from 'vitest';
import {reconcileSeyeonG4FirstMemoryCreditsV1,
  SeyeonG4FirstMemoryReconciliationHoldV1,
  SEYEON_G4_FIRST_MEMORY_RECONCILIATION_V1}
  from '../apps/api/src/seyeon-g4-first-memory-credit-reconciliation-v1.js';
import type {PostgresSubjectPoolV1}
  from '../apps/api/src/postgres-subject-execution.js';

const auth='11111111-1111-4111-8111-111111111111';
const subject='22222222-2222-4222-8222-222222222222';
const thread='33333333-3333-4333-8333-333333333333';
const turn='44444444-4444-4444-8444-444444444444';
const reservation='55555555-5555-4555-8555-555555555555';
const committed='66666666-6666-4666-8666-666666666666';
const assistant='77777777-7777-4777-8777-777777777777';
const admission={kind:'reserved' as const,canonicalSubjectId:subject,
  threadId:thread,clientTurnId:turn,reservationId:reservation,requiredCredits:10 as const};
const evidence={kind:'member' as const,verifiedAuthUserId:auth};

function db({acked='settled',failedProof=true,finalized='released',resolved=subject,matchingReservation=true}:
  {acked?:string;failedProof?:boolean;finalized?:string;resolved?:string;matchingReservation?:boolean}={}){
  const calls:{sql:string;params:readonly unknown[]|undefined}[]=[];
  let releases=0;
  const pool:PostgresSubjectPoolV1={
    async connect(){return {
      async query<Row>(sql:string,params?:readonly unknown[]){
        calls.push({sql,params});
        if(sql.includes('begin_member_subject_context_v1')){
          return {rows:[{subjectId:resolved,subjectKind:'member'}] as unknown as readonly Row[]};
        }
        if(sql.includes('from public.subjects where id='))
          return {rows:[{subjectId:resolved}] as unknown as readonly Row[]};
        if(sql.includes('from public.chat_credit_turn_reservations_v1 where id='))
          return {rows:(matchingReservation?[{reservationId:reservation}]:[]) as unknown as readonly Row[]};
        if(sql.includes('internal_cmd_chat_credit_ack_delivered_proven_v2'))
          return {rows:[{state:acked}] as unknown as readonly Row[]};
        if(sql.includes("ct.state in ('failed_retryable','failed_final','abandoned')"))
          return {rows:(failedProof?[{reservationId:reservation}]:[]) as unknown as readonly Row[]};
        if(sql.includes('internal_cmd_chat_credit_finalize_v1'))
          return {rows:[{state:finalized}] as unknown as readonly Row[]};
        return {rows:[] as readonly Row[]};
      },
      release(){releases++;},
    };},
  };
  return {pool,calls,get releases(){return releases;}};
}
const confirmed={kind:'confirmed_delivered' as const,
  committedTurnId:committed,assistantMessageId:assistant};
const failed={kind:'definitive_undelivered' as const};

describe('G4 private first Memory original-delivery reconciliation',()=>{
  it('remains unmounted and cannot equate socket finish with confirmed user receipt',()=>{
    expect(SEYEON_G4_FIRST_MEMORY_RECONCILIATION_V1).toEqual({
      productionMounted:false,chargeRequiresOriginalDeliveredDbProof:true,
      releaseRequiresFinalUndeliveredDbProof:true,socketFinishIsNotDeliveryReceipt:true,
    });
  });
  it('settles ten credits only with exact DB-owned positive delivery proof',async()=>{
    const t=db();
    const result=await reconcileSeyeonG4FirstMemoryCreditsV1({
      pool:t.pool,verifiedEvidence:evidence,admission,proof:confirmed,
    });
    expect(result).toEqual({kind:'settled',creditsCharged:10});
    const ack=t.calls.find(x=>x.sql.includes('internal_cmd_chat_credit_ack_delivered_proven_v2'));
    expect(ack?.params).toEqual([subject,thread,turn,reservation,committed,assistant]);
    expect(t.calls[0]?.sql).toBe('BEGIN');
    expect(t.calls.at(-1)?.sql).toBe('COMMIT');
    expect(t.releases).toBe(1);
    expect(t.calls.some(x=>x.sql.includes('internal_cmd_chat_credit_finalize_v1'))).toBe(false);
  });
  it('releases only after a DB-proven terminal failure and never charges',async()=>{
    const t=db();
    expect(await reconcileSeyeonG4FirstMemoryCreditsV1({
      pool:t.pool,verifiedEvidence:evidence,admission,proof:failed,
    })).toEqual({kind:'released',creditsCharged:0});
    const subjectLock=t.calls.findIndex(x=>x.sql.includes('from public.subjects where id='));
    const reservationLock=t.calls.findIndex(x=>x.sql.includes('from public.chat_credit_turn_reservations_v1 where id='));
    const failureProof=t.calls.findIndex(x=>x.sql.includes("ct.state in ('failed_retryable'"));
    expect(subjectLock).toBeGreaterThan(-1);
    expect(reservationLock).toBeGreaterThan(subjectLock);
    expect(failureProof).toBeGreaterThan(reservationLock);
    expect(t.calls[reservationLock]?.params).toEqual([reservation,subject,thread,turn]);
    expect(t.calls.find(x=>x.sql.includes("ct.state in ('failed_retryable'"))?.params)
      .toEqual([subject,reservation]);
    expect(t.calls.find(x=>x.sql.includes('internal_cmd_chat_credit_finalize_v1'))?.params)
      .toEqual([subject,reservation,false,null]);
    expect(t.calls.at(-1)?.sql).toBe('COMMIT');
  });
  it('holds and rolls back when delivery DB authority rejects a reported ACK',async()=>{
    const t=db({acked:'rejected'});
    await expect(reconcileSeyeonG4FirstMemoryCreditsV1({
      pool:t.pool,verifiedEvidence:evidence,admission,proof:confirmed,
    })).rejects.toThrow('not settled');
    expect(t.calls.at(-1)?.sql).toBe('ROLLBACK');
    expect(t.releases).toBe(1);
  });
  it('never checks Turn or refunds if the original reservation is no longer held',async()=>{
    const t=db({matchingReservation:false});
    await expect(reconcileSeyeonG4FirstMemoryCreditsV1({
      pool:t.pool,verifiedEvidence:evidence,admission,proof:failed,
    })).rejects.toBeInstanceOf(SeyeonG4FirstMemoryReconciliationHoldV1);
    expect(t.calls.at(-1)?.sql).toBe('ROLLBACK');
    expect(t.calls.some(x=>x.sql.includes("ct.state in ('failed_retryable'"))).toBe(false);
    expect(t.calls.some(x=>x.sql.includes('internal_cmd_chat_credit_finalize_v1'))).toBe(false);
  });
  it('never releases on a network failure without final DB non-delivery proof',async()=>{
    const t=db({failedProof:false});
    await expect(reconcileSeyeonG4FirstMemoryCreditsV1({
      pool:t.pool,verifiedEvidence:evidence,admission,proof:failed,
    })).rejects.toThrow('non-delivery proof');
    expect(t.calls.at(-1)?.sql).toBe('ROLLBACK');
    expect(t.calls.some(x=>x.sql.includes('internal_cmd_chat_credit_finalize_v1'))).toBe(false);
  });
  it('denies forged subject, Guest, wrong reservation or forged receipt IDs before settlement',async()=>{
    const guest=db();
    await expect(reconcileSeyeonG4FirstMemoryCreditsV1({
      pool:guest.pool,verifiedEvidence:{kind:'guest'} as never,
      admission,proof:confirmed,
    })).rejects.toBeInstanceOf(SeyeonG4FirstMemoryReconciliationHoldV1);
    expect(guest.calls).toHaveLength(0);

    const wrong=db({resolved:'88888888-8888-4888-8888-888888888888'});
    await expect(reconcileSeyeonG4FirstMemoryCreditsV1({
      pool:wrong.pool,verifiedEvidence:evidence,admission,proof:confirmed,
    })).rejects.toBeInstanceOf(SeyeonG4FirstMemoryReconciliationHoldV1);
    expect(wrong.calls.at(-1)?.sql).toBe('ROLLBACK');

    const invalid=db();
    await expect(reconcileSeyeonG4FirstMemoryCreditsV1({
      pool:invalid.pool,verifiedEvidence:evidence,
      admission:{...admission,reservationId:'invalid'},
      proof:confirmed,
    })).rejects.toBeInstanceOf(SeyeonG4FirstMemoryReconciliationHoldV1);
    await expect(reconcileSeyeonG4FirstMemoryCreditsV1({
      pool:invalid.pool,verifiedEvidence:evidence,admission,
      proof:{...confirmed,assistantMessageId:'invalid'},
    })).rejects.toBeInstanceOf(SeyeonG4FirstMemoryReconciliationHoldV1);
    expect(invalid.calls).toHaveLength(0);
  });
});
