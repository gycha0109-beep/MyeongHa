import type { SeyeonAiPriceV1, SeyeonAiTokenUsageV1 } from './seyeon-ai-usage-cost-v1.js';
import {
  buildReadingAiCallCostV1,
  type ReadingAiProviderCallObservationV1,
} from './reading-ai-call-cost-v1.js';

type Binding = Pick<ReadingAiProviderCallObservationV1,
  'subjectId'|'readingId'|'executionAttemptId'|'callId'|'observedAt'>;

function record(value:unknown):Record<string,unknown>|null{
  return value!==null&&typeof value==='object'&&!Array.isArray(value)
    ?value as Record<string,unknown>:null;
}
function count(value:unknown):number|null{
  if(value===null||value===undefined)return null;
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)
    throw Error('Invalid OpenAI Reading provider token counter');
  return value;
}

/**
 * Server-held OpenAI Responses usage evidence, NOT the consumer
 * ProductReadingResponse. Caller must bind the *actual* Reading execution
 * attempt and its server-created call ID before dispatching the LLM request.
 *
 * Saju currently does not forward this authenticated provider receipt through
 * ProductReadingResponse; therefore this parser is deliberately not installed
 * on the Saju HTTP transport and does not mark coverage complete.
 */
export function observeOpenAiReadingCallCostV1(input:{
  readonly binding:Binding;
  readonly providerResponse:unknown;
  readonly expectedModelKey:string;
  /** Server-owned per-call rate, never read from the provider response. */
  readonly price?:SeyeonAiPriceV1;
}):ReturnType<typeof buildReadingAiCallCostV1>{
  const body=record(input.providerResponse);
  if(body===null||body.model!==input.expectedModelKey||body.status!=='completed'){
    throw Error('Unbound OpenAI Reading provider response');
  }
  const usage=record(body.usage);
  const inputDetails=record(usage?.input_tokens_details);
  const outputDetails=record(usage?.output_tokens_details);
  const parsed:SeyeonAiTokenUsageV1={
    inputTokens:count(usage?.input_tokens),
    outputTokens:count(usage?.output_tokens),
    cachedInputTokens:count(inputDetails?.cached_tokens),
    reasoningTokens:count(outputDetails?.reasoning_tokens),
  };
  // An incomplete or unavailable provider usage receipt must not appear
  // as a 0-token bill. Reject partially populated top-level counters.
  if((parsed.inputTokens===null)!==(parsed.outputTokens===null))
    throw Error('Incomplete OpenAI Reading usage receipt');
  const hasUsage=parsed.inputTokens!==null;
  if(!hasUsage && [parsed.cachedInputTokens,parsed.reasoningTokens].some(x=>x!==null))
    throw Error('Unbound OpenAI Reading usage detail');
  if(usage?.total_tokens!==undefined&&usage.total_tokens!==null){
    const total=count(usage.total_tokens);
    if(total!==null&&hasUsage&&total!==parsed.inputTokens!+parsed.outputTokens!)
      throw Error('Inconsistent OpenAI Reading token total');
  }
  const observation:ReadingAiProviderCallObservationV1={
    ...input.binding,
    source:hasUsage?'provider_response_usage':'provider_attempt_without_usage',
    providerKey:'openai',
    modelKey:input.expectedModelKey,
    outcome:'response_received',
    usage:hasUsage?parsed:{inputTokens:null,outputTokens:null,cachedInputTokens:null,reasoningTokens:null},
    ...(input.price===undefined?{}:{price:input.price}),
  };
  return buildReadingAiCallCostV1(observation);
}
