/** Offline-only OpenRouter request/receipt contract for Yeoul's KRW 500 pilot.
 * Building a payload is NOT permission to transmit it. No HTTP or key handling.
 * Provider cost evidence is NOT independently authenticated or settled here.
 */
import { YEOUL_STUDENT_MODEL } from './yeoul-openrouter-readonly-preflight-v1.mjs';

export class YeoulTransportHold extends Error {
  constructor(code) { super('YEOUL_LIVE_TRANSPORT_HOLD:' + code); this.name = 'YeoulTransportHold'; }
}
const deny = code => { throw new YeoulTransportHold(code); };
const boundedInt = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const safeId = v => typeof v === 'string' && /^[A-Za-z0-9._:-]{1,120}$/u.test(v);
const safeProvider = v => typeof v === 'string' && /^[A-Za-z0-9_.\/-]{1,90}$/u.test(v);

/** Exact allowlist: no tools, plugins, response modality fallback or caller-supplied route. */
export function buildPinnedYeoulChatPayload({ providerTag, messages, maxOutputTokens } = {}) {
  if (!safeProvider(providerTag)) deny('provider_tag_unverified');
  if (!boundedInt(maxOutputTokens, 256) || maxOutputTokens < 16)
    deny('output_token_ceiling');
  if (!Array.isArray(messages) || messages.length < 2 || messages.length > 12)
    deny('message_count');
  let totalChars = 0;
  const clean = messages.map(message => {
    if (!message || typeof message !== 'object' || Array.isArray(message)
        || Object.keys(message).sort().join(',') !== 'content,role'
        || !['system', 'user', 'assistant'].includes(message.role)
        || typeof message.content !== 'string' || !message.content.trim())
      deny('message_shape_or_tool_escape');
    totalChars += message.content.length;
    if (message.content.length > 8_000 || totalChars > 16_000)
      deny('message_length');
    return Object.freeze({ role: message.role, content: message.content });
  });
  if (clean[0].role !== 'system' || clean[1].role !== 'user'
      || clean[clean.length - 1].role !== 'user') deny('message_order');
  return Object.freeze({
    model: YEOUL_STUDENT_MODEL,
    messages: Object.freeze(clean),
    max_tokens: maxOutputTokens,
    stream: false,
    provider: Object.freeze({
      only: Object.freeze([providerTag]),
      allow_fallbacks: false, require_parameters: true,
      zdr: true, data_collection: 'deny',
    }),
  });
}

/** Check response against observed generation evidence; never return its private text.
 * Unconfirmed provider billing, FX or extras must remain HELD in the durable ledger.
 */
export function inspectYeoulGenerationEvidence({
  completion, generation, expectedProviderName, maxPromptTokens,
  maxCompletionTokens, maxReasoningTokens = 0, reservedMicroUsd,
} = {}) {
  if (!safeProvider(expectedProviderName)) deny('provider_name_not_verified');
  for (const [k, v] of Object.entries({
    maxPromptTokens, maxCompletionTokens, maxReasoningTokens, reservedMicroUsd,
  })) if (!boundedInt(v, 1_000_000_000) || (k !== 'maxReasoningTokens' && v < 1))
    deny('invalid_receipt_ceiling');
  const record = generation?.data;
  if (!completion || typeof completion !== 'object' || !record
      || typeof record !== 'object' || !safeId(completion.id)
      || completion.id !== record.id
      || completion.model !== YEOUL_STUDENT_MODEL
      || record.model !== YEOUL_STUDENT_MODEL
      || record.provider_name !== expectedProviderName
      || record.is_byok !== false || record.cancelled !== false)
    deny('untrusted_generation_identity');
  const requiredCounts = {
    native_tokens_prompt: maxPromptTokens,
    native_tokens_completion: maxCompletionTokens,
    native_tokens_reasoning: maxReasoningTokens,
  };
  for (const [name, max] of Object.entries(requiredCounts)) {
    const v = record[name];
    if (!boundedInt(v, max)) deny('missing_or_excess_native_tokens');
  }
  // Unexpected auxiliary usage can carry charges absent from a token-only quote.
  const extras = [
    'num_fetches', 'num_search_results', 'num_media_prompt', 'num_media_completion',
    'num_input_audio_prompt', 'native_tokens_completion_images',
  ];
  if (extras.some(k => !boundedInt(record[k], 0)))
    deny('unpriced_generation_component');
  if (typeof record.total_cost !== 'number' || !Number.isFinite(record.total_cost)
      || record.total_cost < 0) deny('unknown_total_cost');
  const microUsd = Math.ceil(record.total_cost * 1_000_000 - 1e-9);
  if (!Number.isSafeInteger(microUsd) || microUsd < 0 || microUsd > reservedMicroUsd)
    deny('cost_exceeds_usd_reservation');
  return Object.freeze({
    schemaVersion: 'yeoul-generation-evidence-v1',
    evidenceValidated: true,
    reservedMicroUsd,
    reportedMicroUsdCeiling: microUsd,
    // A successful API body/metadata match is not a verified final charge.
    billingAndFxIndependentlyReconciled: false,
    budgetLedgerSettlementAllowed: false,
    transportApprovalAuthenticated: false,
    paidExecutionReady: false,
  });
}
