import {describe,expect,it} from 'vitest';
import {createAccountDeletionWorkerRuntimeV1} from './production-account-deletion-worker-runtime.js';
import type {AccountDeletionWorkerResumePhaseV1} from './account-deletion-worker-orchestration.js';
import type {PostgresAccountDeletionWorkerPortsV1} from './postgres-account-deletion-worker.js';
import type {SupabaseAuthAdminUserDeletionPortV1} from './supabase-auth-admin-user-deletion.js';
import type {AdminAnalyticsEventStoreV1} from './admin-analytics-pipeline-v1.js';
import {deriveAdminAnalyticsReferenceV1} from './admin-analytics-pipeline-v1.js';

const SUBJECT='22222222-2222-4222-8222-222222222222';
const JOB='33333333-3333-4333-8333-333333333333';
const OUTBOX='44444444-4444-4444-8444-444444444444';
const AUTH='11111111-1111-4111-8111-111111111111';
const SECRET='synthetic-secret-with-over-thirty-two-bytes';
const command={outboxEventId:OUTBOX,lockOwner:'test-worker',leaseExpiresAt:'2026-11-01T00:00:00Z'};
function harness(options:{failErase?:boolean;withAnalytics?:boolean}={}){
  const calls:string[]=[];let phase:AccountDeletionWorkerResumePhaseV1='db_finalization_required';
  const ports:PostgresAccountDeletionWorkerPortsV1={
    claimPort:{async claimEvent(){calls.push('claim');return{outboxEventId:OUTBOX,subjectId:SUBJECT,deletionJobId:JOB,reclaimed:false};}},
    resumeStatePort:{async readResumeState(){calls.push('resume');return{subjectId:SUBJECT,deletionJobId:JOB,phase,
      authUserId:phase==='db_finalization_required'||phase==='auth_deletion_required'?AUTH:null,
      outboxEventId:OUTBOX,outboxStatus:phase==='completed'?'processed' as const:'processing' as const};}},
    dbFinalizerPort:{async finalizeDatabase(){calls.push('finalize');phase='auth_deletion_required';return{finalized:true,replayed:false,authMappingPresent:true};}},
    completionPort:{async completeDeletion(){calls.push('complete');phase='completed';return{completed:true,replayed:false,completedAt:'2026-10-28T10:00:00Z'};}},
  };
  const authDeletionPort:SupabaseAuthAdminUserDeletionPortV1={
    async deleteUser(){calls.push('auth');phase='completion_ack_required';return{outcome:'deleted'};},
  };
  const erased:string[]=[];
  const store:AdminAnalyticsEventStoreV1={
    async append(){return'inserted';},async eraseVisitor(){},
    async eraseSubject(ref){calls.push('erase');erased.push(ref);if(options.failErase)throw Error('analytics erasure unavailable');},
    async purgeExpired(){return 0;},
  };
  const runtime=createAccountDeletionWorkerRuntimeV1({
    ports,authDeletionPort,
    ...(options.withAnalytics===false ? {} : {analyticsDeletion:{store,secret:SECRET}}),
  });
  return{runtime,calls,erased};
}

describe('opt-in analytics subject erasure in claimed account deletion',()=>{
  it('erases before DB finalization and before completion ACK, using only pseudonymous subject linkage',async()=>{
    const h=harness();
    const result=await h.runtime.run(command);
    expect(result.worker.status).toBe('completed');
    expect(h.calls).toEqual(['claim','resume','erase','finalize','resume','auth','resume','erase','complete']);
    expect(h.erased).toEqual(Array(2).fill(deriveAdminAnalyticsReferenceV1(SECRET,'subject',SUBJECT)));
    expect(JSON.stringify(h.erased)).not.toContain(SUBJECT);
  });
  it('fails closed without finalizing account deletion if analytics erasure cannot be completed',async()=>{
    const h=harness({failErase:true});
    await expect(h.runtime.run(command)).rejects.toThrow('analytics erasure unavailable');
    expect(h.calls).toEqual(['claim','resume','erase']);
  });
  it('preserves the original worker behavior unless explicitly configured',async()=>{
    const h=harness({withAnalytics:false});
    expect((await h.runtime.run(command)).worker.status).toBe('completed');
    expect(h.calls).toEqual(['claim','resume','finalize','resume','auth','resume','complete']);
    expect(h.erased).toHaveLength(0);
  });
});
