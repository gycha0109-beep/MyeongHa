import {
  readBoundedUpstreamJsonTextV1,
} from './upstream-json-response-resource.js';
import {
  createSeyeonAiCostEventV1,
  type SeyeonAiCostEventV1,
  type SeyeonAiCallOutcomeV1,
  type SeyeonAiPriceV1,
} from './seyeon-ai-usage-cost-v1.js';
import type {
  SeyeonStructuredProviderPortV2,
  SeyeonStructuredProviderRequestV2,
} from './seyeon-character-runtime-v2.js';

export const SEYEON_GLM_RENDERER_MODEL_V1 = 'z-ai/glm-5.3-flash' as const;
export const SEYEON_GLM_RENDERER_PROVIDER_KEY_V1 = 'openrouter-chat' as const;
export const SEYEON_GLM_RENDERER_ENDPOINT_V1 =
  'https://openrouter.ai/api/v1/chat/completions' as const;
/** Real conversation packets include pinned context; the shadow cap was only 24 KiB. */
export const SEYEON_GLM_RENDERER_MAX_REQUEST_BYTES_V1 = 131_072 as const;

/** Conservative non-promotion list-price estimate; not an invoice or ENFORCE budget approval. */
export const SEYEON_GLM_RENDERER_COST_ESTIMATE_PRICE_V1: SeyeonAiPriceV1 = Object.freeze({
  priceVersion: 'openrouter-glm53flash-list-20261031',
  providerKey: SEYEON_GLM_RENDERER_PROVIDER_KEY_V1,
  modelKey: SEYEON_GLM_RENDERER_MODEL_V1,
  // OpenRouter's regular (non-discounted) published rates, USD/M tokens.
  inputMicroUsdPerMillion: 150_000,
  cachedInputMicroUsdPerMillion: 150_000,
  outputMicroUsdPerMillion: 500_000,
});

export interface SeyeonGlmRendererConfigV1 {
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly beforeDispatch?: (call: Readonly<{
    callId: string;
    purpose: 'dialogue_render';
    providerKey: typeof SEYEON_GLM_RENDERER_PROVIDER_KEY_V1;
    modelKey: typeof SEYEON_GLM_RENDERER_MODEL_V1;
  }>, exact: Readonly<{
    request: SeyeonStructuredProviderRequestV2;
    serializedRequestBody: string;
    requestBodyBytes: number;
  }>) => Promise<void>;
  readonly afterOutcome?: (event: SeyeonAiCostEventV1) => Promise<void>;
}

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export function createSeyeonGlmRendererV1(
  config: SeyeonGlmRendererConfigV1,
): SeyeonStructuredProviderPortV2 {
  if (typeof config?.apiKey !== 'string' || config.apiKey.trim().length < 20) {
    throw new Error('Se-yeon GLM renderer requires a server OpenRouter key.');
  }
  const fetchImpl = config.fetchImpl ?? fetch;
  const key = config.apiKey.trim();

  return Object.freeze({
    providerKey: SEYEON_GLM_RENDERER_PROVIDER_KEY_V1,
    modelKey: SEYEON_GLM_RENDERER_MODEL_V1,
    async generate(request: SeyeonStructuredProviderRequestV2): Promise<unknown> {
      if (request?.contractVersion !== 'seyeon-structured-provider-v2' ||
          request.purpose !== 'dialogue_render' ||
          typeof request.instructions !== 'string' || !request.instructions.trim() ||
          !record(request.responseSchema) ||
          request.responseSchema.type !== 'object' ||
          request.responseSchema.additionalProperties !== false) {
        throw new Error('Invalid Se-yeon GLM rendering request.');
      }
      const body = JSON.stringify({
        model: SEYEON_GLM_RENDERER_MODEL_V1,
        stream: false,
        max_completion_tokens: 1536,
        messages: [
          {role: 'system', content: request.instructions},
          {role: 'user', content: JSON.stringify(request.input)},
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'myeongha_dialogue_render_v2',
            strict: true,
            schema: request.responseSchema,
          },
        },
        provider: {
          require_parameters: true,
          allow_fallbacks: false,
          zdr: true,
          data_collection: 'deny',
        },
      });
      const bytes = new TextEncoder().encode(body).byteLength;
      if (bytes < 1 || bytes > SEYEON_GLM_RENDERER_MAX_REQUEST_BYTES_V1) {
        throw new Error('Se-yeon GLM renderer request exceeds the bounded size.');
      }
      const callId = crypto.randomUUID();
      const started = performance.now();
      const base = Object.freeze({
        callId, purpose: 'dialogue_render' as const,
        providerKey: SEYEON_GLM_RENDERER_PROVIDER_KEY_V1,
        modelKey: SEYEON_GLM_RENDERER_MODEL_V1,
      });
      // The cost ledger start must commit before paid inference.
      await config.beforeDispatch?.(base, Object.freeze({
        request,
        serializedRequestBody: body,
        requestBodyBytes: bytes,
      }));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      let outcome: SeyeonAiCallOutcomeV1 = 'network_failure';
      let status: number | null = null;
      let inputTokens: number | null = null;
      let outputTokens: number | null = null;
      let cachedInputTokens: number | null = null;
      let reasoningTokens: number | null = null;
      try {
        const response = await fetchImpl(SEYEON_GLM_RENDERER_ENDPOINT_V1, {
          method: 'POST',
          redirect: 'error',
          headers: {
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Client-Request-Id': callId,
          },
          body,
          signal: controller.signal,
        });
        status = response.status;
        if (!response.ok) {
          void response.body?.cancel().catch(() => undefined);
          outcome = 'http_failure';
          throw new Error('Se-yeon GLM renderer provider returned an HTTP failure.');
        }
        if (!/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type') ?? '')) {
          outcome = 'invalid_content_type';
          throw new Error('Se-yeon GLM renderer returned an invalid content type.');
        }
        const raw = await readBoundedUpstreamJsonTextV1(response, {
          maximumBodyBytes: 524_288, signal: controller.signal,
        });
        const payload: unknown = JSON.parse(raw);
        if (!record(payload) ||
            payload.model !== SEYEON_GLM_RENDERER_MODEL_V1 ||
            !Array.isArray(payload.choices) || payload.choices.length !== 1 ||
            !record(payload.choices[0])) {
          outcome = 'invalid_response';
          throw new Error('Se-yeon GLM renderer response envelope is invalid.');
        }
        const choice = payload.choices[0] as Record<string, unknown>;
        if (choice.finish_reason !== 'stop' || !record(choice.message) ||
            choice.message.role !== 'assistant' ||
            typeof choice.message.content !== 'string' || !choice.message.content.trim() ||
            choice.message.refusal || choice.message.tool_calls) {
          outcome = 'invalid_response';
          throw new Error('Se-yeon GLM renderer returned no completed response.');
        }
        if (record(payload.usage)) {
          const u = payload.usage;
          const number = (value: unknown): number | null =>
            typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
          inputTokens = number(u.prompt_tokens);
          outputTokens = number(u.completion_tokens);
          const details = record(u.prompt_tokens_details) ? u.prompt_tokens_details : {};
          const completionDetails = record(u.completion_tokens_details) ? u.completion_tokens_details : {};
          cachedInputTokens = number(details.cached_tokens ?? 0);
          reasoningTokens = number(completionDetails.reasoning_tokens ?? 0);
        }
        // A delivered reply without metered usage is not admitted as a valid GLM result.
        if (inputTokens === null || inputTokens < 1 || outputTokens === null ||
            outputTokens < 1 || outputTokens > 1536 || cachedInputTokens === null ||
            cachedInputTokens > inputTokens || reasoningTokens === null ||
            reasoningTokens > outputTokens) {
          // Malformed upstream counters must not also break the durable failure receipt.
          inputTokens = null;
          outputTokens = null;
          cachedInputTokens = null;
          reasoningTokens = null;
          outcome = 'invalid_response';
          throw new Error('Se-yeon GLM renderer response lacks valid usage.');
        }
        const result: unknown = JSON.parse(choice.message.content);
        if (!record(result)) {
          outcome = 'invalid_response';
          throw new Error('Se-yeon GLM renderer returned invalid structured output.');
        }
        outcome = 'response_received';
        return result;
      } catch (error) {
        if (controller.signal.aborted) outcome = 'timeout';
        else if (outcome === 'network_failure' && status !== null) outcome = 'invalid_response';
        throw error;
      } finally {
        clearTimeout(timer);
        const event = createSeyeonAiCostEventV1({
          ...base, outcome, httpStatus: status,
          elapsedMs: Math.max(0, Math.round(performance.now() - started)),
          usage: {inputTokens, outputTokens, cachedInputTokens, reasoningTokens},
          price: SEYEON_GLM_RENDERER_COST_ESTIMATE_PRICE_V1,
        });
        await config.afterOutcome?.(event);
      }
    },
  });
}
