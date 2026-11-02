// Watchtower-Track: security
// W40 scratch-only bridge for R39 *unverified local mock HTTP* fingerprints.
// It never proves an actual Provider response, actual Guard PASS or G2/Reveal.
// Never wire to Production routes or a real API key.
import {
  executePostgresSubjectTransactionV1,
} from './postgres-subject-execution.js';
import type {
  PersistSeyeonR20OfflineDigestBoundInputV1,
} from './seyeon-positive-raw-projection-digest-bind-r20-candidate.js';
import type {
  SeyeonR32OfflineStageReceiptV1,
} from './seyeon-r32-offline-five-stage-governed-cost-v1.js';
import type {
  SeyeonUnverifiedTransportOutputReceiptV1,
} from './openai-seyeon-structured-provider-v1.js';

const SCRATCH='myeongha_seyeon_positive_pin_candidate_test';
const WIRE=/^sha256:wire-utf8:v1:[0-9a-f]{64}$/u;
const STUB=/^resp_r40_synthetic_[a-z0-9_-]{3,100}$/u;
const PROVIDER='openai-responses';
const MODEL='seyeon-r35-offline';
const PURPOSES=[
  'integrity_classification','disclosure_classification',
  'turn_interpretation','dialogue_render','semantic_review',
] as const;

export interface SeyeonR40UnverifiedMockTransportReceiptV1 {
  readonly status:'isolated_mock_transport_fingerprint_unverified';
  readonly attemptId:string;
  readonly stageIndex:number;
  readonly purpose:typeof PURPOSES[number];
  readonly callId:string;
  readonly nativeWireDigest:string;
  readonly responseId:string;
  readonly responseBodyDigest:string;
  readonly structuredOutputDigest:string;
  readonly providerOutputVerified:false;
  readonly outputGuardVerified:false;
  readonly permitsProvider:false;
  readonly permitsAtomicCommit:false;
  readonly permitsHttpReveal:false;
}
export class SeyeonR40OfflineUnverifiedTransportHoldV1 extends Error{
  readonly code='R40_UNVERIFIED_TRANSPORT_NOT_OUTPUT_AUTHORITY' as const;
  constructor(){
    super('Only a locally mocked transport fingerprint may be recorded; no real output authority.');
    this.name='SeyeonR40OfflineUnverifiedTransportHoldV1';
  }
}
/** Requires the R32 reservation and a caller-owned R39 transport fingerprint.
 * R40 explicitly DOES NOT assert that the caller ran R39 or actually saw a
 * Provider response. It stores only bounded, unverified simulated transport.
 */
export async function recordSeyeonR40UnverifiedMockTransportV1(input:{
  readonly pinInput:PersistSeyeonR20OfflineDigestBoundInputV1;
  readonly reservation:SeyeonR32OfflineStageReceiptV1;
  readonly transport:SeyeonUnverifiedTransportOutputReceiptV1;
}):Promise<SeyeonR40UnverifiedMockTransportReceiptV1>{
  try{
    const {pinInput,reservation,transport}=input;
    if(pinInput.attemptId!==reservation.attemptId
      ||pinInput.selection.selectedSourcesDigest!==reservation.selectedSourcesDigest
      ||reservation.status!=='disposable_stage_and_cost_reserved_without_dispatch'
      ||reservation.stageIndex!==PURPOSES.indexOf(reservation.purpose)
      ||reservation.permitsProvider!==false
      ||reservation.permitsAtomicCommit!==false
      ||reservation.permitsHttpReveal!==false
      ||!WIRE.test(reservation.nativeWireDigest)
      ||transport.schemaVersion!=='seyeon-unverified-transport-output-receipt-r39'
      ||transport.originKind!=='unverified_transport_bytes_only'
      ||transport.callId!==reservation.callId
      ||transport.purpose!==reservation.purpose
      ||transport.providerKey!==PROVIDER||transport.modelKey!==MODEL
      ||!STUB.test(transport.responseId)
      ||!WIRE.test(transport.responseBodyDigest)
      ||!WIRE.test(transport.structuredOutputDigest)
      ||transport.providerOutputVerified!==false
      ||transport.outputGuardVerified!==false
      ||transport.permitsAtomicCommit!==false
      ||transport.permitsHttpReveal!==false)
      throw new SeyeonR40OfflineUnverifiedTransportHoldV1();
    const recorded=await executePostgresSubjectTransactionV1({
      pool:pinInput.pool,verifiedEvidence:pinInput.verifiedEvidence,
      execute:async({client,resolvedSubject})=>{
        if(resolvedSubject.subjectKind!=='member')
          throw new SeyeonR40OfflineUnverifiedTransportHoldV1();
        const db=await client.query<{db_name:string}>(
          'select current_database() as db_name',
        );
        if(db.rows.length!==1||db.rows[0]?.db_name!==SCRATCH)
          throw new SeyeonR40OfflineUnverifiedTransportHoldV1();
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        await client.query("SET LOCAL statement_timeout = '7000ms'");
        const rows=await client.query<{receipt:unknown}>(`
select seyeon_positive_candidate.record_unverified_transport_r40(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::integer,$6::uuid,
  $7::text,$8::jsonb
) as receipt
`.trim(),[
          resolvedSubject.subjectId,pinInput.threadId,pinInput.turnId,
          pinInput.attemptId,reservation.stageIndex,reservation.callId,
          reservation.nativeWireDigest,JSON.stringify(transport),
        ]);
        if(rows.rows.length!==1||!rows.rows[0]?.receipt
          ||typeof rows.rows[0].receipt!=='object'
          ||Array.isArray(rows.rows[0].receipt))
          throw new SeyeonR40OfflineUnverifiedTransportHoldV1();
        const value=rows.rows[0].receipt as Record<string,unknown>;
        if(value.status!=='isolated_mock_transport_fingerprint_unverified'
          ||value.attemptId!==reservation.attemptId
          ||value.stageIndex!==reservation.stageIndex
          ||value.purpose!==reservation.purpose
          ||value.callId!==reservation.callId
          ||value.nativeWireDigest!==reservation.nativeWireDigest
          ||value.responseId!==transport.responseId
          ||value.responseBodyDigest!==transport.responseBodyDigest
          ||value.structuredOutputDigest!==transport.structuredOutputDigest
          ||value.providerOutputVerified!==false
          ||value.outputGuardVerified!==false
          ||value.permitsProvider!==false
          ||value.permitsAtomicCommit!==false
          ||value.permitsHttpReveal!==false)
          throw new SeyeonR40OfflineUnverifiedTransportHoldV1();
        return Object.freeze(value as unknown as SeyeonR40UnverifiedMockTransportReceiptV1);
      },
    });
    return recorded;
  }catch{
    throw new SeyeonR40OfflineUnverifiedTransportHoldV1();
  }
}
