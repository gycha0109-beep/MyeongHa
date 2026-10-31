// Watchtower-Track: security
import {describe,expect,it} from 'vitest';
import {admitSeyeonG4FirstMemoryCreditsV1,
  SeyeonG4FirstMemoryCreditHoldV1,
  SEYEON_G4_FIRST_MEMORY_CREDIT_ADMISSION_V1}
  from '../apps/api/src/seyeon-g4-first-memory-credit-admission-v1.js';
import type {PostgresSubjectPoolV1} from '../apps/api/src/postgres-subject-execution.js';

const auth='11111111-1111-4111-8111-111111111111';
const subject='22222222-2222-4222-8222-222222222222';
const thread='33333333-3333-4333-8333-333333333333';
const turn='44444444-4444-4444-8444-444444444444';
const reservation='55555555-5555-4555-8555-555555555555';
const evidence={kind:'member' as const,verifiedAuthUserId:auth};

function database(owner:unknown={isOwnerAdmin:false,chatCreditExempt:false,
  sandboxCheckoutAllowed:false},outcome='reserved'){
  const sql:string[]=[];
  const binds:(readonly unknown[]|undefined)[]=[];
  let released=0;
  const pool:PostgresSubjectPoolV1={
    async connect(){return {
      async query<Row>(text:string,args?:readonly unknown[]){
        sql.push(text);binds.push(args);
        if(text.includes('begin_member_subject_context_v1'))
          return {rows:[{subjectId:subject,subjectKind:'member'}] as unknown as readonly Row[]};
        if(text.includes('qry_myeongha_owner_admin_access_v1'))
          return {rows:[owner] as unknown as readonly Row[]};
        if(text.includes('internal_cmd_chat_credit_reserve_v1'))
          return {rows:[{outcome,reservationId:reservation,committedTurnId:turn,
            availableCredits:'40',totalCredits:'50'}] as unknown as readonly Row[]};
        return {rows:[] as unknown as readonly Row[]};
      },
      release(){released++;},
    };},
  };
  const privateSql:string[]=[];
  const privateBinds:(readonly unknown[]|undefined)[]=[];
  let privateReleased=0;
  const privateCreditPool:PostgresSubjectPoolV1={
    async connect(){return {
      async query<Row>(text:string,args?:readonly unknown[]){
        privateSql.push(text);privateBinds.push(args);
        if(text.includes('internal_cmd_chat_credit_reserve_v1'))
          return {rows:[{outcome,reservationId:reservation,committedTurnId:turn,
            availableCredits:'40',totalCredits:'50'}] as unknown as readonly Row[]};
        return {rows:[] as readonly Row[]};
      },
      release(){privateReleased++;},
    };},
  };
  return {pool,privateCreditPool,sql,binds,privateSql,privateBinds,
    get released(){return released;},get privateReleased(){return privateReleased;}};
}
const request=(d:ReturnType<typeof database>)=>({
  pool:d.pool,privateCreditPool:d.privateCreditPool,verifiedEvidence:evidence,
  threadId:thread,clientTurnId:turn,
});

describe('G4 private first-Memory credit reservation before provider',()=>{
  it('remains unmounted until verified delivery ACK also settles the reservation',()=>{
    expect(SEYEON_G4_FIRST_MEMORY_CREDIT_ADMISSION_V1).toMatchObject({
      productionMounted:false,requiredCredits:10,settlementRequiresVerifiedDelivery:true,
    });
  });
  it('reserves ten credits for the DB-resolved Member, never an input Subject',async()=>{
    const d=database();
    const result=await admitSeyeonG4FirstMemoryCreditsV1(request(d));
    expect(result).toEqual({kind:'reserved',canonicalSubjectId:subject,
      threadId:thread,clientTurnId:turn,
      reservationId:reservation,requiredCredits:10});
    expect(d.sql[0]).toBe('BEGIN');
    expect(d.sql[1]).toBe('SET LOCAL ROLE myeongha_api_executor');
    expect(d.sql.some(q=>q.includes('internal_cmd_chat_credit_reserve_v1'))).toBe(false);
    expect(d.sql.at(-1)).toBe('COMMIT');
    expect(d.privateSql[0]).toBe('BEGIN');
    expect(d.privateSql[1]).toBe('SET LOCAL ROLE myeongha_commerce_internal_executor');
    expect(d.privateSql[2]).toContain("set_config('myeongha.subject_id'");
    expect(d.privateBinds[2]).toEqual([subject]);
    const credit=d.privateSql.findIndex(q=>q.includes('internal_cmd_chat_credit_reserve_v1'));
    expect(credit).toBeGreaterThan(2);
    expect(d.privateBinds[credit]).toEqual([subject,thread,turn]);
    expect(d.privateSql.at(-1)).toBe('COMMIT');
    expect(d.released).toBe(1);
    expect(d.privateReleased).toBe(1);
  });
  it('exempts only a DB-verified Owner Admin without allocating credits',async()=>{
    const d=database({isOwnerAdmin:true,chatCreditExempt:true,sandboxCheckoutAllowed:true});
    await expect(admitSeyeonG4FirstMemoryCreditsV1(request(d))).resolves.toEqual({
      kind:'owner_admin_exempt',canonicalSubjectId:subject,requiredCredits:0,
    });
    expect(d.privateSql).toHaveLength(0);
    expect(d.privateReleased).toBe(0);
  });
  it.each(['insufficient','conflict','committed_replay','already_reserved'])(
    'rolls back %s instead of issuing new model admission',async outcome=>{
      const d=database(undefined,outcome);
      await expect(admitSeyeonG4FirstMemoryCreditsV1(request(d)))
        .rejects.toBeInstanceOf(SeyeonG4FirstMemoryCreditHoldV1);
      expect(d.sql.at(-1)).toBe('COMMIT');
      expect(d.privateSql.at(-1)).toBe('ROLLBACK');
      expect(d.privateSql).not.toContain('COMMIT');
      expect(d.privateReleased).toBe(1);
    });
  it('rejects a shared ordinary/private pool before any DB transaction',async()=>{
    const d=database();
    await expect(admitSeyeonG4FirstMemoryCreditsV1({
      ...request(d),privateCreditPool:d.pool,
    })).rejects.toBeInstanceOf(SeyeonG4FirstMemoryCreditHoldV1);
    expect(d.sql).toHaveLength(0);
    expect(d.privateSql).toHaveLength(0);
  });
  it('denies guest and spoofed Owner flags before credit spending',async()=>{
    const d=database();
    await expect(admitSeyeonG4FirstMemoryCreditsV1({
      ...request(d),verifiedEvidence:{kind:'guest',verifiedGuestTokenHash:'guest'} as never,
    })).rejects.toBeInstanceOf(SeyeonG4FirstMemoryCreditHoldV1);
    expect(d.sql).toHaveLength(0);
    expect(d.privateSql).toHaveLength(0);
    const forged=database({isOwnerAdmin:false,chatCreditExempt:true,
      sandboxCheckoutAllowed:false});
    await expect(admitSeyeonG4FirstMemoryCreditsV1(request(forged)))
      .rejects.toBeInstanceOf(SeyeonG4FirstMemoryCreditHoldV1);
    expect(forged.sql.at(-1)).toBe('ROLLBACK');
    expect(forged.privateSql).toHaveLength(0);
  });
});
