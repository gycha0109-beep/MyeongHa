// Watchtower-Track: security
// G1/G2 S0 original-history audit-only: NEVER commit/model/reveal authority.
import type {PostgresTransactionQueryV1} from './postgres-subject-execution.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const keys=['schemaVersion','historicalSourceCount','originalsCurrentForAudit',
  'authorizesModel','permitsAtomicCommit','permitsHttpReveal'];

export interface SeyeonG1HistoricalCurrentOriginalsAuditRequestV1 {
  readonly subjectId:string;
  readonly threadId:string;
  readonly turnId:string;
  readonly attemptId:string;
  readonly expectedHistoricalSourceCount:number;
}

export interface SeyeonG1HistoricalCurrentOriginalsAuditPortV1 {
  recheckCurrentOriginals(
    input:SeyeonG1HistoricalCurrentOriginalsAuditRequestV1,
  ):Promise<Readonly<{
    schemaVersion:'seyeon-historical-current-originals-audit-s0-v1';
    historicalSourceCount:number;
    originalsCurrentForAudit:true;
    authorizesModel:false;
    permitsAtomicCommit:false;
    permitsHttpReveal:false;
  }>>;
}

/** Run only via the isolated DB Owner transaction, not API login.
 * A successful S0 audit is a current snapshot and is NOT a G2 authorization:
 * a later real Commit needs these locks inside the SAME v2 Commit TX.
 */
export function createSeyeonG1HistoricalCurrentOriginalsAuditPortV1(
  client:PostgresTransactionQueryV1,
):SeyeonG1HistoricalCurrentOriginalsAuditPortV1{
  return Object.freeze({
    async recheckCurrentOriginals(input:SeyeonG1HistoricalCurrentOriginalsAuditRequestV1){
      if(![input.subjectId,input.threadId,input.turnId,input.attemptId]
        .every(x=>typeof x==='string'&&UUID.test(x))
        ||!Number.isSafeInteger(input.expectedHistoricalSourceCount)
        ||input.expectedHistoricalSourceCount<1
        ||input.expectedHistoricalSourceCount>23)
        throw Error('Se-yeon historical current-original audit input invalid');

      const result=await client.query<{audit:unknown}>(`
select seyeon_private.qry_recheck_historical_candidate_originals_s0_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid
) as audit`.trim(),[
        input.subjectId,input.threadId,input.turnId,input.attemptId,
      ]);
      const proof=result.rows.length===1?result.rows[0]?.audit:null;
      if(!proof||typeof proof!=='object'||Array.isArray(proof))
        throw Error('Se-yeon historical current-original audit unavailable');
      const audit=proof as Record<string,unknown>;
      if(Object.keys(audit).length!==keys.length
        ||keys.some(key=>!Object.prototype.hasOwnProperty.call(audit,key))
        ||audit.schemaVersion!=='seyeon-historical-current-originals-audit-s0-v1'
        ||audit.historicalSourceCount!==input.expectedHistoricalSourceCount
        ||audit.originalsCurrentForAudit!==true
        ||audit.authorizesModel!==false
        ||audit.permitsAtomicCommit!==false
        ||audit.permitsHttpReveal!==false)
        throw Error('Se-yeon historical current-original audit receipt mismatch');
      return Object.freeze(audit as unknown as {
        schemaVersion:'seyeon-historical-current-originals-audit-s0-v1';
        historicalSourceCount:number;
        originalsCurrentForAudit:true;
        authorizesModel:false;
        permitsAtomicCommit:false;
        permitsHttpReveal:false;
      });
    },
  });
}
