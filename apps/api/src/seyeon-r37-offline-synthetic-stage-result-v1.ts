// Watchtower-Track: security
// R37: a strictly LOCAL synthetic observation in an isolated PostgreSQL
// rehearsal. It is never a Provider response or an output-guard PASS.
// No production mounting, actual model use, G2 Commit or HTTP Reveal.
import {
  executePostgresSubjectTransactionV1,
} from './postgres-subject-execution.js';
import type {
  PersistSeyeonR20OfflineDigestBoundInputV1,
} from './seyeon-positive-raw-projection-digest-bind-r20-candidate.js';
import type {
  SeyeonR32OfflineStageReceiptV1,
} from './seyeon-r32-offline-five-stage-governed-cost-v1.js';

const SCRATCH='myeongha_seyeon_positive_pin_candidate_test';
const SHA=/^sha256:pg-jsonb:v1:[0-9a-f]{64}$/u;
const purposes=[
  'integrity_classification','disclosure_classification',
  'turn_interpretation','dialogue_render','semantic_review',
] as const;

export class SeyeonR37OfflineSyntheticResultHoldV1 extends Error {
  readonly code='R37_SYNTHETIC_RESULT_NO_OUTPUT_AUTHORITY' as const;
  constructor(){
    super('Synthetic local outcome is not a Provider result or a validated Character utterance.');
    this.name='SeyeonR37OfflineSyntheticResultHoldV1';
  }
}
export interface SeyeonR37OfflineSyntheticResultV1 {
  readonly status:'isolated_synthetic_no_provider_output';
  readonly attemptId:string;
  readonly stageIndex:number;
  readonly purpose:typeof purposes[number];
  readonly callId:string;
  readonly syntheticPayloadDigest:string;
  readonly providerDispatched:false;
  readonly providerOutputVerified:false;
  readonly outputGuardVerified:false;
  readonly permitsProvider:false;
  readonly permitsAtomicCommit:false;
  readonly permitsHttpReveal:false;
}
export function buildSeyeonR37SyntheticStageObservationV1(
  receipt:SeyeonR32OfflineStageReceiptV1,
){
  if(receipt.permitsProvider!==false||
    receipt.permitsAtomicCommit!==false||
    receipt.permitsHttpReveal!==false||
    receipt.stageIndex!==purposes.indexOf(receipt.purpose)||
    receipt.status!=='disposable_stage_and_cost_reserved_without_dispatch')
    throw new SeyeonR37OfflineSyntheticResultHoldV1();
  // This payload explicitly says that no output exists. It never contains
  // prompt text, private Memory, model response, or a fake PASS result.
  return Object.freeze({
    schemaVersion:'seyeon-r37-synthetic-stage-result-v1' as const,
    attemptId:receipt.attemptId,
    stageIndex:receipt.stageIndex,
    purpose:receipt.purpose,
    callId:receipt.callId,
    nativeWireDigest:receipt.nativeWireDigest,
    providerDispatched:false as const,
    outputGuardVerified:false as const,
    result:Object.freeze({
      kind:'no_provider_output' as const,
      verified:false as const,
    }),
  });
}
export async function recordSeyeonR37SyntheticStageObservationV1(input:{
  readonly pinInput:PersistSeyeonR20OfflineDigestBoundInputV1;
  readonly reservation:SeyeonR32OfflineStageReceiptV1;
}):Promise<SeyeonR37OfflineSyntheticResultV1>{
  try{
    const {pinInput,reservation}=input;
    if(pinInput.attemptId!==reservation.attemptId
      ||pinInput.selection.selectedSourcesDigest!==
        reservation.selectedSourcesDigest)
      throw new SeyeonR37OfflineSyntheticResultHoldV1();
    const payload=buildSeyeonR37SyntheticStageObservationV1(reservation);
    const res=await executePostgresSubjectTransactionV1({
      pool:pinInput.pool,verifiedEvidence:pinInput.verifiedEvidence,
      execute:async({client,resolvedSubject})=>{
        if(resolvedSubject.subjectKind!=='member')
          throw new SeyeonR37OfflineSyntheticResultHoldV1();
        const db=await client.query<{db_name:string}>(
          'select current_database() as db_name',
        );
        if(db.rows.length!==1||db.rows[0]?.db_name!==SCRATCH)
          throw new SeyeonR37OfflineSyntheticResultHoldV1();
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        await client.query("SET LOCAL statement_timeout = '7000ms'");
        const rows=await client.query<{receipt:unknown}>(`
select seyeon_positive_candidate.record_synthetic_stage_result_r37(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::jsonb
) as receipt
`.trim(),[
          resolvedSubject.subjectId,pinInput.threadId,pinInput.turnId,
          pinInput.attemptId,reservation.purpose,reservation.callId,
          JSON.stringify(payload),
        ]);
        const v=rows.rows.length===1?rows.rows[0]?.receipt:null;
        if(!v||typeof v!=='object'||Array.isArray(v))
          throw new SeyeonR37OfflineSyntheticResultHoldV1();
        const q=v as Record<string,unknown>;
        if(q.status!=='isolated_synthetic_no_provider_output'
          ||q.attemptId!==reservation.attemptId
          ||q.stageIndex!==reservation.stageIndex
          ||q.purpose!==reservation.purpose
          ||q.callId!==reservation.callId
          ||typeof q.syntheticPayloadDigest!=='string'
          ||!SHA.test(q.syntheticPayloadDigest)
          ||q.providerDispatched!==false
          ||q.providerOutputVerified!==false
          ||q.outputGuardVerified!==false
          ||q.permitsProvider!==false
          ||q.permitsAtomicCommit!==false
          ||q.permitsHttpReveal!==false)
          throw new SeyeonR37OfflineSyntheticResultHoldV1();
        return Object.freeze(q as unknown as SeyeonR37OfflineSyntheticResultV1);
      },
    });
    return res;
  }catch{
    throw new SeyeonR37OfflineSyntheticResultHoldV1();
  }
}
