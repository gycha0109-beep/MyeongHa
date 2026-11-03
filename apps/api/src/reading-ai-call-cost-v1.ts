import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  estimateSeyeonAiCallCostV1,
  type SeyeonAiCallOutcomeV1,
  type SeyeonAiPriceV1,
  type SeyeonAiTokenUsageV1,
} from './seyeon-ai-usage-cost-v1.js';

/**
 * Server-only, per-provider-call Reading-generation usage. This is NOT a
 * Reading result, a browser event, a Saju transport request, or an invoice.
 * The caller must have actually observed the provider response/attempt.
 *
 * The current Saju ProductReadingResponse HTTP transport does not supply
 * provider token usage, so no default runtime hook manufactures these events.
 */
export const READING_AI_CALL_COST_VERSION_V1 = 'reading-ai-call-cost-v1' as const;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const KEY=/^[A-Za-z0-9_.:/-]{1,128}$/u;

export interface ReadingAiProviderCallObservationV1 {
  readonly source:'provider_response_usage'|'provider_attempt_without_usage';
  readonly subjectId:string;
  readonly readingId:string;
  readonly executionAttemptId:string;
  readonly callId:string;
  readonly observedAt:string;
  readonly providerKey:string;
  readonly modelKey:string;
  readonly outcome:SeyeonAiCallOutcomeV1;
  readonly usage:SeyeonAiTokenUsageV1;
  /** Exact server-owned rate card pinned to this provider call, if available. */
  readonly price?:SeyeonAiPriceV1;
}

function uuid(value:string,name:string):string{
  if(typeof value!=='string'||!UUID.test(value))throw Error('Invalid Reading AI '+name);
  return value.toLowerCase();
}
function timestamp(value:string):string{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)||
    !Number.isFinite(Date.parse(value)))throw Error('Invalid Reading AI observation time');
  const date=new Date(value).toISOString();
  if(date!== (value.includes('.')?value:value.replace('Z','.000Z')))throw Error('Invalid Reading AI observation time');
  return date;
}
const outcomes:readonly SeyeonAiCallOutcomeV1[]=[
  'response_received','http_failure','network_failure','timeout','invalid_content_type','invalid_response',
];

export function buildReadingAiCallCostV1(input:ReadingAiProviderCallObservationV1){
  if(!KEY.test(input.providerKey)||!KEY.test(input.modelKey)||!outcomes.includes(input.outcome)||
    (input.source!=='provider_response_usage'&&input.source!=='provider_attempt_without_usage'))
    throw Error('Invalid Reading AI provider call evidence');
  // A provider usage receipt cannot be conjured from an error without an
  // authenticated provider response. Missing counters remain NULL, not zero.
  if(input.source==='provider_response_usage' &&
    (input.outcome!=='response_received'||input.usage.inputTokens===null||input.usage.outputTokens===null))
    throw Error('Unbound Reading AI provider usage receipt');
  if(input.source==='provider_attempt_without_usage'&&
    Object.values(input.usage).some(value=>value!==null))
    throw Error('Unbound Reading AI missing usage');
  const estimate=estimateSeyeonAiCallCostV1({
    providerKey:input.providerKey,modelKey:input.modelKey,usage:input.usage,
    ...(input.price===undefined?{}:{price:input.price}),
  });
  return Object.freeze({
    schemaVersion:READING_AI_CALL_COST_VERSION_V1,
    source:input.source,
    workload:'reading' as const,
    purpose:'reading_generation' as const,
    subjectId:uuid(input.subjectId,'subjectId'),
    readingId:uuid(input.readingId,'readingId'),
    executionAttemptId:uuid(input.executionAttemptId,'executionAttemptId'),
    callId:uuid(input.callId,'callId'),
    observedAt:timestamp(input.observedAt),
    providerKey:input.providerKey,
    modelKey:input.modelKey,
    outcome:input.outcome,
    ...input.usage,
    ...estimate,
    // Persist the exact rated quote alongside its version. The usage estimate
    // must be independently reproducible by the private DB write boundary.
    appliedInputRateMicroUsdPerMillion:input.price?.inputMicroUsdPerMillion??null,
    appliedCachedInputRateMicroUsdPerMillion:input.price?.cachedInputMicroUsdPerMillion??null,
    appliedOutputRateMicroUsdPerMillion:input.price?.outputMicroUsdPerMillion??null,
    invoiceReconciled:false as const,
  });
}

const RECORD_SQL=`SELECT call_id::text AS "callId", replayed
  FROM myeongha_admin_ops.cmd_record_reading_ai_call_v1(
    $1::uuid,$2::uuid,$3::uuid,$4::jsonb
  )`;

/** Invoke only with a dedicated server-held Reading cost writer principal.
 * The offline DB candidate binds the event to an existing owned execution
 * attempt, rejects conflicting replays, and never accepts prompt/response data.
 * The caller must record even failed provider attempts; no success-only bias.
 */
export async function recordReadingAiCallCostV1(
  client:Pick<PostgresTransactionQueryV1,'query'>,
  input:ReadingAiProviderCallObservationV1,
):Promise<Readonly<{callId:string;replayed:boolean}>>{
  const event=buildReadingAiCallCostV1(input);
  const result=await client.query<{callId:string;replayed:boolean}>(RECORD_SQL,[
    event.subjectId,event.readingId,event.executionAttemptId,JSON.stringify(event),
  ]);
  if(result.rows.length!==1||result.rows[0]?.callId?.toLowerCase()!==event.callId||
    typeof result.rows[0].replayed!=='boolean')throw Error('Unbound Reading AI cost recording receipt');
  return Object.freeze({callId:event.callId,replayed:result.rows[0].replayed});
}
