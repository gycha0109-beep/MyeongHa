// Watchtower-Track: commerce-payment
// Called ONLY after the canonical Owner sandbox handoff projection succeeds.
// DB owner-scoped Payment Attempt state must be committed before browser SDK
// material is returned; otherwise verification would reject status='created'.
import {executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import type {VerifiedSubjectIdentityEvidenceV1} from './subject-identity-resolver.js';

export const CLOUDFLARE_OWNER_PORTONE_HANDOFF_COMMIT_V1=Object.freeze({
  databaseFunction:'public.cmd_transition_payment_attempt_v1',
  targetStatus:'handed_off',
  environment:'sandbox',
  publicRouteMounted:false,
  enablesPaymentSettlement:false,
  enablesCreditMint:false,
} as const);

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const SQL=`
select payment_attempt_id::text as "paymentAttemptId",
       provider,
       environment,
       provider_request_id as "providerRequestId",
       status
from public.cmd_transition_payment_attempt_v1(
  $1::uuid,$2::uuid,'handed_off'::text,null::text,null::text
)`.trim();

type HandoffCommittedRowV1=Readonly<{
  paymentAttemptId?:unknown;
  provider?:unknown;
  environment?:unknown;
  providerRequestId?:unknown;
  status?:unknown;
}>;

function deny():never{
  throw new Error('Owner sandbox payment handoff state unavailable.');
}

export async function commitCloudflareOwnerPortOneSandboxHandoffV1(input:Readonly<{
  pool:PostgresSubjectPoolV1;
  verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
  paymentAttemptId:string;
  providerRequestId:string;
}>):Promise<void>{
  if(input.verifiedEvidence?.kind!=='member'||
    typeof input.paymentAttemptId!=='string'||!UUID.test(input.paymentAttemptId)||
    typeof input.providerRequestId!=='string'||
    !/^[A-Za-z0-9_-]{6,40}$/.test(input.providerRequestId))return deny();

  await executePostgresSubjectTransactionV1({
    pool:input.pool,verifiedEvidence:input.verifiedEvidence,
    execute:async({client,resolvedSubject})=>{
      const result=await client.query<HandoffCommittedRowV1>(SQL,[
        resolvedSubject.subjectId,input.paymentAttemptId.toLowerCase(),
      ]);
      const row=result.rows[0];
      if(result.rows.length!==1||!row||
         row.paymentAttemptId!==input.paymentAttemptId.toLowerCase()||
         row.provider!=='portone_v2'||
         row.environment!=='sandbox'||
         row.status!=='handed_off'||
         row.providerRequestId!==input.providerRequestId)return deny();
    },
  });
}
