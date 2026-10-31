// Watchtower-Track: security
// R21: pre-model derived-source admission fence for the R20 disposable flow.
// This does NOT attest content added later by Preflight or Provider.
import {
  SEYEON_PRODUCTION_CONTEXT_VERSION_V1,
  type SeyeonProductionContextSnapshotV1,
  type SeyeonPersonalRecordProjectionCandidateV1,
} from './seyeon-production-context-v1.js';
import type {SeyeonRetrievedMemoryV2} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {selectSeyeonExactModelPersonalSourcesV1} from './seyeon-exact-model-personal-source-selection-v1.js';

export const SEYEON_R21_OFFLINE_DERIVED_SOURCE_CLOSURE_V1 =
  'seyeon-r21-offline-derived-source-closure-v1' as const;

/** Server-assembled, checked BEFORE the R20 disposable DB transaction. */
export type SeyeonR21SourceSnapshotV1 = Pick<
  SeyeonProductionContextSnapshotV1,
  'version' | 'retrievedMemories' | 'personalRecordAdmissions' |
  'personalRecordProjectionCandidates' | 'recentMessages' |
  'relationshipHistoryRecords' | 'activeRelationshipEventCount' |
  'historyThroughRevision' | 'relationshipRevisionUsedForTurn'
>;

export interface SeyeonR21OfflineDerivedSourceEnvelopeV1 {
  readonly version:typeof SEYEON_R21_OFFLINE_DERIVED_SOURCE_CLOSURE_V1;
  readonly sourceSnapshot:SeyeonR21SourceSnapshotV1;
  /** Preflight private ingress is NOT yet authorized, so it must not have run. */
  readonly preflightState:'not_run';
  /** Any unmodelled source ingress is denied rather than omitted. */
  readonly disclosureRetrievedPrivateSources:readonly unknown[];
  readonly readerDerivedSources:readonly unknown[];
  readonly workerDerivedSources:readonly unknown[];
  readonly externalToolPrivateSources:readonly unknown[];
}

export class SeyeonR21DerivedSourceClosureHoldV1 extends Error {
  readonly code='R21_UNPINNED_DERIVED_MODEL_SOURCE_HOLD' as const;
  constructor(){
    super('Pre-model source snapshot includes unpinned derived content or unknown ingress.');
    this.name='SeyeonR21DerivedSourceClosureHoldV1';
  }
}
function exactKeys(value:unknown,keys:readonly string[]):boolean{
  return value!==null&&typeof value==='object'&&!Array.isArray(value)
    &&Object.keys(value).length===keys.length
    &&Object.keys(value).every(k=>keys.includes(k));
}

/**
 * R20 only stores original synthetic Memory/Grant origins. This mandatory
 * negative-source fence rejects ANY history, relationship or preflight
 * material, even if the personal Memory portion is correctly DB-pinned.
 * Real positive derived lineage and post-preflight provenance are still
 * G0/G1 HOLD; no Provider, G2 or Reveal permission is conferred.
 */
export function assertSeyeonR21OfflineDerivedSourceClosureV1(input:{
  readonly envelope:SeyeonR21OfflineDerivedSourceEnvelopeV1;
  readonly retrievedMemories:readonly SeyeonRetrievedMemoryV2[];
  readonly sourceCandidates:readonly SeyeonPersonalRecordProjectionCandidateV1[];
}):void{
  const e=input.envelope;
  const k=['version','sourceSnapshot','preflightState',
    'disclosureRetrievedPrivateSources','readerDerivedSources',
    'workerDerivedSources','externalToolPrivateSources'];
  if(!exactKeys(e,k)||e.version!==SEYEON_R21_OFFLINE_DERIVED_SOURCE_CLOSURE_V1
    ||e.preflightState!=='not_run'
    ||!Array.isArray(e.disclosureRetrievedPrivateSources)
    ||!Array.isArray(e.readerDerivedSources)
    ||!Array.isArray(e.workerDerivedSources)
    ||!Array.isArray(e.externalToolPrivateSources)
    ||e.disclosureRetrievedPrivateSources.length!==0
    ||e.readerDerivedSources.length!==0
    ||e.workerDerivedSources.length!==0
    ||e.externalToolPrivateSources.length!==0){
    throw new SeyeonR21DerivedSourceClosureHoldV1();
  }
  const s=e.sourceSnapshot;
  const snapshotKeys=['version','retrievedMemories','personalRecordAdmissions',
    'personalRecordProjectionCandidates','recentMessages',
    'relationshipHistoryRecords','activeRelationshipEventCount',
    'historyThroughRevision','relationshipRevisionUsedForTurn'];
  if(!exactKeys(s,snapshotKeys)
    ||s.version!==SEYEON_PRODUCTION_CONTEXT_VERSION_V1
    ||!Array.isArray(s.retrievedMemories)
    ||!Array.isArray(s.personalRecordAdmissions)
    ||!Array.isArray(s.personalRecordProjectionCandidates)
    ||!Array.isArray(s.recentMessages)
    ||!Array.isArray(s.relationshipHistoryRecords)
    ||s.recentMessages.length!==0
    ||s.relationshipHistoryRecords.length!==0
    ||s.activeRelationshipEventCount!==0
    ||s.historyThroughRevision!==0
    ||(s.relationshipRevisionUsedForTurn!==null
      &&s.relationshipRevisionUsedForTurn!==0)
    ||s.retrievedMemories.some(m=>!m||m.kind!=='memory')
    ||s.personalRecordAdmissions.length!==input.sourceCandidates.length
    ||s.personalRecordProjectionCandidates.length!==input.sourceCandidates.length){
    throw new SeyeonR21DerivedSourceClosureHoldV1();
  }
  try {
    // Reject a differently sorted/modified model input or a shadow projector
    // row unaccounted for in this candidate's exact selection.
    if(canonicalJson(s.retrievedMemories)!==canonicalJson(input.retrievedMemories)
      ||canonicalJson(s.personalRecordProjectionCandidates)
        !==canonicalJson(input.sourceCandidates)){
      throw new SeyeonR21DerivedSourceClosureHoldV1();
    }
    const admissions=new Map<string,unknown>();
    for(const a of s.personalRecordAdmissions){
      if(!a||a.reason!=='ADMITTED'||admissions.has(a.recordId)){
        throw new SeyeonR21DerivedSourceClosureHoldV1();
      }
      admissions.set(a.recordId,a);
    }
    for(const c of input.sourceCandidates){
      const a=admissions.get(c.recordId) as
        SeyeonR21SourceSnapshotV1['personalRecordAdmissions'][number]|undefined;
      if(!a||a.recordKind!==c.recordKind
        ||a.recordType!==c.recordType
        ||a.schemaVersion!==c.schemaVersion){
        throw new SeyeonR21DerivedSourceClosureHoldV1();
      }
    }
    // R21's isolated two-source ContextReady proof must bind exactly the
    // TWO model-selected original memory projections, not merely a snapshot
    // whose admissions happen to have the same count. Reuse the real runtime
    // sorter/cap and source digest matcher; unknown derived/history stays HOLD.
    const selected=selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories:input.retrievedMemories,
      sourceCandidates:input.sourceCandidates,
    });
    if(selected.selectedMemoryCount!==2
      ||selected.selectedPersonalRecordCount!==2
      ||selected.selectedSources.length!==2
      ||selected.selectedUnpinnedDerivedSources.length!==0
      ||selected.selectedSources.some(source=>source.recordKind!=='memory')
      ||s.personalRecordAdmissions.length!==2
      ||new Set(selected.selectedSources.map(source=>source.recordId)).size!==2
      ||new Set(selected.selectedSources.map(source=>source.grantId)).size!==2){
      throw new SeyeonR21DerivedSourceClosureHoldV1();
    }
  } catch {
    throw new SeyeonR21DerivedSourceClosureHoldV1();
  }
}
