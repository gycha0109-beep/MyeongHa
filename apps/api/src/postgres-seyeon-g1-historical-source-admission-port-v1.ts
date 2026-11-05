// Watchtower-Track: security
// Isolated G1 exact historical source-selection approval; NEVER Provider admission.
import type {PostgresTransactionQueryV1} from './postgres-subject-execution.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA=/^sha256:v1:[a-f0-9]{64}$/u;
const PG_SHA=/^sha256:pg-jsonb:v1:[a-f0-9]{64}$/u;
const fields=[
  'schemaVersion','subjectId','threadId','turnId','attemptId',
  'characterId','recordKind','recordId','originalGrantId','recordType',
  'recordSchemaVersion','projectorVersion','originalPgJsonbDigest',
  'selectedSourcesDigest','projectedMemoryDigest',
  'historicalSourceCensusDigest','historicalAssistantOriginalSourcesDigest',
  'historicalSourceCount','candidatePgJsonbDigest','finalModelContextDigest',
  'originalsCurrentAtAdmission','authorizesSourceSelection',
  'permitsModelDispatch','permitsAtomicCommit','permitsHttpReveal',
] as const;

export interface SeyeonG1HistoricalSourceAdmissionRequestV1 {
  readonly subjectId:string;
  readonly threadId:string;
  readonly turnId:string;
  readonly attemptId:string;
  readonly finalModelContextDigest:string;
  readonly candidatePgJsonbDigest:string;
  readonly originalRecordId:string;
  readonly originalGrantId:string;
  readonly historicalSourceCount:number;
  readonly historicalSourceCensusDigest:string;
}
export interface SeyeonG1HistoricalSourceAdmissionReceiptV1 {
  readonly schemaVersion:'seyeon-g1-historical-source-admission-s0-v1';
  readonly subjectId:string;
  readonly threadId:string;
  readonly turnId:string;
  readonly attemptId:string;
  readonly characterId:'seyeon';
  readonly recordKind:'memory';
  readonly recordId:string;
  readonly originalGrantId:string;
  readonly recordType:string;
  readonly recordSchemaVersion:string;
  readonly projectorVersion:string;
  readonly originalPgJsonbDigest:string;
  readonly selectedSourcesDigest:string;
  readonly projectedMemoryDigest:string;
  readonly historicalSourceCensusDigest:string;
  readonly historicalAssistantOriginalSourcesDigest:string;
  readonly historicalSourceCount:number;
  readonly candidatePgJsonbDigest:string;
  readonly finalModelContextDigest:string;
  readonly originalsCurrentAtAdmission:true;
  readonly authorizesSourceSelection:true;
  readonly permitsModelDispatch:false;
  readonly permitsAtomicCommit:false;
  readonly permitsHttpReveal:false;
}
export interface SeyeonG1HistoricalSourceAdmissionPortV1 {
  admitExactSources(
    request:SeyeonG1HistoricalSourceAdmissionRequestV1,
  ):Promise<Readonly<SeyeonG1HistoricalSourceAdmissionReceiptV1>>;
}

/** Called only after real governed Preflight has matched the DB original.
 * This isolated Owner-DB issuance verifies the model-source registry and
 * the current original User/Assistant/Memory Grant. It CANNOT dispatch AI.
 */
export function createSeyeonG1HistoricalSourceAdmissionPortV1(
  client:PostgresTransactionQueryV1,
):SeyeonG1HistoricalSourceAdmissionPortV1{
  return Object.freeze({
    async admitExactSources(req:SeyeonG1HistoricalSourceAdmissionRequestV1){
      if(![req.subjectId,req.threadId,req.turnId,req.attemptId,
           req.originalRecordId,req.originalGrantId]
        .every(value=>typeof value==='string'&&UUID.test(value))
        ||!SHA.test(req.finalModelContextDigest)
        ||!PG_SHA.test(req.candidatePgJsonbDigest)
        ||!PG_SHA.test(req.historicalSourceCensusDigest)
        ||!Number.isSafeInteger(req.historicalSourceCount)
        ||req.historicalSourceCount<1||req.historicalSourceCount>23)
        throw Error('Historical G1 source admission request invalid');
      const result=await client.query<{admission:unknown}>(`
select seyeon_private.cmd_admit_historical_g1_model_sources_s0_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text
) as admission`.trim(),[
        req.subjectId,req.threadId,req.turnId,req.attemptId,
        req.finalModelContextDigest,
      ]);
      const raw=result.rows.length===1?result.rows[0]?.admission:null;
      if(!raw||typeof raw!=='object'||Array.isArray(raw))
        throw Error('Historical G1 source admission unavailable');
      const proof=raw as Record<string,unknown>;
      if(Object.keys(proof).length!==fields.length
        ||fields.some(key=>!Object.hasOwn(proof,key))
        ||proof.schemaVersion!=='seyeon-g1-historical-source-admission-s0-v1'
        ||proof.subjectId!==req.subjectId||proof.threadId!==req.threadId
        ||proof.turnId!==req.turnId||proof.attemptId!==req.attemptId
        ||proof.characterId!=='seyeon'||proof.recordKind!=='memory'
        ||proof.recordId!==req.originalRecordId
        ||proof.originalGrantId!==req.originalGrantId
        ||proof.historicalSourceCount!==req.historicalSourceCount
        ||proof.candidatePgJsonbDigest!==req.candidatePgJsonbDigest
        ||proof.finalModelContextDigest!==req.finalModelContextDigest
        ||proof.historicalSourceCensusDigest!==req.historicalSourceCensusDigest
        ||!['recordType','recordSchemaVersion','projectorVersion']
          .every(key=>typeof proof[key]==='string'
            &&(proof[key] as string).length>0)
        ||!['selectedSourcesDigest','projectedMemoryDigest']
          .every(key=>typeof proof[key]==='string'
            &&SHA.test(proof[key] as string))
        ||!['originalPgJsonbDigest','historicalAssistantOriginalSourcesDigest']
          .every(key=>typeof proof[key]==='string'
            &&PG_SHA.test(proof[key] as string))
        ||proof.originalsCurrentAtAdmission!==true
        ||proof.authorizesSourceSelection!==true
        ||proof.permitsModelDispatch!==false
        ||proof.permitsAtomicCommit!==false
        ||proof.permitsHttpReveal!==false)
        throw Error('Historical G1 source admission receipt mismatch');
      return Object.freeze(proof as unknown as SeyeonG1HistoricalSourceAdmissionReceiptV1);
    },
  });
}
