// Watchtower-Track: security
// W48 S0 Owner-only historical DB candidate. No model/Commit/Reveal permission.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import type {PostgresTransactionQueryV1} from './postgres-subject-execution.js';
import type {SeyeonExactSelectedPersonalSourceV1} from './seyeon-exact-model-personal-source-selection-v1.js';

export interface SeyeonG1HistoricalCandidatePinInputV1 {
  readonly subjectId:string;
  readonly threadId:string;
  readonly turnId:string;
  readonly attemptId:string;
  readonly currentUserMessageId:string;
  readonly currentUserTextDigest:string;
  readonly selectedOriginalMemory:SeyeonExactSelectedPersonalSourceV1;
  readonly selectedSourcesDigest:string;
  readonly preModelContextDigest:string;
  readonly historicalSources:readonly Readonly<{
    messageId:string;
    role:'user'|'assistant';
    textDigest:string;
  }>[];
}

export interface SeyeonG1HistoricalCandidateDbPortV1 {
  pinBeforeModel(input:SeyeonG1HistoricalCandidatePinInputV1):
    Promise<Readonly<Record<string,unknown>>>;
}

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const HASH=/^sha256:v1:[a-f0-9]{64}$/u;
const WIRE=/^sha256:wire-utf8:v1:[a-f0-9]{64}$/u;
const PG=/^sha256:pg-jsonb:v1:[a-f0-9]{64}$/u;
const TEXT=(s:unknown)=>typeof s==='string'&&s.length>0&&s.length<=100&&s===s.trim();
const keys=['schemaVersion','subjectId','threadId','turnId','attemptId',
  'characterId','currentUserMessageId','currentUserTextDigest',
  'recordKind','recordId','originalGrantId','originalGrantedAt',
  'recordType','recordSchemaVersion','projectorVersion',
  'originalPgJsonbDigest','selectedSourcesDigest','projectedMemoryDigest',
  'preModelContextDigest','historicalSourceCount','historicalSources',
  'historicalSourceCensusDigest','historicalAssistantOriginalSources',
  'historicalAssistantOriginalSourcesDigest',
  'authorizesModel','permitsAtomicCommit','permitsHttpReveal'];
const assistantOriginalKeys=['messageId','turnId','attemptId',
  'originalUserMessageId','originalUserTextDigest','recordId',
  'originalGrantId','originalPgJsonbDigest','recordType',
  'recordSchemaVersion','projectorVersion'].sort().join(',');

export function createSeyeonG1HistoricalCandidateOwnerPortV1(
  client:PostgresTransactionQueryV1,
):SeyeonG1HistoricalCandidateDbPortV1 {
  return Object.freeze({
    async pinBeforeModel(input:SeyeonG1HistoricalCandidatePinInputV1){
      const s=input.selectedOriginalMemory;
      const history=input.historicalSources;
      if(![input.subjectId,input.threadId,input.turnId,input.attemptId,
        input.currentUserMessageId,s?.recordId,s?.grantId].every(x=>
          typeof x==='string'&&UUID.test(x))
        ||!s||s.recordKind!=='memory'
        ||![s.recordType,s.schemaVersion,s.projectorVersion].every(TEXT)
        ||!PG.test(s.rawRecordPgDigest??'')
        ||!HASH.test(s.rawRecordDigest)
        ||!HASH.test(s.projectedMemoryDigest)
        ||!HASH.test(input.selectedSourcesDigest)
        ||!HASH.test(input.preModelContextDigest)
        ||!WIRE.test(input.currentUserTextDigest)
        ||!Array.isArray(history)||history.length<1||history.length>23
        ||new Set(history.map(h=>h.messageId)).size!==history.length
        ||history.some(h=>!h||typeof h!=='object'
          ||Object.keys(h).sort().join(',')!=='messageId,role,textDigest'
          ||typeof h.messageId!=='string'||!UUID.test(h.messageId)
          ||h.messageId===input.currentUserMessageId
          ||(h.role!=='user'&&h.role!=='assistant')
          ||typeof h.textDigest!=='string'||!WIRE.test(h.textDigest))
        ||'sha256:v1:'+createHash('sha256')
          .update(canonicalJson([s])).digest('hex')!==input.selectedSourcesDigest
      ) throw Error('Se-yeon historical G1 candidate original source unverifiable');

      const result=await client.query<{receipt:unknown;expected_history_digest:string}>(`
select seyeon_private.cmd_pin_seyeon_historical_source_candidate_s0_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,
  $8::text,$9::text,$10::text,$11::text,$12::text,$13::text,
  $14::text,$15::text,$16::jsonb
) as receipt,
  'sha256:pg-jsonb:v1:'||encode(
    sha256(convert_to($16::jsonb::text,'UTF8')),'hex'
  ) as expected_history_digest`.trim(),[
        input.subjectId,input.threadId,input.turnId,input.attemptId,
        input.currentUserMessageId,s.recordId,s.grantId,
        s.recordType,s.schemaVersion,s.projectorVersion,
        input.currentUserTextDigest,s.rawRecordPgDigest,
        input.selectedSourcesDigest,s.projectedMemoryDigest,
        input.preModelContextDigest,JSON.stringify(history),
      ]);
      if(result.rows.length!==1||!result.rows[0] ||
        !result.rows[0].receipt||typeof result.rows[0].receipt!=='object'
        ||Array.isArray(result.rows[0].receipt))
        throw Error('Se-yeon historical G1 owner receipt missing');
      const p=result.rows[0].receipt as Record<string,unknown>;
      const originalSources=p.historicalAssistantOriginalSources;
      const assistantIds=history.filter(h=>h.role==='assistant').map(h=>h.messageId);
      if(Object.keys(p).length!==keys.length
        ||keys.some(key=>!Object.prototype.hasOwnProperty.call(p,key))
        ||p.schemaVersion!=='seyeon-g1-historical-source-candidate-v2'
        ||p.subjectId!==input.subjectId||p.threadId!==input.threadId
        ||p.turnId!==input.turnId||p.attemptId!==input.attemptId
        ||p.characterId!=='seyeon'
        ||p.currentUserMessageId!==input.currentUserMessageId
        ||p.currentUserTextDigest!==input.currentUserTextDigest
        ||p.recordKind!=='memory'||p.recordId!==s.recordId
        ||p.originalGrantId!==s.grantId
        ||typeof p.originalGrantedAt!=='string'
        ||!Number.isFinite(Date.parse(p.originalGrantedAt))
        ||p.recordType!==s.recordType||p.recordSchemaVersion!==s.schemaVersion
        ||p.projectorVersion!==s.projectorVersion
        ||p.originalPgJsonbDigest!==s.rawRecordPgDigest
        ||p.selectedSourcesDigest!==input.selectedSourcesDigest
        ||p.projectedMemoryDigest!==s.projectedMemoryDigest
        ||p.preModelContextDigest!==input.preModelContextDigest
        ||p.historicalSourceCount!==history.length
        ||canonicalJson(p.historicalSources)!==canonicalJson(history)
        ||typeof p.historicalSourceCensusDigest!=='string'
        ||!PG.test(p.historicalSourceCensusDigest)
        ||typeof p.historicalAssistantOriginalSourcesDigest!=='string'
        ||!PG.test(p.historicalAssistantOriginalSourcesDigest)
        ||!Array.isArray(originalSources)
        ||originalSources.length!==assistantIds.length
        ||originalSources.some((original,index)=>{
          if(!original||typeof original!=='object'||Array.isArray(original))return true;
          const entry=original as Record<string,unknown>;
          return Object.keys(entry).sort().join(',')!==assistantOriginalKeys
            ||entry.messageId!==assistantIds[index]
            ||![entry.turnId,entry.attemptId,entry.originalUserMessageId,
              entry.recordId,entry.originalGrantId].every(x=>
                typeof x==='string'&&UUID.test(x))
            ||entry.originalUserMessageId===input.currentUserMessageId
            ||typeof entry.originalUserTextDigest!=='string'
            ||!WIRE.test(entry.originalUserTextDigest)
            ||typeof entry.originalPgJsonbDigest!=='string'
            ||!PG.test(entry.originalPgJsonbDigest)
            ||![entry.recordType,entry.recordSchemaVersion,
              entry.projectorVersion].every(TEXT);
        })
        // Same transactional query derives the PostgreSQL JSONB digest
        // from the exact manifest sent to the Owner. A syntactically valid
        // but mismatched DB receipt must never become a source certificate.
        ||p.historicalSourceCensusDigest!==result.rows[0].expected_history_digest
        ||p.authorizesModel!==false||p.permitsAtomicCommit!==false
        ||p.permitsHttpReveal!==false)
        throw Error('Se-yeon historical G1 original owner receipt mismatch');
      return Object.freeze(p);
    },
  });
}
