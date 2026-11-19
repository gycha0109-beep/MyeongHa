import {
  createOpenAiOfficialWealthLunaWriterV1,
  type OfficialWealthLunaDispatchAuthorityV1,
  type OfficialWealthLunaDurablePortV1,
} from './openai-official-wealth-luna-writer-v1.js';
import type { AuthorizedOfficialWealthLunaWriterPortV1 } from './official-wealth-luna-reader-v1.js';

export const ROUTED_LUNA_MODEL_ID_V1 = 'openai/gpt-6-luna' as const;
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions' as const;

/** OpenRouter is the already-used and authenticated routing choice in this
 * repository. The direct OpenAI test previously returned 401; never silently
 * change a published character model or route to another model.
 */
export interface OpenRouterWealthLunaProductionConfigV1 {
  readonly apiKey: string;
  readonly authority: OfficialWealthLunaDispatchAuthorityV1;
  readonly durable: OfficialWealthLunaDurablePortV1;
  readonly fetchImpl?: typeof fetch;
  readonly maxOutputTokens?: number;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('Missing exact billed token usage from Luna router');
  }
  return value;
}

/** Fail closed unless this is exactly a completed response from the
 * owner-pinned Luna model with an accounted, billable usage report.
 */
function translateRouterOutputV1(value: unknown): unknown {
  if (!object(value) || (value.model !== ROUTED_LUNA_MODEL_ID_V1 && value.model !== 'gpt-6-luna') ||
      !Array.isArray(value.choices) || value.choices.length !== 1 ||
      !object(value.choices[0]) || value.choices[0].finish_reason !== 'stop' ||
      !object(value.choices[0].message) ||
      typeof value.choices[0].message.content !== 'string' ||
      value.choices[0].message.content.length === 0 ||
      !object(value.usage)) {
    throw new TypeError('Luna router response does not meet the exact model and completion contract');
  }
  return {
    status: 'completed',
    model: 'gpt-6-luna',
    output: [{
      type: 'message',
      content: [{type: 'output_text', text: value.choices[0].message.content}],
    }],
    usage: {
      input_tokens: safeCount(value.usage.prompt_tokens),
      output_tokens: safeCount(value.usage.completion_tokens),
    },
  };
}

/** Implements the same protected admission/reservation/settlement contract
 * as the existing Responses writer. No consumer-visible endpoint is opened
 * by this module; the production composition root must explicitly supply
 * the owner-bound authority and durable writer ports.
 */
export function createOpenRouterOfficialWealthLunaWriterV1(
  config: OpenRouterWealthLunaProductionConfigV1,
): AuthorizedOfficialWealthLunaWriterPortV1 {
  if (!config.apiKey?.startsWith('sk-or-v1-')) {
    throw new TypeError('Exact OpenRouter server credential required');
  }
  const send = config.fetchImpl ?? fetch;
  const adapter: typeof fetch = async (_url, init) => {
    if (init?.method !== 'POST' || typeof init.body !== 'string') {
      throw new TypeError('Unexpected Luna API transport');
    }
    const payload: unknown = JSON.parse(init.body);
    if (!object(payload) || payload.model !== 'gpt-6-luna' ||
        !object(payload.text) || !object(payload.text.format) ||
        !Array.isArray(payload.input) || payload.input.length !== 2) {
      throw new TypeError('Invalid Luna structured request');
    }
    const messages = payload.input.map((entry: unknown) => {
      if (!object(entry) || (entry.role !== 'developer' && entry.role !== 'user') ||
          !Array.isArray(entry.content) || entry.content.length !== 1 ||
          !object(entry.content[0]) || entry.content[0].type !== 'input_text' ||
          typeof entry.content[0].text !== 'string') {
        throw new TypeError('Invalid Luna structured message');
      }
      return {role: entry.role, content: entry.content[0].text};
    });
    const response = await send(ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.apiKey,
        'HTTP-Referer': 'https://github.com/gycha0109-beep/MyeongHa',
        'X-Title': 'MyeongHa Official Wealth Reader',
      },
      body: JSON.stringify({
        model: ROUTED_LUNA_MODEL_ID_V1,
        messages,
        max_tokens: payload.max_output_tokens,
        stream: false,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: payload.text.format.name,
            strict: true,
            schema: payload.text.format.schema,
          },
        },
        provider: {
          allow_fallbacks: false,
          data_collection: 'deny',
          require_parameters: true,
        },
      }),
    });
    if (!response.ok) {
      return new Response(null, {status: response.status});
    }
    const result: unknown = await response.json();
    // Never fall back to an alternate provider/model or infer missing usage.
    return Response.json(translateRouterOutputV1(result));
  };
  return createOpenAiOfficialWealthLunaWriterV1({
    apiKey: config.apiKey,
    authority: config.authority,
    durable: config.durable,
    fetchImpl: adapter,
    ...(config.maxOutputTokens === undefined ? {} : {maxOutputTokens: config.maxOutputTokens}),
  });
}
