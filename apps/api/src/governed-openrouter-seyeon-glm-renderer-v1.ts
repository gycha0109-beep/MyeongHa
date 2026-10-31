import {
  createSeyeonGlmRendererV1,
  SEYEON_GLM_RENDERER_COST_ESTIMATE_PRICE_V1,
  SEYEON_GLM_RENDERER_MAX_REQUEST_BYTES_V1,
  SEYEON_GLM_RENDERER_MODEL_V1,
  SEYEON_GLM_RENDERER_PROVIDER_KEY_V1,
  type SeyeonGlmRendererConfigV1,
} from './openrouter-seyeon-glm-renderer-v1.js';
import {
  quoteSeyeonCostGovernorMaximumV1,
  validateSeyeonCostGovernorModelPolicyV1,
  type SeyeonCostGovernorQuoteV1,
} from './seyeon-cost-governor-server-policy-v1.js';
import {
  startGovernedSeyeonAiCallV1,
  storeGovernedSeyeonProviderReceiptV1,
  settleGovernedSeyeonAiCallV1,
  type SeyeonAiGovernorAdmissionV1,
  type SeyeonAiCostLedgerBindingV1,
} from './postgres-seyeon-ai-cost-ledger-v1.js';
import type { SeyeonProductionSubjectTransactionRunnerV1 } from './seyeon-production-subject-transaction-v1.js';
import type { SeyeonStructuredProviderPortV2, SeyeonStructuredProviderRequestV2 } from './seyeon-character-runtime-v2.js';

/**
 * The only permitted GLM ENFORCE path: a certified count followed by an
 * atomic DB reservation BEFORE network dispatch, then a pinned provider
 * receipt and governed settlement BEFORE returning the generated reply.
 *
 * The ordinary OpenAI count endpoint cannot certify a GLM token bound.
 * No heuristic counting, missing key, or direct non-governed fallback.
 */
export function createGovernedSeyeonGlmRendererV1(input: {
  readonly config: SeyeonGlmRendererConfigV1;
  readonly governor: SeyeonAiGovernorAdmissionV1;
  readonly runner: SeyeonProductionSubjectTransactionRunnerV1;
  readonly getBinding: () => SeyeonAiCostLedgerBindingV1 | null;
}): SeyeonStructuredProviderPortV2 {
  const policy = validateSeyeonCostGovernorModelPolicyV1(input.governor.policy);
  const price = SEYEON_GLM_RENDERER_COST_ESTIMATE_PRICE_V1;
  if (input.config.fetchImpl !== undefined ||
      input.config.beforeDispatch !== undefined ||
      input.config.afterOutcome !== undefined ||
      policy.providerKey !== SEYEON_GLM_RENDERER_PROVIDER_KEY_V1 ||
      policy.modelKey !== SEYEON_GLM_RENDERER_MODEL_V1 ||
      policy.allowedPurposes.length !== 1 ||
      policy.allowedPurposes[0] !== 'dialogue_render' ||
      policy.maximumOutputTokens !== 1536 ||
      policy.maximumSerializedRequestBytes > SEYEON_GLM_RENDERER_MAX_REQUEST_BYTES_V1 ||
      policy.priceQuote.priceVersion !== price.priceVersion ||
      policy.priceQuote.providerKey !== price.providerKey ||
      policy.priceQuote.modelKey !== price.modelKey ||
      policy.priceQuote.inputMicroUsdPerMillion !== price.inputMicroUsdPerMillion ||
      policy.priceQuote.cachedInputMicroUsdPerMillion !== price.cachedInputMicroUsdPerMillion ||
      policy.priceQuote.outputMicroUsdPerMillion !== price.outputMicroUsdPerMillion) {
    throw new Error('GLM ENFORCE requires an exact, server-approved OpenRouter cost policy.');
  }
  if (typeof input.governor.certifiedInputTokenUpperBound !== 'function') {
    throw new Error('GLM ENFORCE requires a certified input token bound.');
  }

  return Object.freeze({
    providerKey: SEYEON_GLM_RENDERER_PROVIDER_KEY_V1,
    modelKey: SEYEON_GLM_RENDERER_MODEL_V1,
    async generate(request: SeyeonStructuredProviderRequestV2) {
      let binding: SeyeonAiCostLedgerBindingV1 | null = null;
      let callId: string | null = null;
      let quote: SeyeonCostGovernorQuoteV1 | null = null;
      let settled = false;
      const provider = createSeyeonGlmRendererV1({
        apiKey: input.config.apiKey,
        async beforeDispatch(call, exact) {
          const current = input.getBinding();
          if (current === null) throw Error('GLM ENFORCE needs an active authoritative Chat attempt.');
          if (new TextEncoder().encode(exact.serializedRequestBody).byteLength !==
              exact.requestBodyBytes) {
            throw Error('GLM governed token count requires an immutable serialized request.');
          }
          const verifiedInput = await input.governor.certifiedInputTokenUpperBound(
            exact.request, exact.requestBodyBytes, exact.serializedRequestBody,
          );
          const approved = quoteSeyeonCostGovernorMaximumV1({
            policy,
            request: {
              purpose: call.purpose,
              providerKey: call.providerKey,
              modelKey: call.modelKey,
              verifiedInputTokenUpperBound: verifiedInput,
              serializedRequestBytes: exact.requestBodyBytes,
              enforcedOutputTokenLimit: 1536,
            },
          });
          await input.runner.run(current.subjectId, client =>
            startGovernedSeyeonAiCallV1(client, current, {
              ...call, quote: approved, requestBodyBytes: exact.requestBodyBytes,
            }),
          );
          binding = current;
          callId = call.callId;
          quote = approved;
        },
        async afterOutcome(event) {
          if (binding === null || quote === null || event.callId !== callId) {
            throw Error('GLM governed outcome has no committed reservation.');
          }
          await input.runner.run(binding.subjectId, client =>
            storeGovernedSeyeonProviderReceiptV1(client, binding!, event));
          const result = await input.runner.run(binding.subjectId, client =>
            settleGovernedSeyeonAiCallV1(client, binding!, event));
          if (result.overCeiling) {
            throw Error('GLM governed cost ceiling exceeded; reply denied.');
          }
          if (event.outcome === 'response_received' &&
              (event.costStatus !== 'estimated' ||
               event.priceVersion !== quote!.rateCardVersion ||
               event.inputTokens === null || event.inputTokens > quote!.inputCeilingTokens ||
               event.outputTokens === null || event.outputTokens > quote!.outputCeilingTokens)) {
            throw Error('GLM provider usage is outside the admitted limit; reply denied.');
          }
          settled = true;
        },
      });
      const result = await provider.generate(request);
      if (!settled || binding === null || callId === null) {
        throw Error('GLM governed settlement was not committed; reply denied.');
      }
      return result;
    },
  });
}
