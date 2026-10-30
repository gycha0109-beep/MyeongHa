import type {
  ReadingAiProviderCallObservationV1,
} from './reading-ai-call-cost-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { SeyeonAiPriceV1 } from './seyeon-ai-usage-cost-v1.js';
import { createReadingAiCostWriterV1 } from './reading-ai-cost-writer-v1.js';

/** Mirror of the server-private Saju OpenAI onProviderCall receipt.
 * It contains no provider response text, auth data, Birth input or user ID.
 * This is NOT an untrusted HTTP payload contract. The application must
 * provide this receipt from an authenticated Saju server-owned callback.
 */
export interface SajuNarrativeProviderObservationV1 {
  readonly callId: string;
  readonly requestId: string;
  readonly providerKey: 'openai';
  readonly modelKey: string;
  readonly source: ReadingAiProviderCallObservationV1['source'];
  readonly outcome:
    | 'response_received'
    | 'http_failure'
    | 'network_failure'
    | 'timeout'
    | 'invalid_response';
  readonly observedAt: string;
  readonly usage: ReadingAiProviderCallObservationV1['usage'];
}

type Binding = Pick<ReadingAiProviderCallObservationV1,
  'subjectId' | 'readingId' | 'executionAttemptId'>;

/**
 * Trusted DB Owner correlation proof. The implementation must verify that an
 * already allocated, governed Reading execution attempt is bound to EXACTLY
 * this Saju server request. No guessed Saju/DB Reading UUID equivalence.
 *
 * Until Production Interpretation Authority admits an actual source request
 * -> DB attempt mapping, the implementation must return null.
 */
export interface SajuReadingProviderBindingAuthorityV1 {
  resolve(input: Readonly<{
    sajuRequestId: string;
    callId: string;
    modelKey: string;
    observedAt: string;
  }>): Promise<Binding | null>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUIRED_KEYS = [
  'callId','requestId','providerKey','modelKey','source','outcome','observedAt','usage',
] as const;
const USAGE_KEYS = [
  'inputTokens','outputTokens','cachedInputTokens','reasoningTokens',
] as const;
const OUTCOMES = new Set(['response_received','http_failure','network_failure','timeout','invalid_response']);

function data(value:unknown):Record<string,unknown>|null {
  return value!==null&&typeof value==='object'&&!Array.isArray(value)
    ?value as Record<string,unknown>:null;
}

function exact(value:Record<string,unknown>,keys:readonly string[]):boolean {
  return Object.keys(value).length===keys.length &&
    Object.keys(value).every(key=>keys.includes(key));
}

function validateObservation(
  raw:unknown,
  expectedSajuRequestId:string,
  expectedModelKey:string,
):SajuNarrativeProviderObservationV1 {
  const event=data(raw);
  if(event===null||!exact(event,REQUIRED_KEYS)||
    typeof event.callId!=='string'||!UUID.test(event.callId)||
    typeof event.requestId!=='string'||event.requestId!==expectedSajuRequestId||
    typeof event.modelKey!=='string'||event.modelKey!==expectedModelKey||
    event.providerKey!=='openai'||
    !OUTCOMES.has(String(event.outcome))||
    (event.source!=='provider_response_usage'&&event.source!=='provider_attempt_without_usage')||
    typeof event.observedAt!=='string'||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(event.observedAt)||
    !Number.isFinite(Date.parse(event.observedAt))||
    !data(event.usage)||!exact(data(event.usage)!,USAGE_KEYS))
    throw Error('Unbound Saju narrative provider observation');
  const usage=data(event.usage)!;
  for(const field of USAGE_KEYS){
    const value=usage[field];
    if(value!==null&&(typeof value!=='number'||!Number.isSafeInteger(value)||value<0))
      throw Error('Invalid Saju narrative provider counter');
  }
  if(event.source==='provider_response_usage'){
    if(event.outcome!=='response_received'||usage.inputTokens===null||usage.outputTokens===null||
      (usage.cachedInputTokens!==null&&Number(usage.cachedInputTokens)>Number(usage.inputTokens))||
      (usage.reasoningTokens!==null&&Number(usage.reasoningTokens)>Number(usage.outputTokens)))
      throw Error('Unbound Saju token usage');
  } else if(USAGE_KEYS.some(field=>usage[field]!==null)){
    throw Error('Unbound Saju missing usage');
  }
  return event as unknown as SajuNarrativeProviderObservationV1;
}

/** Adapter between authenticated Saju's real provider callback and the
 * restricted Admin ledger writer. The caller MUST already bind Saju requestId
 * to the DB Owner's actual Subject/Reading/execution attempt; a Saju-native
 * Reading ID, a preview response, or user-supplied metadata cannot do so.
 *
 * This does not install an HTTP handler or activate the Saju service.
 */
export function createSajuNarrativeReadingCostBridgeV1(input:{
  readonly pool:PostgresSubjectPoolV1;
  readonly bindingAuthority:SajuReadingProviderBindingAuthorityV1;
}){
  const writer=createReadingAiCostWriterV1({pool:input.pool});
  return Object.freeze({
    async record(inputEvent:{
      readonly expectedSajuRequestId:string;
      readonly expectedModelKey:string;
      readonly observation:unknown;
      readonly price?:SeyeonAiPriceV1;
    }){
      if(typeof inputEvent.expectedSajuRequestId!=='string'||
        inputEvent.expectedSajuRequestId.length<1||
        inputEvent.expectedSajuRequestId.length>256||
        typeof inputEvent.expectedModelKey!=='string'||
        inputEvent.expectedModelKey.length<1||
        inputEvent.expectedModelKey.length>128)
        throw Error('Missing authoritative Saju call correlation');
      const event=validateObservation(
        inputEvent.observation,inputEvent.expectedSajuRequestId,inputEvent.expectedModelKey,
      );
      const binding=await input.bindingAuthority.resolve({
        sajuRequestId:event.requestId,callId:event.callId,
        modelKey:event.modelKey,observedAt:event.observedAt,
      });
      // Absence of DB Owner's authenticated correspondence is a HOLD, not
      // license to attach a Saju-native ID to a convenient Reading row.
      if(binding===null)throw Error('Unverified Saju to DB Reading execution mapping');
      return writer.record({
        ...binding,
        callId:event.callId,
        observedAt:event.observedAt,
        providerKey:event.providerKey,
        modelKey:event.modelKey,
        source:event.source,
        outcome:event.outcome,
        usage:event.usage,
        ...(inputEvent.price===undefined?{}:{price:inputEvent.price}),
      });
    },
  });
}
