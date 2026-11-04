// Watchtower-Track: security
// R38 persists *negative-only* fixture probe metadata under the original
// Member/Grant + exact R30/R37 Stage. A caller-provided digest or "rejected"
// label is not a signed attestation that any guard actually ran; these records
// must NEVER authorize real model output, G2 Commit, HTTP Reveal or billing.
import {
  executePostgresSubjectTransactionV1,
} from './postgres-subject-execution.js';
import type {
  PersistSeyeonR20OfflineDigestBoundInputV1,
} from './seyeon-positive-raw-projection-digest-bind-r20-candidate.js';
import type {
  SeyeonR32OfflineStageReceiptV1,
} from './seyeon-r32-offline-five-stage-governed-cost-v1.js';
import {
  type SeyeonR38NegativeProbeV1,
  type SeyeonR38NegativeCaseV1,
} from './seyeon-r38-offline-guard-rejection-probes-v1.js';

const DB='myeongha_seyeon_positive_pin_candidate_test';
const SHA=/^sha256:v1:[0-9a-f]{64}$/u;
type Stored={
  readonly status:'isolated_local_invalid_fixture_rejected_not_provider_output';
  readonly attemptId:string;
  readonly caseKey:SeyeonR38NegativeCaseV1;
  readonly stageIndex:number;
  readonly purpose:string;
  readonly callId:string;
  readonly nativeWireDigest:string;
  readonly candidateDigest:string;
  readonly guardName:string;
  readonly verdict:'rejected';
  readonly providerDispatched:false;
  readonly outputGuardVerified:false;
  readonly permitsProvider:false;
  readonly permitsAtomicCommit:false;
  readonly permitsHttpReveal:false;
};
export class SeyeonR38OfflineNegativeEvidenceHoldV1 extends Error{
  readonly code='R38_NEGATIVE_FIXTURE_NOT_REAL_OUTPUT_PROOF' as const;
  constructor(){
    super('Local guard rejection does not authorize Provider output or reply persistence.');
    this.name='SeyeonR38OfflineNegativeEvidenceHoldV1';
  }
}
export async function recordSeyeonR38OfflineNegativeGuardProbeV1(input:{
  readonly pinInput:PersistSeyeonR20OfflineDigestBoundInputV1;
  readonly reservation:SeyeonR32OfflineStageReceiptV1;
  readonly probe:SeyeonR38NegativeProbeV1;
}):Promise<Stored>{
  try{
    const {pinInput,reservation,probe}=input;
    if(probe.verdict!=='rejected'
      ||probe.schemaVersion!=='seyeon-r38-guard-negative-probe-v1'
      ||probe.originKind!=='local_invalid_fixture_not_provider_output'
      ||probe.providerDispatched!==false
      ||probe.outputGuardVerified!==false
      ||probe.permitsAtomicCommit!==false
      ||probe.permitsHttpReveal!==false
      ||!SHA.test(probe.candidateDigest)
      ||reservation.status!=='disposable_stage_and_cost_reserved_without_dispatch'
      ||reservation.attemptId!==pinInput.attemptId
      ||reservation.selectedSourcesDigest!==pinInput.selection.selectedSourcesDigest
      ||reservation.stageIndex<2||reservation.stageIndex>4
      ||probe.stagePurpose!==reservation.purpose
      ||reservation.permitsProvider!==false
      ||reservation.permitsAtomicCommit!==false
      ||reservation.permitsHttpReveal!==false)
      throw new SeyeonR38OfflineNegativeEvidenceHoldV1();
    const record=await executePostgresSubjectTransactionV1({
      pool:pinInput.pool,verifiedEvidence:pinInput.verifiedEvidence,
      execute:async({client,resolvedSubject})=>{
        if(resolvedSubject.subjectKind!=='member')
          throw new SeyeonR38OfflineNegativeEvidenceHoldV1();
        const name=await client.query<{name:string}>(
          'select current_database() as name',
        );
        if(name.rows.length!==1||name.rows[0]?.name!==DB)
          throw new SeyeonR38OfflineNegativeEvidenceHoldV1();
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        await client.query("SET LOCAL statement_timeout = '7000ms'");
        const q=await client.query<{receipt:unknown}>(`
select seyeon_positive_candidate.record_guard_negative_probe_r38(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::integer,
  $7::text,$8::uuid,$9::text,$10::text,$11::text
) as receipt
`.trim(),[
          resolvedSubject.subjectId,pinInput.threadId,pinInput.turnId,
          pinInput.attemptId,probe.caseKey,reservation.stageIndex,
          reservation.purpose,reservation.callId,reservation.nativeWireDigest,
          probe.actualGuardName,probe.candidateDigest,
        ]);
        const raw=q.rows.length===1?q.rows[0]?.receipt:null;
        if(!raw||typeof raw!=='object'||Array.isArray(raw))
          throw new SeyeonR38OfflineNegativeEvidenceHoldV1();
        const r=raw as Record<string,unknown>;
        if(r.status!=='isolated_local_invalid_fixture_rejected_not_provider_output'
          ||r.attemptId!==reservation.attemptId
          ||r.caseKey!==probe.caseKey
          ||r.stageIndex!==reservation.stageIndex
          ||r.purpose!==reservation.purpose
          ||r.callId!==reservation.callId
          ||r.nativeWireDigest!==reservation.nativeWireDigest
          ||r.candidateDigest!==probe.candidateDigest
          ||r.guardName!==probe.actualGuardName
          ||r.verdict!=='rejected'
          ||r.providerDispatched!==false||r.outputGuardVerified!==false
          ||r.permitsProvider!==false||r.permitsAtomicCommit!==false
          ||r.permitsHttpReveal!==false)
          throw new SeyeonR38OfflineNegativeEvidenceHoldV1();
        return Object.freeze(r as unknown as Stored);
      },
    });
    return record;
  }catch{
    throw new SeyeonR38OfflineNegativeEvidenceHoldV1();
  }
}
