// Watchtower-Track: security
// Isolated G1 historical complete-context verification receipt, never Provider admission.
import type {PostgresTransactionQueryV1} from './postgres-subject-execution.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA=/^sha256:v1:[a-f0-9]{64}$/u;
const PG_SHA=/^sha256:pg-jsonb:v1:[a-f0-9]{64}$/u;
const keys=[
  'schemaVersion','subjectId','threadId','turnId','attemptId',
  'candidatePgJsonbDigest','finalModelContextDigest','preModelContextDigest',
  'historicalSourceCount','originalsCurrentAtSeal','authorizesModel',
  'permitsAtomicCommit','permitsHttpReveal',
] as const;

export interface SeyeonG1HistoricalFinalContextSealRequestV1 {
  readonly subjectId:string;
  readonly threadId:string;
  readonly turnId:string;
  readonly attemptId:string;
  readonly actualFinalModelContextDigest:string;
  readonly preModelContextDigest:string;
  readonly historicalSourceCount:number;
}
export interface SeyeonG1HistoricalFinalContextSealReceiptV1 {
  readonly schemaVersion:'seyeon-g1-historical-final-context-seal-s0-v1';
  readonly subjectId:string;
  readonly threadId:string;
  readonly turnId:string;
  readonly attemptId:string;
  readonly candidatePgJsonbDigest:string;
  readonly finalModelContextDigest:string;
  readonly preModelContextDigest:string;
  readonly historicalSourceCount:number;
  readonly originalsCurrentAtSeal:true;
  readonly authorizesModel:false;
  readonly permitsAtomicCommit:false;
  readonly permitsHttpReveal:false;
}
export interface SeyeonG1HistoricalFinalContextSealPortV1 {
  sealAfterContextVerification(
    request:SeyeonG1HistoricalFinalContextSealRequestV1,
  ):Promise<Readonly<SeyeonG1HistoricalFinalContextSealReceiptV1>>;
}

/**
 * The caller must first compare the ACTUAL assembled post-Preflight context
 * to the DB Candidate through the G1 closure. This owner transaction verifies
 * the v4 candidate and every original under current locks; the saved receipt
 * is immutable but DOES NOT authorize Interpreter/Commit/Reveal.
 */
export function createSeyeonG1HistoricalFinalContextSealPortV1(
  client:PostgresTransactionQueryV1,
):SeyeonG1HistoricalFinalContextSealPortV1 {
  return Object.freeze({
    async sealAfterContextVerification(req:SeyeonG1HistoricalFinalContextSealRequestV1){
      if(![req.subjectId,req.threadId,req.turnId,req.attemptId]
        .every(value=>typeof value==='string'&&UUID.test(value))
        ||!SHA.test(req.actualFinalModelContextDigest)
        ||!SHA.test(req.preModelContextDigest)
        ||!Number.isSafeInteger(req.historicalSourceCount)
        ||req.historicalSourceCount<1||req.historicalSourceCount>23)
        throw Error('Historical G1 immutable final Context seal input invalid');
      const query=await client.query<{seal:unknown}>(`
select seyeon_private.cmd_seal_historical_final_context_s0_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text
) as seal`.trim(),[
        req.subjectId,req.threadId,req.turnId,req.attemptId,
        req.actualFinalModelContextDigest,req.preModelContextDigest,
      ]);
      const raw=query.rows.length===1?query.rows[0]?.seal:null;
      if(!raw||typeof raw!=='object'||Array.isArray(raw))
        throw Error('Historical G1 immutable final Context seal unavailable');
      const seal=raw as Record<string,unknown>;
      if(Object.keys(seal).length!==keys.length
        ||keys.some(key=>!Object.hasOwn(seal,key))
        ||seal.schemaVersion!=='seyeon-g1-historical-final-context-seal-s0-v1'
        ||seal.subjectId!==req.subjectId||seal.threadId!==req.threadId
        ||seal.turnId!==req.turnId||seal.attemptId!==req.attemptId
        ||typeof seal.candidatePgJsonbDigest!=='string'
        ||!PG_SHA.test(seal.candidatePgJsonbDigest)
        ||seal.finalModelContextDigest!==req.actualFinalModelContextDigest
        ||seal.preModelContextDigest!==req.preModelContextDigest
        ||seal.historicalSourceCount!==req.historicalSourceCount
        ||seal.originalsCurrentAtSeal!==true
        ||seal.authorizesModel!==false||seal.permitsAtomicCommit!==false
        ||seal.permitsHttpReveal!==false)
        throw Error('Historical G1 immutable final Context seal receipt mismatch');
      return Object.freeze(seal as unknown as SeyeonG1HistoricalFinalContextSealReceiptV1);
    },
  });
}
