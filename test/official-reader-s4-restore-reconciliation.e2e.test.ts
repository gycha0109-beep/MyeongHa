import { describe, expect, it, vi } from 'vitest';
import {
  reconcileOfficialReaderProtectedBodiesAfterRestoreV1,
} from '../apps/api/src/official-reader-private-restore-reconciliation-v1.js';
import {
  OfficialReaderRestoreQuarantinedV1,
  officialReaderRestoreFailureReportV1,
} from '../apps/api/src/official-reader-private-restore-quarantine-state-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import type { OfficialReaderOffPrimaryStoreV1 } from '../apps/api/src/official-reader-node-offprimary-privacy-store-v1.js';

// Actual restore orchestrator; rollback-aware SQL and external ports are
// entirely disposable. No real DB, backup, mount, key, or private content.
const SUBJECT_A='a1111111-1111-4111-8111-111111111111';
const SUBJECT_B='b2222222-2222-4222-8222-222222222222';
const BODY_A='c3333333-3333-4333-8333-333333333333';
const BODY_B='d4444444-4444-4444-8444-444444444444';
const KEY_A='reader-dek-v1:e5555555-5555-4555-8555-555555555555';
const KEY_B='reader-dek-v1:f6666666-6666-4666-8666-666666666666';
const refund=Object.freeze({
  version:'official-reader-scope-deletion-fence-v1' as const,
  jobId:'10000000-0000-4000-8000-000000000001',subjectId:SUBJECT_A,
  officialReadingId:'10000000-0000-4000-8000-000000000002',
  readerCharacterId:'synthetic',fenceId:'fence-refund',
  bodyIds:[BODY_A],keyRefs:[KEY_A],
});
const account=Object.freeze({
  version:'official-reader-account-deletion-fence-v1' as const,
  subjectId:SUBJECT_B,deletionJobId:'20000000-0000-4000-8000-000000000001',
  fenceId:'fence-account',bodyIds:[BODY_B],keyRefs:[KEY_B],
});
function fixture(opt:{
  missingGuard?:'installed'|'read'|'outbox';
  dirtySubject?:string;
  corruptManifest?:boolean;
  noTombstone?:boolean;
  noFences?:boolean;
}={}) {
  const events:string[]=[];
  let committed=new Set([BODY_A,BODY_B]);
  const destroyed=new Set<string>();
  const destroyKey=vi.fn(async(ref:string)=>{events.push('destroy');destroyed.add(ref);});
  const refundAck=vi.fn(async()=>{events.push('ack-refund');});
  const accountAck=vi.fn(async()=>{events.push('ack-account');return true;});
  const refundRead=vi.fn(async()=>{
    events.push('read-refund');
    return opt.corruptManifest?{...refund,keyRefs:['reader-dek-v1:tampered']}:refund;
  });
  const accountRead=vi.fn(async()=>{events.push('read-account');return account;});
  const store={
    restoreCatalog:{
      listConfirmedScopeDeletionFences:async()=>opt.noFences?[]:[refund],
      listAccountDeletionFences:async()=>opt.noFences?[]:[account],
      isSubjectTombstoned:async()=>!opt.noTombstone,
    },
    scopeLedger:{readScopeDeletionFence:refundRead,acknowledgeScopeKeyErasure:refundAck},
    ledger:{readAccountDeletionFence:accountRead,acknowledgeAccountKeyErasure:accountAck},
    keys:{
      isKeyDestroyed:async(ref:string)=>destroyed.has(ref),destroyKey,
    },
  } as unknown as OfficialReaderOffPrimaryStoreV1;
  let rolls=0,commits=0;
  const pool={
    connect:async()=>{
      let working:Set<string>|null=null;
      const query=async <T=Record<string,unknown>>(
        sql:string,params?:readonly unknown[],
      ):Promise<{rows:T[]}>=>{
        const result=(rows:unknown[])=>({rows:rows as T[]});
        if(sql==='BEGIN') {
          if(working!==null)throw Error('nested');
          working=new Set(committed);events.push('begin');return result([]);
        }
        if(sql==='ROLLBACK') {
          if(working===null)throw Error('no transaction');
          working=null;rolls++;events.push('rollback');return result([]);
        }
        if(sql==='COMMIT') {
          if(working===null)throw Error('no transaction');
          committed=working;working=null;commits++;events.push('commit');return result([]);
        }
        if(sql.startsWith('SET LOCAL ROLE '))return result([]);
        if(working===null)throw Error('unscoped SQL');
        if(sql.includes('pg_catalog.to_regprocedure')) {
          events.push('guard');
          return result([{
            installed:opt.missingGuard!=='installed',
            readFenceInstalled:opt.missingGuard!=='read',
            outboxFenceInstalled:opt.missingGuard!=='outbox',
          }]);
        }
        if(sql.includes("pg_catalog.set_config('myeongha.reader_restore_quarantine'")) {
          events.push('quarantine');return result([]);
        }
        const r=sql.includes('internal_replay_offprimary_reader_refund_purge_v1(');
        const a=sql.includes('internal_replay_offprimary_reader_account_deletion_v1(');
        if(r||a) {
          const subject=String(r?params?.[1]:params?.[0]);
          events.push(r?'refund-replay':'account-replay');
          if(opt.dirtySubject===subject)throw Object.assign(
            new Error('private restored subject: '+subject),
            {code:'P0001',constraint:'reader_restored_memory_items_quarantined'},
          );
          const ids=(r?params?.[5]:params?.[3]) as string[];
          if(!Array.isArray(ids))throw Error('invalid manifest');
          let deleted=0;
          for(const id of ids)if(working.delete(id))deleted++;
          return result([r?{
            erasedRowCount:String(deleted),remainingTombstonedRowCount:'0',
          }:{
            erasedRowCount:String(deleted),remainingSubjectRowCount:'0',
          }]);
        }
        throw Error('unexpected SQL');
      };
      return {query,release:()=>{if(working!==null)throw Error('leaked transaction');}};
    },
  } as unknown as PostgresSubjectPoolV1;
  const run=()=>reconcileOfficialReaderProtectedBodiesAfterRestoreV1({
    pool,offPrimary:store,executionBoundary:'isolated-restoration-only',
  });
  return {run,events,destroyKey,refundRead,accountRead,refundAck,accountAck,
    bodies:()=>[...committed].sort(),counts:()=>({rolls,commits})};
}
describe('Privacy #2318 isolated restore runner rollback and privacy authority',()=>{
  it('runs refund then account preflight with a full rollback before key erasure',async()=>{
    const x=fixture();
    const outcome=await x.run();
    expect(outcome).toMatchObject({
      refundScopeTombstonesReplayed:1,refundScopeRowsDeleted:1,
      tombstonesReplayed:1,protectedRowsPhysicallyDeleted:1,
      postReplayQuarantineRecheck:'passed_for_replay_manifests',
      ordinaryDerivedRestoreQuarantineGuardInstalled:true,
      ordinaryDerivedRecordsReadFenceInstalled:true,
      ordinaryDerivedOutboxReadFenceInstalled:true,
      restoreCompletionApproved:false,ordinaryRestoreConsumersEnabled:false,
      publicReaderServiceEnabled:false,existingPrivacyOwnerAcceptancePending:true,
    });
    const first=(s:string)=>x.events.indexOf(s);
    expect(first('guard')).toBeLessThan(first('read-refund'));
    expect(first('read-account')).toBeLessThan(first('refund-replay'));
    expect(first('refund-replay')).toBeLessThan(first('account-replay'));
    expect(first('rollback')).toBeLessThan(first('destroy'));
    expect(first('destroy')).toBeLessThan(first('ack-refund'));
    expect(first('ack-refund')).toBeLessThan(first('ack-account'));
    expect(x.counts()).toEqual({rolls:2,commits:3});
    expect(x.bodies()).toEqual([]);
    expect(x.destroyKey).toHaveBeenCalledTimes(2);
  });
  it('is physically idempotent on repeated exact-fence replay',async()=>{
    const x=fixture();
    await x.run();
    const second=await x.run();
    expect(second).toMatchObject({
      refundScopeRowsDeleted:0,protectedRowsPhysicallyDeleted:0,
      restoreCompletionApproved:false,publicReaderServiceEnabled:false,
    });
    expect(x.bodies()).toEqual([]);
    expect(x.destroyKey).toHaveBeenCalledTimes(2);
    expect(x.refundAck).toHaveBeenCalledTimes(2);
    expect(x.accountAck).toHaveBeenCalledTimes(2);
  });
  it('rejects absent DB/Reader/Outbox fences before external manifests or key IO',async()=>{
    for(const missingGuard of ['installed','read','outbox'] as const) {
      const x=fixture({missingGuard});
      await expect(x.run()).rejects.toThrow('Official Reader restored privacy state is unavailable.');
      expect(x.refundRead).not.toHaveBeenCalled();
      expect(x.accountRead).not.toHaveBeenCalled();
      expect(x.destroyKey).not.toHaveBeenCalled();
      expect(x.bodies()).toHaveLength(2);
    }
  });
  it('rejects mismatched off-primary source or missing durable account denial',async()=>{
    for(const options of [{corruptManifest:true},{noTombstone:true}]) {
      const x=fixture(options);
      await expect(x.run()).rejects.toThrow('Official Reader restored privacy state is unavailable.');
      expect(x.events).not.toContain('refund-replay');
      expect(x.destroyKey).not.toHaveBeenCalled();
      expect(x.bodies()).toHaveLength(2);
    }
  });
  it('rolls back earlier refunded deletion if a later account has dirty restored Memory',async()=>{
    const x=fixture({dirtySubject:SUBJECT_B});
    let blocked:unknown;
    try{await x.run();}catch(err){blocked=err;}
    expect(blocked).toBeInstanceOf(OfficialReaderRestoreQuarantinedV1);
    const report=officialReaderRestoreFailureReportV1(blocked);
    expect(report).toMatchObject({
      restoreState:'quarantined_derived_data',derivedCategory:'ordinary_memory',
      automaticCleanupPerformed:false,restoreRetryAuthorizedByThisReport:false,
      paidReaderServiceEnabled:false,ordinaryRestoreConsumersEnabled:false,
    });
    expect(JSON.stringify(report)).not.toContain(SUBJECT_B);
    expect(x.counts()).toEqual({rolls:1,commits:1});
    expect(x.bodies()).toHaveLength(2);
    expect(x.destroyKey).not.toHaveBeenCalled();
    expect(x.refundAck).not.toHaveBeenCalled();
  });
  it('keeps every service off when there are no deleted scopes',async()=>{
    const x=fixture({noFences:true});
    expect(await x.run()).toMatchObject({
      restoreState:'no_protected_body_tombstones',
      postReplayQuarantineRecheck:'not_applicable_no_manifests',
      restoreCompletionApproved:false,ordinaryRestoreConsumersEnabled:false,
      publicReaderServiceEnabled:false,
    });
    expect(x.counts()).toEqual({rolls:1,commits:1});
    expect(x.destroyKey).not.toHaveBeenCalled();
  });
});
