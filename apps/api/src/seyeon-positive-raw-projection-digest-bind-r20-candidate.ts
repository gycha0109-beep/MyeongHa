// Watchtower-Track: security
// R20 named-disposable pre-model original payload + exact projection binding.
// This offline candidate is NEVER mounted into the Production model runtime.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {
  selectSeyeonExactModelPersonalSourcesV1,
  type SeyeonExactModelPersonalSourceSelectionV1,
} from './seyeon-exact-model-personal-source-selection-v1.js';
import type {SeyeonPersonalRecordProjectionCandidateV1} from './seyeon-production-context-v1.js';
import type {SeyeonRetrievedMemoryV2} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type {VerifiedSubjectIdentityEvidenceV1} from './subject-identity-resolver.js';

const DB='myeongha_seyeon_positive_pin_candidate_test';
const SHA=/^sha256:v1:[a-f0-9]{64}$/u;
const PG_SHA=/^sha256:pg-jsonb:v1:[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const digest=(value:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(value)).digest('hex');

export class SeyeonR20OfflineDigestHoldV1 extends Error {
  readonly code='R20_SOURCE_DIGEST_NOT_BOUND' as const;
  constructor(){super('Offline original Record and final model projection were not jointly verified.');this.name='SeyeonR20OfflineDigestHoldV1';}
}
export interface PersistSeyeonR20OfflineDigestBoundInputV1 {
  readonly pool:PostgresSubjectPoolV1;
  readonly verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
  readonly threadId:string;
  readonly turnId:string;
  readonly attemptId:string;
  readonly retrievedMemories:readonly SeyeonRetrievedMemoryV2[];
  readonly sourceCandidates:readonly SeyeonPersonalRecordProjectionCandidateV1[];
  readonly maxRetrievedMemories?:number;
  readonly selection:SeyeonExactModelPersonalSourceSelectionV1;
}
export interface SeyeonR20OfflineDigestBoundReceiptV1 {
  readonly status:'disposable_original_and_projection_digests_committed';
  readonly selectedPersonalRecordCount:number;
  readonly selectedSourcesDigest:string;
  readonly permitsProvider:false;
  readonly permitsAtomicCommit:false;
  readonly permitsHttpReveal:false;
}

type OriginalRow={
  ordinal:unknown;recordKind:unknown;recordId:unknown;grantId:unknown;
  recordType:unknown;schemaVersion:unknown;payload:unknown;pgPayloadDigest:unknown;
};
type DBOriginalSet={
  selectedSourcesDigest:unknown;sourceCount:unknown;sources:unknown;
};
/**
 * This is a dual-codec CORRESPONDENCE check, not comparing unlike digests.
 * PG verifies current original JSONB and immutable R1 Edge with its own
 * pg-jsonb hash. Node verifies canonicalJson({kind,ids,type,schema,payload})
 * against the server-side projector raw hash and exact-final projected memory
 * hash, still inside R1's transaction. Failure rolls back the Parent+Edges.
 *
 * It cannot authorize a real SRC-25 type, arbitrary derived Chat history,
 * Provider use, G2 Commit, HTTP Reveal or production DB role.
 */
export async function persistSeyeonR20OfflineDigestBoundPinV1(
  input:PersistSeyeonR20OfflineDigestBoundInputV1,
):Promise<SeyeonR20OfflineDigestBoundReceiptV1>{
  try {
    if(input.verifiedEvidence.kind!=='member'
      || !UUID.test(input.verifiedEvidence.verifiedAuthUserId)
      || !UUID.test(input.threadId)||!UUID.test(input.turnId)
      || !UUID.test(input.attemptId))throw new SeyeonR20OfflineDigestHoldV1();

    const selected=selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories:input.retrievedMemories,
      sourceCandidates:input.sourceCandidates,
      ...(input.maxRetrievedMemories===undefined?{}:{
        maxRetrievedMemories:input.maxRetrievedMemories}),
    });
    if(canonicalJson(selected)!==canonicalJson(input.selection)
      || selected.selectedPersonalRecordCount<1
      || selected.selectedPersonalRecordCount>2
      || selected.selectedPersonalRecordCount!==selected.selectedMemoryCount
      || selected.permitsAtomicCommit!==false
      || selected.permitsHttpReveal!==false
      || selected.persistedBeforeModel!==false
      || !SHA.test(selected.selectedSourcesDigest)
      || selected.selectedSources.some(s=>
        s.recordKind!=='memory'||s.recordType!=='shared_detail'
        ||s.schemaVersion!=='memory-v1'
        ||!UUID.test(s.recordId)||!UUID.test(s.grantId)
        ||!SHA.test(s.rawRecordDigest)||!SHA.test(s.projectedMemoryDigest))
    )throw new SeyeonR20OfflineDigestHoldV1();
    const originalIds=selected.selectedSources.map(s=>({
      recordId:s.recordId,grantId:s.grantId,
    }));

    await executePostgresSubjectTransactionV1({
      pool:input.pool,
      verifiedEvidence:input.verifiedEvidence,
      execute:async ({resolvedSubject,client})=>{
        if(resolvedSubject.subjectKind!=='member'
          || !UUID.test(resolvedSubject.subjectId))
          throw new SeyeonR20OfflineDigestHoldV1();
        const name=await client.query<{dbName:unknown}>(
          'select current_database() as "dbName"');
        if(name.rows.length!==1||name.rows[0]?.dbName!==DB)
          throw new SeyeonR20OfflineDigestHoldV1();
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        await client.query("SET LOCAL statement_timeout = '5000ms'");
        const pin=await client.query<{pinned:unknown}>(`
select seyeon_positive_candidate.pin_source_set_r1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::text
) as pinned
`.trim(),[
          resolvedSubject.subjectId,input.threadId,input.turnId,input.attemptId,
          JSON.stringify(originalIds),selected.selectedSourcesDigest,
        ]);
        if(pin.rows.length!==1||pin.rows[0]?.pinned!==true)
          throw new SeyeonR20OfflineDigestHoldV1();
        const inspected=await client.query<{original:DBOriginalSet|null}>(`
select seyeon_positive_candidate.inspect_pinned_raw_source_r20(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid
) as original
`.trim(),[
          resolvedSubject.subjectId,input.threadId,input.turnId,input.attemptId,
        ]);
        const proof=inspected.rows.length===1?inspected.rows[0]?.original:null;
        if(!proof || proof.selectedSourcesDigest!==selected.selectedSourcesDigest
          ||proof.sourceCount!==selected.selectedPersonalRecordCount
          ||!Array.isArray(proof.sources)
          ||proof.sources.length!==selected.selectedPersonalRecordCount)
          throw new SeyeonR20OfflineDigestHoldV1();
        for(let i=0;i<proof.sources.length;i++){
          const row=proof.sources[i] as OriginalRow;
          const src=selected.selectedSources[i]!;
          if(!row||row.ordinal!==i||row.recordKind!==src.recordKind
            ||row.recordId!==src.recordId||row.grantId!==src.grantId
            ||row.recordType!==src.recordType
            ||row.schemaVersion!==src.schemaVersion
            ||typeof row.pgPayloadDigest!=='string'
            ||!PG_SHA.test(row.pgPayloadDigest))
            throw new SeyeonR20OfflineDigestHoldV1();
          const nodeOriginal=digest({
            kind:src.recordKind,recordId:src.recordId,grantId:src.grantId,
            recordType:src.recordType,schemaVersion:src.schemaVersion,
            payload:row.payload,
          });
          if(nodeOriginal!==src.rawRecordDigest)
            throw new SeyeonR20OfflineDigestHoldV1();
        }
      },
    });
    return Object.freeze({
      status:'disposable_original_and_projection_digests_committed' as const,
      selectedPersonalRecordCount:selected.selectedPersonalRecordCount,
      selectedSourcesDigest:selected.selectedSourcesDigest,
      permitsProvider:false as const,permitsAtomicCommit:false as const,
      permitsHttpReveal:false as const,
    });
  }catch{
    // Missing readback, bad lineage, stale Grant or ambiguous COMMIT = HOLD.
    throw new SeyeonR20OfflineDigestHoldV1();
  }
}
