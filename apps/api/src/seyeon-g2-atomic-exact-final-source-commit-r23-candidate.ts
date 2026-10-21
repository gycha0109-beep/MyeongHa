// Watchtower-Track: security
// R23 OFFLINE ONLY: exact G1 final-source manifest -> real v2 G2 Commit.
// Never mounted into Production; no Provider, HTTP or positive projector.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {
  assembleSeyeonRuntimeContextV2,
  type SeyeonRetrievedMemoryV2,
  type SeyeonRuntimeContextV2,
} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type {SeyeonPersonalRecordProjectionCandidateV1} from './seyeon-production-context-v1.js';
import {
  selectSeyeonExactModelPersonalSourcesV1,
  type SeyeonExactModelPersonalSourceSelectionV1,
} from './seyeon-exact-model-personal-source-selection-v1.js';
import {
  assertSeyeonR21OfflineDerivedSourceClosureV1,
  type SeyeonR21OfflineDerivedSourceEnvelopeV1,
} from './seyeon-r21-offline-derived-source-closure-v1.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type {VerifiedSubjectIdentityEvidenceV1} from './subject-identity-resolver.js';
import {validateSeyeonPostTurnAnalysisSnapshotV1} from './seyeon-post-turn-analysis-worker-v1.js';

export const SEYEON_R23_OFFLINE_G2_COMMIT_V1=Object.freeze({
  database:'myeongha_seyeon_positive_pin_candidate_test',
  function:'seyeon_positive_candidate.commit_actual_v2_r3',
  sourceCount:1,
  permitsProvider:false,
  permitsHttpReveal:false,
  productionMounted:false,
} as const);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA=/^sha256:v1:[a-f0-9]{64}$/u;
const PG_SHA=/^sha256:pg-jsonb:v1:[a-f0-9]{64}$/u;

export class SeyeonR23OfflineG2CommitHoldV1 extends Error{
  readonly code='R23_OFFLINE_G2_ATOMIC_COMMIT_HOLD' as const;
  constructor(){
    super('Exact G1 source and actual v2 G2 Commit were not jointly proven.');
    this.name='SeyeonR23OfflineG2CommitHoldV1';
  }
}
export interface SeyeonR23G1PinnedReceiptV1{
  readonly turnId:string;
  readonly attemptId:string;
  readonly selectedSourcesDigest:string;
  /** Offline pre-model checked Context digest; not DB-signed G1 authority. */
  readonly finalModelContextDigest:string;
  readonly recordId:string;
  readonly originalGrantId:string;
  readonly pgPayloadDigest:string;
  readonly contextReady:true;
}
export interface CommitSeyeonR23OfflineAtomicInputV1{
  readonly pool:PostgresSubjectPoolV1;
  readonly verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
  readonly threadId:string;
  readonly turnId:string;
  readonly attemptId:string;
  readonly assistantMessageId:string;
  readonly chatOutboxId:string;
  readonly postTurnOutboxId:string;
  readonly postTurnSnapshot:unknown;
  readonly postTurnSnapshotHash:string;
  /** The same final model retrieval selection as at G1 before Provider. */
  readonly finalRetrievedMemories:readonly SeyeonRetrievedMemoryV2[];
  /** Exact final assembled model packet from the SAME G1 pre-model selection. */
  readonly finalModelContext:SeyeonRuntimeContextV2;
  readonly sourceCandidates:readonly SeyeonPersonalRecordProjectionCandidateV1[];
  readonly sourceEnvelope:SeyeonR21OfflineDerivedSourceEnvelopeV1;
  readonly preModelSelection:SeyeonExactModelPersonalSourceSelectionV1;
  /** Candidate only: untrusted until G2 Owner rechecks DB original Grant. */
  readonly g1Receipt:SeyeonR23G1PinnedReceiptV1;
}
export interface SeyeonR23OfflineG2CommitReceiptV1{
  readonly status:'disposable_atomic_v2_committed';
  readonly turnId:string;
  readonly attemptId:string;
  readonly assistantMessageId:string;
  readonly postTurnOutboxEventId:string;
  readonly replayed:false;
  readonly permitsProvider:false;
  readonly permitsHttpReveal:false;
}

/**
 * This is a fail-closed transport into the EXISTING R3 Owner wrapper.
 * No arbitrary SQL/DDL and no direct v1/v2 executor permission:
 * PostgreSQL checks actual immutable G1 Parent+Edge + original Grant under
 * lock and writes real assistant message + both outboxes in ONE transaction.
 * G1 receipt and model-selection comparison are additional narrow guards,
 * never an authorization source or proof of Provider/Preflight completeness.
 */
export async function commitSeyeonR23OfflineAtomicV2V1(
  input:CommitSeyeonR23OfflineAtomicInputV1,
):Promise<SeyeonR23OfflineG2CommitReceiptV1>{
  try{
    if(input.verifiedEvidence?.kind!=='member'
      ||!UUID.test(input.verifiedEvidence.verifiedAuthUserId)
      ||[input.threadId,input.turnId,input.attemptId,
        input.assistantMessageId,input.chatOutboxId,input.postTurnOutboxId]
        .some(v=>!UUID.test(v))
      ||new Set([input.threadId,input.turnId,input.attemptId,
        input.assistantMessageId,input.chatOutboxId,input.postTurnOutboxId]).size!==6
      ||!SHA.test(input.postTurnSnapshotHash)
      ||input.postTurnSnapshot===null
      ||typeof input.postTurnSnapshot!=='object'
      ||Array.isArray(input.postTurnSnapshot)){
      throw new SeyeonR23OfflineG2CommitHoldV1();
    }

    assertSeyeonR21OfflineDerivedSourceClosureV1({
      envelope:input.sourceEnvelope,
      retrievedMemories:input.finalRetrievedMemories,
      sourceCandidates:input.sourceCandidates,
    });
    // G1→G2: close the otherwise unobserved final assembled packet gap.
    // The same zero-derived/preflight-not-run envelope must describe the
    // ENTIRE Context at G2, not only its retrieved personal-memory subset.
    // A candidate R4 receipt is not a trusted DB signature of this packet.
    const expectedModelContext=assembleSeyeonRuntimeContextV2({
      relationship:null,
      relationshipSemantics:null,
      recentMessages:[],
      retrievedMemories:input.finalRetrievedMemories,
      integrityDecisions:[],
      governedPreflightApplied:false,
      disclosure:{decision:null,retrievedSources:[]},
    });
    if(!input.finalModelContext ||
        canonicalJson(input.finalModelContext)!==canonicalJson(expectedModelContext)){
      throw new SeyeonR23OfflineG2CommitHoldV1();
    }
    const finalModelContextDigest='sha256:v1:'+
      createHash('sha256').update(canonicalJson(expectedModelContext)).digest('hex');

    const selection=selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories:input.finalRetrievedMemories,
      sourceCandidates:input.sourceCandidates,
    });
    const original=selection.selectedSources[0];
    if(selection.selectedMemoryCount!==1
      ||selection.selectedPersonalRecordCount!==1
      ||selection.persistedBeforeModel!==false
      ||selection.permitsAtomicCommit!==false
      ||selection.permitsHttpReveal!==false
      ||!original||original.recordKind!=='memory'
      ||original.recordType!=='shared_detail'
      ||original.schemaVersion!=='memory-v1'
      ||!UUID.test(original.recordId)||!UUID.test(original.grantId)
      ||!SHA.test(original.rawRecordDigest)
      ||!SHA.test(original.projectedMemoryDigest)
      ||canonicalJson(selection)!==canonicalJson(input.preModelSelection)){
      throw new SeyeonR23OfflineG2CommitHoldV1();
    }
    const r=input.g1Receipt;
    if(!r||r.contextReady!==true
      ||r.turnId!==input.turnId||r.attemptId!==input.attemptId
      ||r.selectedSourcesDigest!==selection.selectedSourcesDigest
      ||r.finalModelContextDigest!==finalModelContextDigest
      ||r.recordId!==original.recordId
      ||r.originalGrantId!==original.grantId
      ||!PG_SHA.test(r.pgPayloadDigest)){
      throw new SeyeonR23OfflineG2CommitHoldV1();
    }
    // The existing official worker schema also rejects a self-consistently
    // re-hashed but malformed or unrelated Post-turn Outbox snapshot.
    // Its normalized envelope MUST equal the exact payload sent to R23.
    // These checks are offline integrity only, never DB owner authority.
    const checkedSnapshot=validateSeyeonPostTurnAnalysisSnapshotV1(
      input.postTurnSnapshot,input.postTurnSnapshotHash,
    );
    if(checkedSnapshot.turnId!==input.turnId
      ||checkedSnapshot.assistantMessageId!==input.assistantMessageId
      ||canonicalJson(checkedSnapshot)!==canonicalJson(input.postTurnSnapshot))
      throw new SeyeonR23OfflineG2CommitHoldV1();

    const actual=await executePostgresSubjectTransactionV1({
      pool:input.pool,
      verifiedEvidence:input.verifiedEvidence,
      execute:async ({client,resolvedSubject})=>{
        if(resolvedSubject.subjectKind!=='member'
          ||!UUID.test(resolvedSubject.subjectId))
          throw new SeyeonR23OfflineG2CommitHoldV1();
        const db=await client.query<{name:unknown}>(
          'select current_database() as name');
        if(db.rows.length!==1||
          db.rows[0]?.name!==SEYEON_R23_OFFLINE_G2_COMMIT_V1.database)
          throw new SeyeonR23OfflineG2CommitHoldV1();
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        await client.query("SET LOCAL statement_timeout = '7000ms'");
        const result=await client.query<{receipt:unknown}>(`
select seyeon_positive_candidate.commit_actual_v2_r3(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
  $6::uuid,$7::uuid,$8::jsonb,$9::text,$10::text
) as receipt
`.trim(),[
          resolvedSubject.subjectId,
          input.threadId,input.turnId,input.attemptId,input.assistantMessageId,
          input.chatOutboxId,input.postTurnOutboxId,
          JSON.stringify(input.postTurnSnapshot),
          input.postTurnSnapshotHash,selection.selectedSourcesDigest,
        ]);
        const value=result.rows.length===1?result.rows[0]?.receipt:null;
        if(!value||typeof value!=='object'||Array.isArray(value))
          throw new SeyeonR23OfflineG2CommitHoldV1();
        const v=value as Record<string,unknown>;
        if(Object.keys(v).length!==5
          ||v.turnId!==input.turnId||v.attemptId!==input.attemptId
          ||v.assistantMessageId!==input.assistantMessageId
          ||v.postTurnOutboxEventId!==input.postTurnOutboxId
          ||v.replayed!==false)
          throw new SeyeonR23OfflineG2CommitHoldV1();
        return v;
      },
    });
    // Only after COMMIT; ambiguity or replay leaves caller in HOLD.
    return Object.freeze({
      status:'disposable_atomic_v2_committed' as const,
      turnId:actual.turnId as string,
      attemptId:actual.attemptId as string,
      assistantMessageId:actual.assistantMessageId as string,
      postTurnOutboxEventId:actual.postTurnOutboxEventId as string,
      replayed:false as const,
      permitsProvider:false as const,
      permitsHttpReveal:false as const,
    });
  }catch{
    throw new SeyeonR23OfflineG2CommitHoldV1();
  }
}
