// Watchtower-Track: security
// Isolated PostgreSQL G3 source-rights review. NEVER first Reveal authority.
// Keep this unavailable to production HTTP, streaming, replay and Provider.
import type {PostgresTransactionQueryV1} from './postgres-subject-execution.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const RECEIPT_FIELDS=[
  'schemaVersion','historicalSourceCount','originalsCurrentForReview',
  'authorizesFirstReveal','authorizesCommittedReplay',
  'permitsStreaming','permitsHttpReveal',
] as const;

export type SeyeonG3HistoricalReviewPurposeV1=
  'audit_only'|'first'|'committed_replay';

export interface SeyeonG3HistoricalOriginalsReviewRequestV1 {
  readonly subjectId:string;
  readonly threadId:string;
  readonly turnId:string;
  readonly attemptId:string;
  readonly purpose:SeyeonG3HistoricalReviewPurposeV1;
  readonly historicalSourceCount:number;
  readonly expectedUserMessageId?:string;
  readonly expectedAssistantMessageId?:string;
  readonly expectedPostTurnOutboxEventId?:string;
  readonly expectedClientTurnId?:string;
}
export interface SeyeonG3HistoricalOriginalsReviewReceiptV1 {
  readonly schemaVersion:'seyeon-g3-historical-current-originals-review-s0-v1';
  readonly historicalSourceCount:number;
  readonly originalsCurrentForReview:true;
  readonly authorizesFirstReveal:false;
  readonly authorizesCommittedReplay:false;
  readonly permitsStreaming:false;
  readonly permitsHttpReveal:false;
}
export interface SeyeonG3HistoricalOriginalsReviewPortV1 {
  /** Reviews current originals. A positive review does NOT authorize bytes. */
  reviewCurrentOriginals(
    request:SeyeonG3HistoricalOriginalsReviewRequestV1,
  ):Promise<Readonly<SeyeonG3HistoricalOriginalsReviewReceiptV1>>;
}
export class SeyeonG3HistoricalOriginalsReviewHoldV1 extends Error {
  readonly code='SEYEON_G3_HISTORICAL_ORIGINALS_REVIEW_HOLD' as const;
  constructor(){
    super('Historical G3 original rights review unavailable.');
    this.name='SeyeonG3HistoricalOriginalsReviewHoldV1';
  }
}

/**
 * The caller owns an existing restricted, disposable DB transaction.
 * The function cannot grant Model, Commit, HTTP, streaming, or replay rights.
 * It intentionally never returns an assistant body, even in first mode.
 */
export function createSeyeonG3HistoricalOriginalsReviewPortV1(
  client:PostgresTransactionQueryV1,
):Readonly<SeyeonG3HistoricalOriginalsReviewPortV1>{
  return Object.freeze({
    async reviewCurrentOriginals(req:SeyeonG3HistoricalOriginalsReviewRequestV1){
      // Never turn replay into 'first' by passing old Committed receipts.
      if(!req || ![req.subjectId,req.threadId,req.turnId,req.attemptId]
          .every(value=>typeof value==='string'&&UUID.test(value))
        ||!Number.isSafeInteger(req.historicalSourceCount)
        ||req.historicalSourceCount<1||req.historicalSourceCount>23
        ||(req.purpose!=='first'&&req.purpose!=='audit_only')){
        throw new SeyeonG3HistoricalOriginalsReviewHoldV1();
      }
      if(req.purpose==='first' &&
        (![req.expectedUserMessageId,req.expectedAssistantMessageId,
           req.expectedPostTurnOutboxEventId].every(
             value=>typeof value==='string'&&UUID.test(value))
         ||typeof req.expectedClientTurnId!=='string'
         ||req.expectedClientTurnId.trim()!==req.expectedClientTurnId
         ||req.expectedClientTurnId.length<1
         ||req.expectedClientTurnId.length>256)){
        throw new SeyeonG3HistoricalOriginalsReviewHoldV1();
      }
      if(req.purpose==='audit_only' &&
        [req.expectedUserMessageId,req.expectedAssistantMessageId,
         req.expectedPostTurnOutboxEventId,req.expectedClientTurnId]
          .some(value=>value!==undefined)){
        throw new SeyeonG3HistoricalOriginalsReviewHoldV1();
      }
      let result;
      try {
        result=await client.query<{review:unknown}>(`
select seyeon_private.qry_review_historical_first_reveal_originals_s0_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,
  $6::uuid,$7::uuid,$8::uuid,$9::text
) as review`.trim(),[
        req.subjectId,req.threadId,req.turnId,req.attemptId,req.purpose,
        req.purpose==='first'?req.expectedUserMessageId:null,
        req.purpose==='first'?req.expectedAssistantMessageId:null,
        req.purpose==='first'?req.expectedPostTurnOutboxEventId:null,
        req.purpose==='first'?req.expectedClientTurnId:null,
        ]);
      }catch{
        // Postgres details may contain a private Record/Grant locator.
        // The adapter only exposes a stable non-authorizing HOLD.
        throw new SeyeonG3HistoricalOriginalsReviewHoldV1();
      }
      const raw=result.rows.length===1?result.rows[0]?.review:null;
      if(!raw||typeof raw!=='object'||Array.isArray(raw))
        throw new SeyeonG3HistoricalOriginalsReviewHoldV1();
      const proof=raw as Record<string,unknown>;
      if(Object.keys(proof).length!==RECEIPT_FIELDS.length
        ||RECEIPT_FIELDS.some(key=>!Object.hasOwn(proof,key))
        ||proof.schemaVersion!=='seyeon-g3-historical-current-originals-review-s0-v1'
        ||proof.historicalSourceCount!==req.historicalSourceCount
        ||proof.originalsCurrentForReview!==true
        ||proof.authorizesFirstReveal!==false
        ||proof.authorizesCommittedReplay!==false
        ||proof.permitsStreaming!==false
        ||proof.permitsHttpReveal!==false){
        throw new SeyeonG3HistoricalOriginalsReviewHoldV1();
      }
      return Object.freeze(proof as unknown as SeyeonG3HistoricalOriginalsReviewReceiptV1);
    },
  });
}
