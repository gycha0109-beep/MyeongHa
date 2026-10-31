// Watchtower-Track: security
// S0-only source certificate. Provider/Commit/Reveal remain unmounted.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {selectSeyeonRuntimeRecentMessagesV2, type SeyeonRecentMessageV2}
  from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type {PostgresTransactionQueryV1} from './postgres-subject-execution.js';
import type {SeyeonExactModelPersonalSourceSelectionV1}
  from './seyeon-exact-model-personal-source-selection-v1.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA=/^sha256:v1:[a-f0-9]{64}$/u;
const hash=(v:unknown):string=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(v)).digest('hex');
const hold=():never=>{throw Error('G1 recent source certificate unavailable');};

export const SEYEON_G1_RECENT_SOURCE_PIN_V1=Object.freeze({
  sql:'seyeon_private.pin_model_recent_sources_v1',
  productionMounted:false,permitsProvider:false,
  permitsAtomicCommit:false,permitsHttpReveal:false,
} as const);

export interface SeyeonG1RecentPinInputV1 {
  readonly client:PostgresTransactionQueryV1;
  readonly subjectId:string;
  readonly threadId:string;
  readonly turnId:string;
  readonly attemptId:string;
  readonly currentUserMessageId:string;
  readonly selection:SeyeonExactModelPersonalSourceSelectionV1;
  readonly recentMessages:readonly SeyeonRecentMessageV2[];
  readonly maxRecentMessages?:number;
}

export async function pinSeyeonG1RecentSourcesCandidateV1(
  input:Readonly<SeyeonG1RecentPinInputV1>,
):Promise<Readonly<Record<string,unknown>>> {
  if(![input.subjectId,input.threadId,input.turnId,input.attemptId,
    input.currentUserMessageId].every(id=>typeof id==='string'&&UUID.test(id)))hold();
  const s=input.selection;
  if(!s||s.persistedBeforeModel!==false||s.permitsAtomicCommit!==false
    ||s.permitsHttpReveal!==false||!SHA.test(s.selectedModelSourceCensusDigest)
    ||!Array.isArray(s.selectedSources)||!Array.isArray(s.selectedUnpinnedRecentSources)
    ||!Array.isArray(s.selectedUnpinnedDerivedSources)
    ||s.selectedUnpinnedDerivedSources.length!==0)hold();
  const current=s.selectedCurrentUserSource;
  if(!current||current.messageId!==input.currentUserMessageId
    ||current.role!=='user'||current.persistedBeforeModel!==false)hold();
  if(hash({
    originalPersonalSources:s.selectedSources,currentUserSource:current,
    unpinnedRecentSources:s.selectedUnpinnedRecentSources,unpinnedDerivedSources:[],
  })!==s.selectedModelSourceCensusDigest)hold();
  let messages:readonly SeyeonRecentMessageV2[];
  try {
    messages=selectSeyeonRuntimeRecentMessagesV2({
      recentMessages:input.recentMessages,
      ...(input.maxRecentMessages===undefined?{}:{maxRecentMessages:input.maxRecentMessages}),
    });
  }catch{return hold();}
  if(messages.length<1||messages.length>24
    ||messages[messages.length-1]?.messageId!==current.messageId)hold();
  const sources=[...s.selectedUnpinnedRecentSources,current];
  if(sources.length!==messages.length)hold();
  const seen=new Set<string>();
  const manifest=messages.map((m,i)=>{
    const src=sources[i];
    if(!src||!UUID.test(src.messageId)||src.messageId!==m.messageId
      ||src.role!==m.role||src.persistedBeforeModel!==false
      ||src.selectedModelMessageDigest!==hash(m)||seen.has(src.messageId))hold();
    seen.add(src.messageId);
    return {messageId:src.messageId,role:src.role,
      text:m.text,selectedModelMessageDigest:src.selectedModelMessageDigest};
  });
  const rows=await input.client.query<{certificate:unknown}>(`
select seyeon_private.pin_model_recent_sources_v1(
$1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::jsonb,$7::text
) as certificate`.trim(),[
    input.subjectId,input.threadId,input.turnId,input.attemptId,
    input.currentUserMessageId,JSON.stringify(manifest),
    s.selectedModelSourceCensusDigest,
  ]);
  const row=rows.rows[0];
  if(rows.rows.length!==1||!row||!row.certificate
    ||typeof row.certificate!=='object'||Array.isArray(row.certificate))hold();
  const receipt=row.certificate as Record<string,unknown>;
  if(receipt.schemaVersion!=='seyeon-g1-recent-model-source-pin-v1'
    ||receipt.subjectId!==input.subjectId||receipt.threadId!==input.threadId
    ||receipt.turnId!==input.turnId||receipt.attemptId!==input.attemptId
    ||receipt.selectedModelSourceCensusDigest!==s.selectedModelSourceCensusDigest
    ||!Array.isArray(receipt.sources)||receipt.sources.length!==manifest.length)hold();
  for(let i=0;i<manifest.length;i++){
    const model=manifest[i];
    const original=receipt.sources[i];
    if(!model||!original||typeof original!=='object'
      ||(original as Record<string,unknown>).messageId!==model.messageId
      ||(original as Record<string,unknown>).role!==model.role
      ||(original as Record<string,unknown>).selectedModelMessageDigest
        !==model.selectedModelMessageDigest
      ||(original as Record<string,unknown>).dbBodySha256!==
        'sha256:v1:'+createHash('sha256').update(model.text).digest('hex'))hold();
  }
  return Object.freeze(receipt);
}
