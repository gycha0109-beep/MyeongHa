// Watchtower-Track: security
// G1 source-only atomic pin: original Memory and the current DB User model text.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {selectSeyeonRuntimeRecentMessagesV2,type SeyeonRecentMessageV2}
  from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type {PostgresTransactionQueryV1} from './postgres-subject-execution.js';
import type {SeyeonExactModelPersonalSourceSelectionV1}
  from './seyeon-exact-model-personal-source-selection-v1.js';
import type {SeyeonPositiveS0SourcePinInputV1}
  from './postgres-seyeon-positive-memory-source-runtime-v1.js';

const SHA=/^sha256:v1:[a-f0-9]{64}$/u;
const PG_SHA=/^sha256:pg-jsonb:v1:[a-f0-9]{64}$/u;
const hash=(v:unknown):string=>'sha256:v1:'+createHash('sha256')
  .update(canonicalJson(v)).digest('hex');
const hold=():never=>{throw Error('G1 combined original model source Pin unavailable');};

export const SEYEON_G1_COMBINED_SOURCE_PIN_V1=Object.freeze({
  sql:'seyeon_private.pin_positive_model_context_sources_v1',
  productionMounted:false,permitsProvider:false,
  permitsAtomicCommit:false,permitsHttpReveal:false,
} as const);

export interface SeyeonG1CombinedModelPinRequestV1 extends
  SeyeonPositiveS0SourcePinInputV1 {
  readonly currentUserMessageId:string;
  readonly recentMessages:readonly SeyeonRecentMessageV2[];
  readonly maxRecentMessages?:number;
  readonly selection:SeyeonExactModelPersonalSourceSelectionV1;
}

export async function pinSeyeonG1CombinedModelSourcesV1(
  client:PostgresTransactionQueryV1,
  input:Readonly<SeyeonG1CombinedModelPinRequestV1>,
):Promise<Readonly<Record<string,unknown>>> {
  const s=input.selection;
  const m=s?.selectedCurrentUserSource;
  const source=s?.selectedSources?.[0];
  if(!s||!m||!source||s.persistedBeforeModel!==false
    ||s.permitsAtomicCommit!==false||s.permitsHttpReveal!==false
    ||s.selectedPersonalRecordCount!==1||s.selectedMemoryCount!==1
    ||s.selectedSources.length!==1
    ||s.selectedUnpinnedRecentSources.length!==0
    ||s.selectedUnpinnedDerivedSources.length!==0
    ||m.role!=='user'||m.messageId!==input.currentUserMessageId
    ||m.persistedBeforeModel!==false
    ||source.recordKind!=='memory'
    ||source.recordId!==input.originalMemoryId
    ||source.grantId!==input.originalGrantId
    ||source.recordType!==input.recordType
    ||source.schemaVersion!==input.schemaVersion
    ||source.projectorVersion!==input.projectorVersion
    ||source.projectedMemoryDigest!==input.projectedMemoryDigest
    ||source.rawRecordPgDigest!==input.expectedOriginalPgDigest
    ||!PG_SHA.test(input.expectedOriginalPgDigest)
    ||!SHA.test(input.finalModelContextDigest)
    ||hash(s.selectedSources)!==s.selectedSourcesDigest
    ||s.selectedSourcesDigest!==input.selectedSourcesDigest
    ||hash({originalPersonalSources:s.selectedSources,currentUserSource:m,
      unpinnedRecentSources:[],unpinnedDerivedSources:[]})
      !==s.selectedModelSourceCensusDigest)throw Error('G1 combined model source scope invalid');
  let messages:readonly SeyeonRecentMessageV2[];
  try {
    messages=selectSeyeonRuntimeRecentMessagesV2({
      recentMessages:input.recentMessages,
      ...(input.maxRecentMessages===undefined
        ?{}:{maxRecentMessages:input.maxRecentMessages}),
    });
  }catch{return hold();}
  const model=messages[0];
  if(messages.length!==1||!model||model.role!=='user'
    ||model.messageId!==input.currentUserMessageId
    ||hash(model)!==m.selectedModelMessageDigest)throw Error('G1 current model text mismatch');

  const result=await client.query<{proof:unknown}>(`
select seyeon_private.pin_positive_model_context_sources_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::jsonb,$7::text,
  $8::uuid,$9::uuid,$10::text,$11::text,$12::text,$13::text,$14::text,
  $15::text,$16::text
) as proof`.trim(),[
    input.subjectId,input.threadId,input.turnId,input.attemptId,
    input.currentUserMessageId,JSON.stringify([{
      messageId:model.messageId,role:model.role,text:model.text,
      selectedModelMessageDigest:m.selectedModelMessageDigest,
    }]),s.selectedModelSourceCensusDigest,
    input.originalMemoryId,input.originalGrantId,input.recordType,
    input.schemaVersion,input.projectorVersion,input.selectedSourcesDigest,
    input.projectedMemoryDigest,input.finalModelContextDigest,
    input.expectedOriginalPgDigest,
  ]);
  const row=result.rows[0];
  if(result.rows.length!==1||!row||!row.proof
    ||typeof row.proof!=='object'||Array.isArray(row.proof))
    throw Error('G1 combined DB receipt invalid');
  const root=row.proof as Record<string,unknown>;
  const memory=root.positiveProof;
  const recent=root.recentSourceProof;
  if(!memory||typeof memory!=='object'||Array.isArray(memory)
    ||!recent||typeof recent!=='object'||Array.isArray(recent))
    throw Error('G1 combined DB proof missing');
  const a=memory as Record<string,unknown>;
  const b=recent as Record<string,unknown>;
  if(a.subjectId!==input.subjectId||a.threadId!==input.threadId
    ||a.turnId!==input.turnId||a.attemptId!==input.attemptId
    ||a.recordId!==input.originalMemoryId
    ||a.originalGrantId!==input.originalGrantId
    ||a.finalModelContextDigest!==input.finalModelContextDigest
    ||a.selectedSourcesDigest!==input.selectedSourcesDigest
    ||a.originalPgJsonbDigest!==input.expectedOriginalPgDigest
    ||b.subjectId!==input.subjectId||b.threadId!==input.threadId
    ||b.turnId!==input.turnId||b.attemptId!==input.attemptId
    ||b.selectedModelSourceCensusDigest!==s.selectedModelSourceCensusDigest
    ||!Array.isArray(b.sources)||b.sources.length!==1)
    throw Error('G1 combined DB proof mismatch');
  const rowSource=b.sources[0] as Record<string,unknown>|undefined;
  if(!rowSource||rowSource.messageId!==model.messageId
    ||rowSource.role!=='user'
    ||rowSource.selectedModelMessageDigest!==m.selectedModelMessageDigest
    ||rowSource.dbBodySha256!=='sha256:v1:'+
      createHash('sha256').update(model.text).digest('hex'))
    throw Error('G1 combined DB current User proof mismatch');
  return Object.freeze(a);
}
