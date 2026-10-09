import type { SeyeonStructuredProviderRequestV2 } from './seyeon-character-runtime-v2.js';
import type { OpenAiSeyeonStructuredProviderFetchV1 } from './openai-seyeon-structured-provider-v1.js';
import type { SeyeonAiGovernorAdmissionV1 } from './postgres-seyeon-ai-cost-ledger-v1.js';
import {
  validateSeyeonCostGovernorModelPolicyV1,
  type SeyeonCostGovernorModelPolicyV1,
} from './seyeon-cost-governor-server-policy-v1.js';

/**
 * D2: server-only, optional preflight to the official Responses input-token
 * count endpoint. No generation endpoint is called by this module.
 *
 * This is a separate external request whose availability, pricing, data
 * handling and rate limits need Production review before ENFORCE.
 * Never turn on by default or fall back to characters/4 on an error.
 */
export const SEYEON_OPENAI_INPUT_TOKEN_COUNT_VERSION_V1 =
  'seyeon-openai-input-token-count-v1' as const;
export const SEYEON_OPENAI_INPUT_TOKEN_COUNT_ENDPOINT_V1 =
  'https://api.openai.com/v1/responses/input_tokens' as const;

export interface SeyeonOpenAiInputTokenCountConfigV1 {
  readonly apiKey: string;
  readonly model: string;
  readonly policy: SeyeonCostGovernorModelPolicyV1;
  readonly reservedHeadroomTokens: number;
  readonly fetchImpl?: OpenAiSeyeonStructuredProviderFetchV1;
  readonly timeoutMs?: number;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

const BODY_FIELDS = new Set([
  'model','store','max_output_tokens','instructions','input','text',
]);

function projectExactCountRequest(
  body: string,
  byteLength: number,
  expectedModel: string,
  expectedOutputCeiling: number,
): string {
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 ||
    new TextEncoder().encode(body).byteLength !== byteLength) {
    throw new Error('Input token count request must use the exact final body bytes.');
  }

  const parsed: unknown = JSON.parse(body);
  if (!isRecord(parsed) ||
      Object.keys(parsed).some(key => !BODY_FIELDS.has(key)) ||
      parsed.model !== expectedModel ||
      parsed.store !== false ||
      parsed.max_output_tokens !== expectedOutputCeiling ||
      typeof parsed.instructions !== 'string' ||
      parsed.instructions.length === 0 ||
      !Array.isArray(parsed.input) ||
      !isRecord(parsed.text) ||
      !isRecord(parsed.text.format)) {
    // Reject the gateway's providerOptions, images/tools that aren't part of
    // this strict text-only contract and any newly introduced API fields.
    throw new Error('Input token count cannot certify unsupported request framing.');
  }

  // POST /responses/input_tokens accepts these precise input-bearing fields.
  // No truncation, tokens-per-character estimate or regenerated instructions.
  return JSON.stringify({
    model: parsed.model,
    instructions: parsed.instructions,
    input: parsed.input,
    text: parsed.text,
  });
}

export function createSeyeonOpenAiInputTokenCountAdmissionV1(
  config: SeyeonOpenAiInputTokenCountConfigV1,
): SeyeonAiGovernorAdmissionV1 {
  const policy = validateSeyeonCostGovernorModelPolicyV1(config.policy);
  if (policy.providerKey !== 'openai-responses' ||
      config.model !== policy.modelKey ||
      typeof config.apiKey !== 'string' ||
      config.apiKey.trim() !== config.apiKey ||
      config.apiKey.length < 10 ||
      /[\r\n]/u.test(config.apiKey) ||
      !Number.isSafeInteger(config.reservedHeadroomTokens) ||
      config.reservedHeadroomTokens < 1 ||
      config.reservedHeadroomTokens >= policy.maximumInputTokens) {
    throw new Error('Input token count requires a valid server-owned OpenAI policy.');
  }
  const limitMs = config.timeoutMs ?? 8000;
  if (!Number.isSafeInteger(limitMs) || limitMs < 1 || limitMs > 30000) {
    throw new Error('Input token count deadline is outside supported bounds.');
  }
  const send = config.fetchImpl ?? fetch;
  return Object.freeze({
    policy,
    async certifiedInputTokenUpperBound(
      _request: SeyeonStructuredProviderRequestV2,
      exactRequestBodyBytes: number,
      serializedRequestBody: string,
    ): Promise<number> {
      // The native provider's final JSON body is the only accepted source.
      const countBody = projectExactCountRequest(
        serializedRequestBody,
        exactRequestBodyBytes,
        policy.modelKey,
        policy.maximumOutputTokens,
      );
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(),limitMs);
      let result: Response;
      try {
        try {
          result = await send(SEYEON_OPENAI_INPUT_TOKEN_COUNT_ENDPOINT_V1,{
            method:'POST',
            headers:{
              authorization:'Bearer '+config.apiKey,
              accept:'application/json',
              'content-type':'application/json',
            },
            body:countBody,
            signal:controller.signal,
            redirect:'error',
          });
        } catch {
          throw new Error('Input token count request failed or exceeded its deadline.');
        }
        if (!result.ok ||
            !(result.headers.get('content-type') ?? '').toLowerCase()
              .includes('application/json')) {
          throw new Error('Input token count provider declined or returned unknown format.');
        }
        let bytes: string;
        try {
          bytes = await result.text();
        } catch {
          throw new Error('Input token count response body failed or timed out.');
        }
        if (new TextEncoder().encode(bytes).byteLength>8192) {
          throw new Error('Input token count response was oversized.');
        }
        let payload: unknown;
        try { payload=JSON.parse(bytes); }
        catch { throw new Error('Input token count response is invalid JSON.'); }
        if (!isRecord(payload) ||
            payload.object !== 'response.input_tokens' ||
            !Number.isSafeInteger(payload.input_tokens) ||
            (payload.input_tokens as number)<1) {
          throw new Error('Input token count receipt is malformed.');
        }
        const resultUpperBound=(payload.input_tokens as number)+config.reservedHeadroomTokens;
        if (!Number.isSafeInteger(resultUpperBound) ||
            resultUpperBound>policy.maximumInputTokens) {
          throw new Error('Input token count exceeds approved model budget.');
        }
        return resultUpperBound;

      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
