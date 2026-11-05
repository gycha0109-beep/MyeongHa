// Watchtower-Track: security
// G1 exact source states: a missing/unknown/unsupported original is not ZERO.
// No model/Commit/Reveal authority is emitted by this classifier.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {selectSeyeonRuntimeRetrievedMemoriesV2} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type {RunSeyeonCharacterTurnV2Input} from './seyeon-character-runtime-v2.js';
import type {SeyeonProductionContextSnapshotV1} from './seyeon-production-context-v1.js';

export type SeyeonG1OriginalSourceStateV1 =
  |'EXPLICIT_ZERO'
  |'UNSUPPORTED_SCHEMA_EXCLUDED'
  |'ONE_MEMORY_CANDIDATE_ONLY'
  |'MISSING_ORIGINAL'
  |'UNKNOWN_ORIGINAL'
  |'UNSUPPORTED_SELECTED_KIND';

export interface SeyeonG1OriginalSourceStateResultV1{
  readonly state:SeyeonG1OriginalSourceStateV1;
  readonly selectedPersonalRecordCount:number;
  readonly unsupportedSchemaCount:number;
  readonly authorizesModel:false;
  readonly permitsAtomicCommit:false;
  readonly permitsHttpReveal:false;
}

function hash(value:unknown):string{
  return 'sha256:v1:'+createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function result(
  state:SeyeonG1OriginalSourceStateV1,count:number,unsupported:number,
):Readonly<SeyeonG1OriginalSourceStateResultV1>{
  return Object.freeze({
    state,selectedPersonalRecordCount:count,unsupportedSchemaCount:unsupported,
    authorizesModel:false as const,permitsAtomicCommit:false as const,
    permitsHttpReveal:false as const,
  });
}

/**
 * Uses the final normalizer-selected model Memory list, not all DB records.
 * Distinguishes an intentional zero selection from a missing or unknown
 * original, and from an unsupported (deliberately excluded) DB schema.
 *
 * The authority row/Grant is still validated by the G1 DB Owner; this is
 * only a strict pre-model decision and never substitutes for an Owner Pin.
 */
export function classifySeyeonG1OriginalSourceStateV1(input:Readonly<{
  context:SeyeonProductionContextSnapshotV1;
  modelInput:RunSeyeonCharacterTurnV2Input['contextInput'];
}>):Readonly<SeyeonG1OriginalSourceStateResultV1>{
  const c=input?.context;
  const m=input?.modelInput;
  if(!c||c.version!=='seyeon-production-context-v1'||!m
    ||!Array.isArray(c.personalRecordAdmissions)
    ||!Array.isArray(c.retrievedMemories)
    ||!Array.isArray(m.retrievedMemories))
    return result('UNKNOWN_ORIGINAL',0,0);
  const admissions=c.personalRecordAdmissions;
  let unsupported=0;
  let selected:ReturnType<typeof selectSeyeonRuntimeRetrievedMemoriesV2>;
  try{
    selected=selectSeyeonRuntimeRetrievedMemoriesV2({
      retrievedMemories:m.retrievedMemories,
      ...(m.maxRetrievedMemories===undefined?{}:{
        maxRetrievedMemories:m.maxRetrievedMemories,
      }),
    });
  }catch{return result('UNKNOWN_ORIGINAL',0,unsupported);}
  const personal=selected.filter(x=>x.kind==='memory'||x.kind==='life_fact');
  for(const admission of admissions){
    if(!admission||typeof admission!=='object'
      ||!['memory','life_fact'].includes(admission.recordKind)
      ||typeof admission.recordId!=='string'||!admission.recordId
      ||typeof admission.recordType!=='string'||!admission.recordType
      ||typeof admission.schemaVersion!=='string'||!admission.schemaVersion)
      return result('UNKNOWN_ORIGINAL',personal.length,unsupported);
    if(admission.reason==='UNSUPPORTED_SCHEMA')unsupported++;
    else if(admission.reason!=='ADMITTED')
      return result('UNKNOWN_ORIGINAL',personal.length,unsupported);
  }
  if(personal.length===0){
    return result(unsupported>0?'UNSUPPORTED_SCHEMA_EXCLUDED':'EXPLICIT_ZERO',
      0,unsupported);
  }
  if(personal.length>1)return result('UNKNOWN_ORIGINAL',personal.length,unsupported);
  const one=personal[0]!;
  if(one.kind==='life_fact')return result('UNSUPPORTED_SELECTED_KIND',1,unsupported);

  const candidates=c.personalRecordProjectionCandidates;
  if(!Array.isArray(candidates)||candidates.length===0)
    return result('MISSING_ORIGINAL',1,unsupported);
  const matching=candidates.filter(candidate=>candidate?.projectedMemoryId===one.memoryId);
  if(matching.length===0)return result('MISSING_ORIGINAL',1,unsupported);
  if(matching.length!==1)return result('UNKNOWN_ORIGINAL',1,unsupported);
  const candidate=matching[0]!;
  const matchingAdmission=admissions.filter(a=>
    a.recordKind===candidate.recordKind && a.recordId===candidate.recordId);
  if(matchingAdmission.length===0)return result('MISSING_ORIGINAL',1,unsupported);
  if(matchingAdmission.length!==1)return result('UNKNOWN_ORIGINAL',1,unsupported);
  const admission=matchingAdmission[0]!;
  if(admission.reason==='UNSUPPORTED_SCHEMA')
    return result('UNSUPPORTED_SELECTED_KIND',1,unsupported);
  if(admission.reason!=='ADMITTED'
    ||candidate.recordKind!=='memory'
    ||candidate.projectedMemoryId!=='memory:'+candidate.recordId
    ||one.sourceRef!=='memory:'+candidate.recordId+':grant:'+candidate.grantId
    ||hash(one)!==candidate.projectedMemoryDigest
    ||candidate.recordType!==admission.recordType
    ||candidate.schemaVersion!==admission.schemaVersion
    ||typeof candidate.rawRecordPgDigest!=='string'
    ||!/^sha256:pg-jsonb:v1:[a-f0-9]{64}$/u.test(candidate.rawRecordPgDigest)
    ||typeof candidate.projectorVersion!=='string'
    ||candidate.projectorVersion.length===0)
    return result('UNKNOWN_ORIGINAL',1,unsupported);
  return result('ONE_MEMORY_CANDIDATE_ONLY',1,unsupported);
}

export class SeyeonG1OriginalSourceStateHoldV1 extends Error{
  readonly code='SEYEON_G1_ORIGINAL_SOURCE_NOT_ADMISSIBLE' as const;
  constructor(readonly reason:SeyeonG1OriginalSourceStateV1){
    super('Historical G1 original source is unavailable for model use.');
    this.name='SeyeonG1OriginalSourceStateHoldV1';
  }
}
