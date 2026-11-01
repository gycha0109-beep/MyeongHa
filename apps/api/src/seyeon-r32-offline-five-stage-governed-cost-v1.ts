// Watchtower-Track: security
// R32: one atomic, DB-owned Stage/Cost/Grant reservation per synthetic call.
// No Production mounting, Provider fetch, Chat Commit or HTTP private Reveal.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {
  assembleSeyeonRuntimeContextV2,
} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  selectSeyeonExactModelPersonalSourcesV1,
} from './seyeon-exact-model-personal-source-selection-v1.js';
import {
  buildSeyeonTurnInterpreterRequestV2,
  SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
  type SeyeonStructuredProviderRequestV2,
} from './seyeon-character-runtime-v2.js';
import {
  executePostgresSubjectTransactionV1,
} from './postgres-subject-execution.js';
import {
  type SeyeonAiGovernorAdmissionV1,
} from './postgres-seyeon-ai-cost-ledger-v1.js';
import {
  quoteSeyeonCostGovernorMaximumV1,
} from './seyeon-cost-governor-server-policy-v1.js';
import {
  assertSeyeonR21OfflineDerivedSourceClosureV1,
} from './seyeon-r21-offline-derived-source-closure-v1.js';
import {
  SEYEON_PROVIDER_UNTRUSTED_DATA_BOUNDARY_V1,
  type OpenAiSeyeonStructuredProviderConfigV1,
} from './openai-seyeon-structured-provider-v1.js';
import type {PersistSeyeonR20OfflineDigestBoundInputV1} from
  './seyeon-positive-raw-projection-digest-bind-r20-candidate.js';

const DB='myeongha_seyeon_positive_pin_candidate_test';
const MODEL='seyeon-r35-offline';
const PROVIDER='openai-responses';
const OUTPUT_CAP=256;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const DIGEST=/^sha256:v1:[a-f0-9]{64}$/u;
const WIRE=/^sha256:wire-utf8:v1:[a-f0-9]{64}$/u;
const purposes=[
  'integrity_classification',
  'disclosure_classification',
  'turn_interpretation',
  'dialogue_render',
  'semantic_review',
] as const;
type StagePurpose=typeof purposes[number];
const hash=(value:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(value)).digest('hex');
const hashWire=(body:string)=>'sha256:wire-utf8:v1:'+
  createHash('sha256').update(body,'utf8').digest('hex');

export class SeyeonR32OfflineFiveStageHoldV1 extends Error{
  readonly code='R32_FIVE_STAGE_GOVERNED_COST_HOLD' as const;
  constructor(){
    super('Five-stage offline native wire and governed cost are not jointly committed.');
    this.name='SeyeonR32OfflineFiveStageHoldV1';
  }
}
export interface ReserveSeyeonR32OfflineStageInputV1{
  readonly pinInput:PersistSeyeonR20OfflineDigestBoundInputV1;
  readonly request:SeyeonStructuredProviderRequestV2;
  readonly call:Parameters<NonNullable<
    OpenAiSeyeonStructuredProviderConfigV1['meteredBeforeDispatch']
  >>[0];
  readonly requestBody:string;
  /** Server-owned offline rate/certification only; no production inference. */
  readonly governor:SeyeonAiGovernorAdmissionV1;
}
export interface SeyeonR32OfflineStageReceiptV1{
  readonly status:'disposable_stage_and_cost_reserved_without_dispatch';
  readonly attemptId:string;
  readonly stageIndex:number;
  readonly purpose:StagePurpose;
  readonly callId:string;
  readonly nativeWireDigest:string;
  readonly previousWireDigest:string|null;
  readonly selectedSourcesDigest:string;
  readonly inputCeilingTokens:number;
  readonly outputCeilingTokens:256;
  readonly reservedMicroUsd:string;
  readonly bucketUtcDate:string;
  readonly interpreterContextSealed:boolean;
  readonly permitsProvider:false;
  readonly permitsAtomicCommit:false;
  readonly permitsHttpReveal:false;
}
/**
 * This is an offline pre-dispatch rehearsal, NOT an original-data production
 * ingress. Four stages use synthetic input only; the interpreter must match
 * the exact assembled original-only R21 Context. Every attempt to call the
 * actual Provider after this function returns must still be rejected.
 *
 * The SQL Owner first verifies two active original Grants + the exact native
 * wire and ordered predecessor, THEN commits Cost Governor reservation in
 * that same Subject transaction. DB failure rolls back both.
 */
export async function reserveSeyeonR32OfflineFiveStageV1(
  input:ReserveSeyeonR32OfflineStageInputV1,
):Promise<SeyeonR32OfflineStageReceiptV1>{
  try{
    const {pinInput,request,call,requestBody,governor}=input;
    const s=pinInput.selection;
    if(!s||s.selectedPersonalRecordCount!==2||s.selectedMemoryCount!==2
      ||s.selectedSources.length!==2||!DIGEST.test(s.selectedSourcesDigest)
      ||!UUID.test(call.callId)||!UUID.test(pinInput.attemptId)
      ||request.contractVersion!==SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2
      ||!purposes.includes(request.purpose as StagePurpose)
      ||call.purpose!==request.purpose
      ||call.providerKey!==PROVIDER||call.modelKey!==MODEL
      ||governor.policy.providerKey!==PROVIDER||governor.policy.modelKey!==MODEL
      ||governor.policy.maximumOutputTokens!==OUTPUT_CAP
      ||!governor.policy.allowedPurposes.includes(request.purpose)
      ||typeof requestBody!=='string')throw new SeyeonR32OfflineFiveStageHoldV1();
    assertSeyeonR21OfflineDerivedSourceClosureV1({
      envelope:pinInput.sourceEnvelope,
      retrievedMemories:pinInput.retrievedMemories,
      sourceCandidates:pinInput.sourceCandidates,
      expectedOriginalMemoryCount:2,
    });
    const recomputed=selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories:pinInput.retrievedMemories,
      sourceCandidates:pinInput.sourceCandidates,
      ...(pinInput.maxRetrievedMemories===undefined?{}:{
        maxRetrievedMemories:pinInput.maxRetrievedMemories,
      }),
    });
    if(canonicalJson(recomputed)!==canonicalJson(s))
      throw new SeyeonR32OfflineFiveStageHoldV1();
    const reconstructed=assembleSeyeonRuntimeContextV2({
      relationship:null,relationshipSemantics:null,
      recentMessages:[],retrievedMemories:pinInput.retrievedMemories,
      integrityDecisions:[],governedPreflightApplied:false,
      disclosure:{decision:null,retrievedSources:[]},
      ...(pinInput.maxRetrievedMemories===undefined?{}:{
        maxRetrievedMemories:pinInput.maxRetrievedMemories,
      }),
    });
    if(canonicalJson(reconstructed)!==canonicalJson(pinInput.finalModelContext))
      throw new SeyeonR32OfflineFiveStageHoldV1();
    if(request.purpose==='turn_interpretation' &&
      canonicalJson(request)!==canonicalJson(
        buildSeyeonTurnInterpreterRequestV2(reconstructed),
      ))throw new SeyeonR32OfflineFiveStageHoldV1();
    // Four non-interpreter inputs MUST be the small synthetic metadata
    // envelope. Never accept actual unpinned Preflight/Reader/Renderer text
    // as a convenient offline "Stage" merely because its wire is valid.
    let syntheticPrevious:string|null=null;
    if(request.purpose!=='turn_interpretation'){
      const x=request.input;
      if(!x||typeof x!=='object'||Array.isArray(x))
        throw new SeyeonR32OfflineFiveStageHoldV1();
      const v=x as Record<string,unknown>;
      if(Object.keys(v).length!==4
        ||v.fixture!==true||v.purpose!==request.purpose
        ||v.selectedSourcesDigest!==s.selectedSourcesDigest
        ||(v.priorNativeWireDigest!==null
          &&(typeof v.priorNativeWireDigest!=='string'
            ||!WIRE.test(v.priorNativeWireDigest))))
        throw new SeyeonR32OfflineFiveStageHoldV1();
      syntheticPrevious=v.priorNativeWireDigest as string|null;
    }
    const expectedBody=JSON.stringify({
      model:MODEL,store:false,max_output_tokens:OUTPUT_CAP,
      instructions:request.instructions+'\n\n'+SEYEON_PROVIDER_UNTRUSTED_DATA_BOUNDARY_V1,
      input:[{role:'user',content:[{
        type:'input_text',text:JSON.stringify(request.input),
      }]}],
      text:{format:{
        type:'json_schema',name:'myeongha_'+request.purpose+'_v2',
        strict:true,schema:request.responseSchema,
      }},
    });
    const bytes=Buffer.byteLength(expectedBody,'utf8');
    if(requestBody!==expectedBody||call.requestBodyBytes!==bytes
      ||bytes<1||bytes>65_536)
      throw new SeyeonR32OfflineFiveStageHoldV1();
    const bound=await governor.certifiedInputTokenUpperBound(
      request,bytes,requestBody,
    );
    const quote=quoteSeyeonCostGovernorMaximumV1({
      policy:governor.policy,
      request:{
        purpose:request.purpose,providerKey:PROVIDER,modelKey:MODEL,
        verifiedInputTokenUpperBound:bound,
        serializedRequestBytes:bytes,
        enforcedOutputTokenLimit:OUTPUT_CAP,
      },
    });
    const charged=await executePostgresSubjectTransactionV1({
      pool:pinInput.pool,verifiedEvidence:pinInput.verifiedEvidence,
      execute:async({client,resolvedSubject})=>{
        if(resolvedSubject.subjectKind!=='member'
          ||!UUID.test(resolvedSubject.subjectId))
          throw new SeyeonR32OfflineFiveStageHoldV1();
        const db=await client.query<{name:unknown}>(
          'select current_database() as name',
        );
        if(db.rows.length!==1||db.rows[0]?.name!==DB)
          throw new SeyeonR32OfflineFiveStageHoldV1();
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        await client.query("SET LOCAL statement_timeout = '7000ms'");
        const r=await client.query<{receipt:unknown}>(`
select seyeon_positive_candidate.claim_governed_stage_r32(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,
  $7::text,$8::text,$9::text,$10::text,$11::text,$12::text,$13::bigint
) as receipt
`.trim(),[
          resolvedSubject.subjectId,pinInput.threadId,pinInput.turnId,
          pinInput.attemptId,request.purpose,call.callId,s.selectedSourcesDigest,
          hash(reconstructed),hash(request),requestBody,
          quote.policyVersion,quote.rateCardVersion,quote.inputCeilingTokens,
        ]);
        const row=r.rows.length===1?r.rows[0]?.receipt:null;
        if(!row||typeof row!=='object'||Array.isArray(row))
          throw new SeyeonR32OfflineFiveStageHoldV1();
        const v=row as Record<string,unknown>;
        const idx=purposes.indexOf(request.purpose as StagePurpose);
        if(v.status!=='disposable_stage_and_cost_reserved_without_dispatch'
          ||v.attemptId!==pinInput.attemptId||v.purpose!==request.purpose
          ||v.stageIndex!==idx||v.callId!==call.callId
          ||v.nativeWireDigest!==hashWire(requestBody)
          ||v.selectedSourcesDigest!==s.selectedSourcesDigest
          ||v.inputCeilingTokens!==quote.inputCeilingTokens
          ||v.outputCeilingTokens!==quote.outputCeilingTokens
          ||v.reservedMicroUsd!==String(quote.ceilingMicroUsd)
          ||typeof v.bucketUtcDate!=='string'
          ||!/^\d{4}-\d{2}-\d{2}$/u.test(v.bucketUtcDate)
          ||(v.previousWireDigest!==null &&
            (typeof v.previousWireDigest!=='string'
              ||!WIRE.test(v.previousWireDigest)))
          ||v.interpreterContextSealed!==(request.purpose==='turn_interpretation')
          ||(request.purpose!=='turn_interpretation'
            &&v.previousWireDigest!==syntheticPrevious)
          ||v.permitsProvider!==false||v.permitsAtomicCommit!==false
          ||v.permitsHttpReveal!==false)
          throw new SeyeonR32OfflineFiveStageHoldV1();
        return v;
      },
    });
    return Object.freeze(charged as unknown as SeyeonR32OfflineStageReceiptV1);
  }catch{
    throw new SeyeonR32OfflineFiveStageHoldV1();
  }
}
