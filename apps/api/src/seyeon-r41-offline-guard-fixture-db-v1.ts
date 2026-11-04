// Watchtower-Track: security
// R41: only the real authored guards on a PUBLIC synthetic no-Provider
// fixture; even a successful local Guard test is NOT G2/Reveal authority.
import {executePostgresSubjectTransactionV1}
  from './postgres-subject-execution.js';
import type {PersistSeyeonR20OfflineDigestBoundInputV1}
  from './seyeon-positive-raw-projection-digest-bind-r20-candidate.js';
import type {SeyeonR32OfflineStageReceiptV1}
  from './seyeon-r32-offline-five-stage-governed-cost-v1.js';
import {buildSeyeonR41LocalGuardFixtureV1}
  from './seyeon-r41-offline-actual-guard-fixture-v1.js';

const DB='myeongha_seyeon_positive_pin_candidate_test';
export class SeyeonR41OfflineFixtureDatabaseHoldV1 extends Error{
  readonly code='R41_SYNTHETIC_FINGERPRINTS_NOT_REAL_OUTPUT_AUTHORITY' as const;
}
export interface SeyeonR41OfflineLocalWitnessV1{
  readonly status:'isolated_code_authored_guard_fixture_fingerprints_matched';
  readonly attemptId:string;
  readonly selectedSourcesDigest:string;
  readonly interpretationCallId:string;
  readonly rendererCallId:string;
  readonly semanticReviewCallId:string;
  readonly guardedEnvelopeDigest:string;
  readonly providerDispatched:false;
  readonly providerOutputVerified:false;
  readonly outputGuardVerified:false;
  readonly permitsAtomicCommit:false;
  readonly permitsHttpReveal:false;
}
export async function recordSeyeonR41LocalFixtureWitnessV1(input:{
  readonly pinInput:PersistSeyeonR20OfflineDigestBoundInputV1;
  readonly reservations:readonly SeyeonR32OfflineStageReceiptV1[];
}):Promise<SeyeonR41OfflineLocalWitnessV1>{
  try{
    const {pinInput,reservations}=input;
    const expected=['turn_interpretation','dialogue_render','semantic_review'];
    if(reservations.length!==3||pinInput.selection.selectedMemoryCount!==2
      ||pinInput.selection.selectedSources.length!==2
      ||reservations.some((r,i)=>r.stageIndex!==i+2
        ||r.purpose!==expected[i]
        ||r.attemptId!==pinInput.attemptId
        ||r.selectedSourcesDigest!==pinInput.selection.selectedSourcesDigest
        ||r.permitsProvider!==false||r.permitsAtomicCommit!==false
        ||r.permitsHttpReveal!==false))
      throw new SeyeonR41OfflineFixtureDatabaseHoldV1();
    // Actual domain guards execute in-process; no real Provider transport
    // or private user data can pass this strict R38 baseline.
    const witness=buildSeyeonR41LocalGuardFixtureV1(
      pinInput.finalModelContext,
    );
    const stored=await executePostgresSubjectTransactionV1({
      pool:pinInput.pool,verifiedEvidence:pinInput.verifiedEvidence,
      execute:async({client,resolvedSubject})=>{
        if(resolvedSubject.subjectKind!=='member')
          throw new SeyeonR41OfflineFixtureDatabaseHoldV1();
        const db=await client.query<{name:string}>(
          'select current_database() as name',
        );
        if(db.rows.length!==1||db.rows[0]?.name!==DB)
          throw new SeyeonR41OfflineFixtureDatabaseHoldV1();
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        await client.query("SET LOCAL statement_timeout = '8000ms'");
        const q=await client.query<{receipt:unknown}>(`
select seyeon_positive_candidate.record_local_guard_fixture_r41(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,
  $6::uuid,$7::uuid,$8::uuid,$9::text
) as receipt
`.trim(),[
          resolvedSubject.subjectId,pinInput.threadId,pinInput.turnId,
          pinInput.attemptId,pinInput.selection.selectedSourcesDigest,
          reservations[0]!.callId,reservations[1]!.callId,
          reservations[2]!.callId,witness.guardedEnvelopeDigest,
        ]);
        const v=q.rows.length===1?q.rows[0]?.receipt:null;
        if(!v||typeof v!=='object'||Array.isArray(v))
          throw new SeyeonR41OfflineFixtureDatabaseHoldV1();
        const r=v as Record<string,unknown>;
        if(r.status!=='isolated_code_authored_guard_fixture_fingerprints_matched'
          ||r.attemptId!==pinInput.attemptId
          ||r.selectedSourcesDigest!==pinInput.selection.selectedSourcesDigest
          ||r.interpretationCallId!==reservations[0]?.callId
          ||r.rendererCallId!==reservations[1]?.callId
          ||r.semanticReviewCallId!==reservations[2]?.callId
          ||r.guardedEnvelopeDigest!==witness.guardedEnvelopeDigest
          ||r.providerDispatched!==false
          ||r.providerOutputVerified!==false
          ||r.outputGuardVerified!==false
          ||r.permitsAtomicCommit!==false||r.permitsHttpReveal!==false)
          throw new SeyeonR41OfflineFixtureDatabaseHoldV1();
        return Object.freeze(r as unknown as SeyeonR41OfflineLocalWitnessV1);
      },
    });
    return stored;
  }catch{
    throw new SeyeonR41OfflineFixtureDatabaseHoldV1();
  }
}
