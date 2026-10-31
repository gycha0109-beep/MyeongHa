import {
  SEYEON_GLM_RENDERER_COST_ESTIMATE_PRICE_V1,
  SEYEON_GLM_RENDERER_MAX_REQUEST_BYTES_V1,
} from './openrouter-seyeon-glm-renderer-v1.js';
import type {SeyeonAiGovernorAdmissionV1} from './postgres-seyeon-ai-cost-ledger-v1.js';
import type {SeyeonStructuredProviderRequestV2} from './seyeon-character-runtime-v2.js';
import type {SeyeonCostGovernorModelPolicyV1} from './seyeon-cost-governor-server-policy-v1.js';

/**
 * The OpenRouter model listing for GLM-5.3-Flash advertises a 1,048,576
 * token context window (2026-10-31).
 * Reserve the ENTIRE provider-advertised usable input capacity rather than
 * guessing tokens from bytes or invoking an unrelated OpenAI tokenizer.
 * This deliberately over-reserves and may hit the per-Subject budget; it
 * cannot silently underquote any successfully completed model response
 * within the advertised provider context limit.
 */
export const SEYEON_GLM_CONTEXT_CAPACITY_V1 = 1_048_576 as const;
export const SEYEON_GLM_GOVERNED_OUTPUT_LIMIT_V1 = 1536 as const;
export const SEYEON_GLM_CERTIFIED_INPUT_CAPACITY_V1 =
  SEYEON_GLM_CONTEXT_CAPACITY_V1 - SEYEON_GLM_GOVERNED_OUTPUT_LIMIT_V1;

export const SEYEON_GLM_GOVERNED_POLICY_V1:SeyeonCostGovernorModelPolicyV1=Object.freeze({
  policyVersion:'seyeon-glm53flash-context-capacity-20261031',
  providerKey:SEYEON_GLM_RENDERER_COST_ESTIMATE_PRICE_V1.providerKey,
  modelKey:SEYEON_GLM_RENDERER_COST_ESTIMATE_PRICE_V1.modelKey,
  priceQuote:SEYEON_GLM_RENDERER_COST_ESTIMATE_PRICE_V1,
  allowedPurposes:Object.freeze(['dialogue_render'] as const),
  contextWindowTokens:SEYEON_GLM_CONTEXT_CAPACITY_V1,
  maximumInputTokens:SEYEON_GLM_CERTIFIED_INPUT_CAPACITY_V1,
  maximumOutputTokens:SEYEON_GLM_GOVERNED_OUTPUT_LIMIT_V1,
  maximumSerializedRequestBytes:SEYEON_GLM_RENDERER_MAX_REQUEST_BYTES_V1,
});

/**
 * No inference model calls and no approximate tokenization. The caller has
 * already constructed the exact immutable text-only GLM JSON body. The
 * full provider context capacity is reserved before dispatch; real reported
 * usage must fit the bound after delivery or the reply is withheld.
 */
export function createSeyeonGlmContextCapacityGovernorV1():SeyeonAiGovernorAdmissionV1 {
  return Object.freeze({
    policy:SEYEON_GLM_GOVERNED_POLICY_V1,
    certifiedInputTokenUpperBound:async (_request:SeyeonStructuredProviderRequestV2,bytes:number,body:string)=>{
      if (typeof body !== 'string' ||
          !Number.isSafeInteger(bytes) || bytes < 1 ||
          bytes > SEYEON_GLM_RENDERER_MAX_REQUEST_BYTES_V1 ||
          new TextEncoder().encode(body).byteLength !== bytes) {
        return null;
      }
      return SEYEON_GLM_CERTIFIED_INPUT_CAPACITY_V1;
    },
  });
}
