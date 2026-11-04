// Watchtower-Track: security
// No PostgreSQL, no Provider HTTP, no fake "passed" model-output claim.
// The real Postgres/role ACL tests run only in the disposable PG integration.
import {describe,expect,it,vi} from 'vitest';
import type {PostgresSubjectPoolV1}
  from '../apps/api/src/postgres-subject-execution.js';
import type {PersistSeyeonR20OfflineDigestBoundInputV1}
  from '../apps/api/src/seyeon-positive-raw-projection-digest-bind-r20-candidate.js';
import type {SeyeonR41OfflineLocalWitnessV1}
  from '../apps/api/src/seyeon-r41-offline-guard-fixture-db-v1.js';
import {
  issueSeyeonR43SeparatedLocalGuardSealV1,
  SeyeonR43EvaluatorAuthorityHoldV1,
} from '../apps/api/src/seyeon-r43-offline-validator-session-v1.js';

const attemptId='d7200000-0000-4000-8000-000000000760';
const source='sha256:v1:'+'a'.repeat(64);
function fixture(){
  const connect=vi.fn(async()=>{throw Error('R43 must not access PostgreSQL');});
  const pool:PostgresSubjectPoolV1={connect};
  const pinInput={
    pool,attemptId,selection:{selectedSourcesDigest:source},
    verifiedEvidence:{
      kind:'member',verifiedAuthUserId:'d1000000-0000-4000-8000-000000000001',
    },
  } as unknown as PersistSeyeonR20OfflineDigestBoundInputV1;
  const localWitness:SeyeonR41OfflineLocalWitnessV1={
    status:'isolated_code_authored_guard_fixture_fingerprints_matched',
    attemptId,selectedSourcesDigest:source,
    interpretationCallId:'d8000000-0000-4000-8000-000000000061',
    rendererCallId:'d8000000-0000-4000-8000-000000000062',
    semanticReviewCallId:'d8000000-0000-4000-8000-000000000063',
    guardedEnvelopeDigest:'sha256:v1:'+'b'.repeat(64),
    providerDispatched:false,providerOutputVerified:false,
    outputGuardVerified:false,permitsAtomicCommit:false,
    permitsHttpReveal:false,
  };
  return {pool,connect,pinInput,localWitness};
}

describe('R43 evaluator-only local signing preflight (no database or Provider)',()=>{
  it('refuses the ordinary Member API pool as a signing pool',async()=>{
    const x=fixture();
    await expect(issueSeyeonR43SeparatedLocalGuardSealV1({
      pinInput:x.pinInput,localWitness:x.localWitness,
      validatorPool:x.pool,
    })).rejects.toBeInstanceOf(SeyeonR43EvaluatorAuthorityHoldV1);
    expect(x.connect).not.toHaveBeenCalled();
  });
  it('rejects a forged code-derived witness before opening either pool',async()=>{
    const x=fixture();
    const validatorPool:PostgresSubjectPoolV1={connect:x.connect};
    await expect(issueSeyeonR43SeparatedLocalGuardSealV1({
      pinInput:x.pinInput,
      localWitness:{...x.localWitness,outputGuardVerified:true} as
        unknown as SeyeonR41OfflineLocalWitnessV1,
      validatorPool,
    })).rejects.toBeInstanceOf(SeyeonR43EvaluatorAuthorityHoldV1);
    expect(x.connect).not.toHaveBeenCalled();
  });
  it('rejects a cross-Attempt or cross-source witness',async()=>{
    const x=fixture();
    const validatorPool:PostgresSubjectPoolV1={connect:x.connect};
    for(const witness of [
      {...x.localWitness,attemptId:'d7200000-0000-4000-8000-000000000761'},
      {...x.localWitness,selectedSourcesDigest:'sha256:v1:'+'c'.repeat(64)},
    ]){
      await expect(issueSeyeonR43SeparatedLocalGuardSealV1({
        pinInput:x.pinInput,localWitness:witness,validatorPool,
      })).rejects.toBeInstanceOf(SeyeonR43EvaluatorAuthorityHoldV1);
    }
    expect(x.connect).not.toHaveBeenCalled();
  });
});
