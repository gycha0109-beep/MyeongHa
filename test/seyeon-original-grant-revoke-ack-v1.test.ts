// Watchtower-Track: security
import { describe, expect, it } from 'vitest';
import type {
  PostgresSubjectPoolV1,
  PostgresSubjectConnectionV1,
  PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';
import {
  revokeSeyeonOriginalMemoryGrantAndAckV1,
  SeyeonOriginalGrantRevokeAckErrorV1,
} from '../apps/api/src/seyeon-original-grant-revoke-ack-v1.js';

const AUTH_USER = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const MEMORY = '33333333-3333-4333-8333-333333333333';
const evidence = {kind:'member' as const, verifiedAuthUserId:AUTH_USER};

function fakeRevokeDb(input: {
  rows?: readonly Record<string,unknown>[];
  commit?: () => Promise<void>;
} = {}) {
  const events:string[] = [];
  let args:readonly unknown[] = [];
  const client:PostgresSubjectConnectionV1 = {
    async query<Row>(sql:string, values?:readonly unknown[]):Promise<PostgresQueryResultV1<Row>>{
      if(sql === 'BEGIN' || sql === 'ROLLBACK' || sql.startsWith('SET LOCAL')) {
        events.push(sql);
        return {rows:[]};
      }
      if(sql === 'COMMIT') {
        events.push('COMMIT:started');
        await input.commit?.();
        events.push('COMMIT:completed');
        return {rows:[]};
      }
      if(sql.includes('begin_member_subject_context_v1')){
        events.push('resolve:verified');
        expect(values).toEqual([AUTH_USER]);
        return {rows:[{subjectId:OWNER,subjectKind:'member'}] as Row[]};
      }
      if(sql.includes('assert_myeongha_subject_context_v1')){
        expect(values).toEqual([OWNER]);
        return {rows:[]};
      }
      if(sql.includes('cmd_revoke_memory_character_grant_v1') ||
         sql.includes('cmd_revoke_seyeon_memory_grant_v1')){
        events.push('revoke:subject-for-update');
        args=values??[];
        return {rows:(input.rows ?? [{
          memoryItemId:MEMORY,characterId:'seyeon',
          revokedGrantCount:1,replayed:false,
        }]) as Row[]};
      }
      throw Error('Unexpected SQL executed');
    },
    release(error?:unknown){
      events.push(error===undefined?'release':'discard');
    },
  };
  const pool:PostgresSubjectPoolV1={connect:async()=>client};
  return {pool,events,get args(){return args;}};
}

describe('R15 verified-member original Grant revoke ACK',()=>{
  it('never acknowledges until PostgreSQL COMMIT and uses canonical owner + exact seyeon character',async()=>{
    let resolveCommit!:()=>void;
    const commitGate=new Promise<void>(resolve=>{resolveCommit=resolve;});
    let markCommitStarted!:()=>void;
    const commitStarted=new Promise<void>(resolve=>{markCommitStarted=resolve;});
    const db=fakeRevokeDb({commit:async()=>{markCommitStarted();await commitGate;}});
    let acknowledged=false;
    const pending=revokeSeyeonOriginalMemoryGrantAndAckV1({
      pool:db.pool,verifiedEvidence:evidence,memoryItemId:MEMORY,
    }).then(value=>{acknowledged=true;return value;});
    await commitStarted;
    expect(acknowledged).toBe(false);
    expect(db.args).toEqual([OWNER,MEMORY,'seyeon']);
    expect(db.events).toContain('revoke:subject-for-update');
    resolveCommit();
    const result=await pending;
    expect(result).toEqual({
      status:'committed',memoryItemId:MEMORY,
      characterId:'seyeon',revokedGrantCount:1,replayed:false,
    });
    expect(acknowledged).toBe(true);
    expect(db.events.indexOf('COMMIT:completed'))
      .toBeLessThan(db.events.indexOf('release'));
  });

  it('returns state-derived replay after COMMIT and rejects guest/invalid identity before any DB connection',async()=>{
    const db=fakeRevokeDb({rows:[{
      memoryItemId:MEMORY,characterId:'seyeon',
      revokedGrantCount:0,replayed:true,
    }]});
    await expect(revokeSeyeonOriginalMemoryGrantAndAckV1({
      pool:db.pool,verifiedEvidence:evidence,memoryItemId:MEMORY,
    })).resolves.toMatchObject({status:'committed',replayed:true,revokedGrantCount:0});
    expect(db.events).toContain('COMMIT:completed');

    const empty=fakeRevokeDb();
    await expect(revokeSeyeonOriginalMemoryGrantAndAckV1({
      pool:empty.pool,
      verifiedEvidence:{kind:'guest',verifiedGuestTokenHash:'synthetic'},
      memoryItemId:MEMORY,
    })).rejects.toBeInstanceOf(SeyeonOriginalGrantRevokeAckErrorV1);
    await expect(revokeSeyeonOriginalMemoryGrantAndAckV1({
      pool:empty.pool,verifiedEvidence:evidence,memoryItemId:'bad',
    })).rejects.toMatchObject({code:'INVALID_MEMORY_ID'});
    expect(empty.events).toEqual([]);
  });


  it('uses the private two-argument owner command only when explicitly selected and still waits for COMMIT',async()=>{
    const db=fakeRevokeDb();
    const result=await revokeSeyeonOriginalMemoryGrantAndAckV1({
      pool:db.pool,verifiedEvidence:evidence,memoryItemId:MEMORY,
      dbCommand:'private_candidate',
    });
    expect(db.args).toEqual([OWNER,MEMORY]);
    expect(result.status).toBe('committed');
    expect(db.events).toContain('COMMIT:completed');
    expect(db.events.indexOf('COMMIT:completed')).toBeLessThan(db.events.indexOf('release'));
  });

  it('never reports success after a failed or ambiguous COMMIT',async()=>{
    const db=fakeRevokeDb({commit:async()=>{throw Error('commit reply lost');}});
    await expect(revokeSeyeonOriginalMemoryGrantAndAckV1({
      pool:db.pool,verifiedEvidence:evidence,memoryItemId:MEMORY,
    })).rejects.toThrow('commit reply lost');
    expect(db.events).toContain('COMMIT:started');
    expect(db.events).not.toContain('COMMIT:completed');
    expect(db.events).toContain('ROLLBACK');
  });
});
