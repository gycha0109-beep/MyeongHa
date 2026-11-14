import { randomUUID } from 'node:crypto';
import { OFFICIAL_READER_RUNTIME_IDS_V1,
  type OfficialReaderRuntimeIdV1 } from './reader-production-rollout-policy-v1.js';
import { executePostgresApprovedSajuIssuerJobTransactionV1,
  executePostgresApprovedSajuIssuerTransactionV1,
  type PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { readApprovedSajuPairIssueScopeV1 } from './postgres-approved-saju-issue-scope-v1.js';
import { verifyApprovedSajuPreparedPairIssueV1 } from './postgres-approved-saju-issuance-v1.js';
import { commitApprovedSajuT10OfficialPairReadingV1 } from './postgres-approved-saju-pair-official-commit-v1.js';
import { createSajuT10ProductionPairIssueSourceV1,
  type SajuT10ProductionPairTrustV1 } from './saju-t10-production-pair-issue-source-v1.js';
import { SAJU_PRODUCTION_ISSUE_RELEASE_REF_V1 } from './saju-production-reading-http-adapter.js';

const UUID = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const TOKEN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u;
const allowedReaders = new Set<string>(OFFICIAL_READER_RUNTIME_IDS_V1);
interface Job {
  readonly job_id:string;readonly subject_id:string;readonly auth_user_id:string;
  readonly purchase_intent_id:string;readonly component:string;
  readonly release_ref:string;readonly already_issued:boolean;
}
type Result = Readonly<{state:'idle'|'issued'|'lease_expired'}> |
  Readonly<{state:'held';reason:'invalid_scope'|'existing_attempt_reconciliation'|
    'source_unverified'|'commit_unavailable'|'missing_signed_receipt';
    jobId:string}>;

/**
 * Separate T10 worker; never invokes or broadens the single-Birth issuer.
 * Config is offline-only until product/DB/Reader activation is approved.
 */
export function createApprovedSajuT10PairIssuanceWorkerV1(input: Readonly<{
  pool:PostgresSubjectPoolV1;
  sourceOrigin:string;
  sourceBearerToken:string;
  trust:SajuT10ProductionPairTrustV1;
  releaseRef:string;
  readerCharacterId:OfficialReaderRuntimeIdV1;
  engineKey:string;
  engineVersion:string;
  fetchImpl?:typeof fetch;
}>) {
  if (!allowedReaders.has(input.readerCharacterId) ||
      !SAJU_PRODUCTION_ISSUE_RELEASE_REF_V1.test(input.releaseRef) ||
      !TOKEN.test(input.engineKey) || !TOKEN.test(input.engineVersion) ||
      input.engineVersion !== input.trust.engineVersion) {
    throw new TypeError('Pair issuer requires pinned Reader, Release and engine.');
  }
  const source=createSajuT10ProductionPairIssueSourceV1({
    origin:input.sourceOrigin,bearerToken:input.sourceBearerToken,
    trust:input.trust,...(input.fetchImpl === undefined ? {} : {fetchImpl:input.fetchImpl}),
  });
  const releaseJson=JSON.stringify({compatibility:input.releaseRef});
  const pool=input.pool;
  return Object.freeze({
    async runNext():Promise<Result> {
      const lease=randomUUID();
      const job=await executePostgresApprovedSajuIssuerJobTransactionV1({
        pool,execute:async(client)=>{
          const r=await client.query<Job>(
            'select * from public.cmd_claim_approved_saju_issue_job_v1($1::uuid,$2::jsonb)',
            [lease,releaseJson]);
          if(r.rows.length>1)throw new Error('Multiple pair jobs claimed.');
          return r.rows[0];
        },
      });
      if(job === undefined) return {state:'idle'};
      if(job.component!=='compatibility' || job.release_ref!==input.releaseRef ||
          typeof job.already_issued!=='boolean' ||
          ![job.job_id,job.subject_id,job.auth_user_id,job.purchase_intent_id]
            .every(id=>typeof id==='string'&&UUID.test(id))) {
        throw new Error('Invalid dedicated T10 job authority.');
      }
      const verifiedEvidence={kind:'member' as const,verifiedAuthUserId:job.auth_user_id};
      const status=()=>executePostgresApprovedSajuIssuerTransactionV1({
        pool,verifiedEvidence,execute:async({client,resolvedSubject})=>{
          if(resolvedSubject.subjectId!==job.subject_id)return null;
          const r=await client.query<{attempt_no:number|null;signed_commit:boolean}>(`
            select attempt_no,signed_commit
            from public.qry_approved_saju_issue_job_status_v1($1::uuid,$2::uuid,'compatibility')
          `,[job.subject_id,job.purchase_intent_id]);
          return r.rows.length===1?r.rows[0]:null;
        },
      });
      if(job.already_issued) {
        const receipt=await status();
        if(receipt?.signed_commit!==true)return {
          state:'held',reason:'missing_signed_receipt',jobId:job.job_id,
        };
      } else {
        const readingId=randomUUID(),sessionId=randomUUID(),attemptId=randomUUID();
        const prepared=await executePostgresApprovedSajuIssuerTransactionV1({
          pool,verifiedEvidence,execute:async({client,resolvedSubject})=>{
            if(resolvedSubject.subjectId!==job.subject_id)return null;
            const scope=await readApprovedSajuPairIssueScopeV1(client,{
              subjectId:job.subject_id,purchaseIntentId:job.purchase_intent_id,
            });
            if(scope===null||scope.releaseRef!==input.releaseRef)return null;
            const existing=await client.query<{attempt_no:number|null;signed_commit:boolean}>(`
              select attempt_no,signed_commit
              from public.qry_approved_saju_issue_job_status_v1($1::uuid,$2::uuid,'compatibility')
            `,[job.subject_id,job.purchase_intent_id]);
            if(existing.rows.length>1)throw new Error('Pair attempt status is ambiguous.');
            if(existing.rows[0]?.signed_commit===true ||
                existing.rows[0]?.attempt_no!==null && existing.rows[0]?.attempt_no!==undefined)
              return {state:'existing_attempt' as const};
            const r=await client.query<{readingId:string;sessionId:string}>(`
              select reading_id::text as "readingId",session_id::text as "sessionId"
              from public.prepare_approved_component_reading_v1(
                $1::uuid,$2::uuid,'compatibility',$3::uuid,$4::uuid,$5::text,$6::text,$7::uuid)
            `,[job.subject_id,job.purchase_intent_id,readingId,sessionId,
              input.readerCharacterId,scope.sourceRequestHash,scope.targetBirthRevisionId]);
            const logical=r.rows[0];
            if(r.rows.length!==1||!logical||
                !UUID.test(logical.readingId)||!UUID.test(logical.sessionId))return null;
            const attempt=await client.query<{
              executionAttemptId:string;attemptState:string;replayed:boolean;
            }>(`
              select execution_attempt_id::text as "executionAttemptId",
                attempt_state as "attemptState",replayed
              from public.cmd_prepare_approved_saju_attempt_v1(
                $1::uuid,$2::uuid,'compatibility',$3::uuid,$4::uuid,
                $5::uuid,$6::uuid,$7::text,$8::text,$9::text,$10::text,$11::uuid)
            `,[job.subject_id,job.purchase_intent_id,logical.readingId,logical.sessionId,
              attemptId,scope.birthRevisionId,scope.sourceRequestHash,
              'saju-t10-production-pair-v1',input.engineKey,input.engineVersion,
              scope.targetBirthRevisionId]);
            const issuedAttempt=attempt.rows[0];
            if(attempt.rows.length!==1||!issuedAttempt||
                !UUID.test(issuedAttempt.executionAttemptId)||
                issuedAttempt.attemptState!=='running')return null;
            return {
              readingId:logical.readingId,sessionId:logical.sessionId,
              attemptId:issuedAttempt.executionAttemptId,
              // Do not repeat a possibly completed Source request on replay.
              sourceCallAllowed:!issuedAttempt.replayed,
            };
          },
        });
        if(prepared===null)return {state:'held',reason:'invalid_scope',jobId:job.job_id};
        if('state' in prepared)return {
          state:'held',reason:'existing_attempt_reconciliation',jobId:job.job_id,
        };
        if(!prepared.sourceCallAllowed)return {
          state:'held',reason:'existing_attempt_reconciliation',jobId:job.job_id,
        };
        const signed=await verifyApprovedSajuPreparedPairIssueV1({
          pool,verifiedEvidence,subjectId:job.subject_id,
          purchaseIntentId:job.purchase_intent_id,
          readingId:prepared.readingId,readingSessionId:prepared.sessionId,
          executionAttemptId:prepared.attemptId,
          expectedReleaseRef:input.releaseRef,source,
        });
        if(signed===null)return {state:'held',reason:'source_unverified',jobId:job.job_id};
        const committed=await commitApprovedSajuT10OfficialPairReadingV1({
          pool,verifiedEvidence,subjectId:job.subject_id,
          purchaseIntentId:job.purchase_intent_id,
          readingId:prepared.readingId,executionAttemptId:prepared.attemptId,
          outboxEventId:randomUUID(),expectedReleaseRef:input.releaseRef,
          source:{body:signed.source.body,proof:signed.source.proof,trust:input.trust},
        });
        if(committed?.state!=='committed')return {
          state:'held',reason:'commit_unavailable',jobId:job.job_id,
        };
      }
      const complete=await executePostgresApprovedSajuIssuerJobTransactionV1({
        pool,execute:async(client)=>{
          const r=await client.query<{completed:boolean}>(
            'select public.cmd_complete_approved_saju_issue_job_v1($1::uuid,$2::uuid) as completed',
            [job.job_id,lease]);
          if(r.rows.length!==1||typeof r.rows[0]?.completed!=='boolean')
            throw new Error('Pair job completion returned invalid authority.');
          return r.rows[0].completed;
        },
      });
      return {state:complete?'issued':'lease_expired'};
    },
  });
}
