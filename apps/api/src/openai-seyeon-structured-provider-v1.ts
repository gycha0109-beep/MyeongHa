import { randomUUID } from 'node:crypto';

import type {
  SeyeonStructuredProviderPortV2,
  SeyeonStructuredProviderRequestV2,
} from './seyeon-character-runtime-v2.js';

export const OPENAI_SEYEON_STRUCTURED_PROVIDER_VERSION_V1 =
  'openai-seyeon-structured-provider-v1' as const;
export const OPENAI_SEYEON_STRUCTURED_PROVIDER_KEY_V1 =
  'openai-responses' as const;
export const OPENAI_RESPONSES_DEFAULT_ORIGIN_V1 =
  'https://api.openai.com' as const;
export const OPENAI_SEYEON_STRUCTURED_PROVIDER_DEFAULT_TIMEOUT_MS_V1 =
  30_000 as const;
export const OPENAI_SEYEON_STRUCTURED_PROVIDER_MAX_TIMEOUT_MS_V1 =
  120_000 as const;

export type OpenAiSeyeonStructuredProviderFetchV1 = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export interface OpenAiSeyeonStructuredProviderConfigV1 {
  readonly apiKey: string;
  readonly model: string;
  readonly origin?: string;
  readonly timeoutMs?: number;
  /** Opt-in: the provider must enforce this on the total output, including reasoning. */
  readonly maxOutputTokens?: number;
  readonly fetchImpl?: OpenAiSeyeonStructuredProviderFetchV1;
}

export type OpenAiSeyeonStructuredProviderFailureCodeV1 =
  | 'INVALID_CONFIGURATION'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'HTTP_FAILURE'
  | 'INVALID_CONTENT_TYPE'
  | 'INVALID_RESPONSE'
  | 'MODEL_REFUSAL'
  | 'INVALID_STRUCTURED_OUTPUT';

export class OpenAiSeyeonStructuredProviderErrorV1 extends Error {
  constructor(
    readonly code: OpenAiSeyeonStructuredProviderFailureCodeV1,
    message: string,
    readonly httpStatus: number | null = null,
    readonly diagnostic: Readonly<{ reason: string; errorCode: string | null; errorType: string | null }> | null = null,
  ) {
    super(message);
    this.name = 'OpenAiSeyeonStructuredProviderErrorV1';
  }
}

/** Error bodies can reflect credentials or prompts. Emit only fixed vocabulary. */
export async function readSeyeonProviderFailureDiagnosticV1(response: Response) {
  const reader = response.body?.getReader();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('diagnostic timeout')), 2_000);
  });
  let raw = '';
  try {
    if (reader) {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const result = await Promise.race([reader.read(), deadline]);
        if (result.done) break;
        size += result.value.byteLength;
        if (size > 16_384) break;
        chunks.push(result.value);
      }
      raw = new TextDecoder().decode(Buffer.concat(chunks));
    }
  } catch {
    // Missing, oversized, or unreadable error bodies never replace HTTP_FAILURE.
  } finally {
    clearTimeout(timer!);
    void reader?.cancel().catch(() => undefined);
  }
  let error: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && isRecord(parsed.error)) error = parsed.error;
  } catch { /* No raw response is retained or emitted. */ }
  const allowed = new Set([
    'forbidden', 'permission_denied', 'access_denied', 'model_not_found',
    'model_not_allowed', 'model_not_available', 'model_access_denied',
    'customer_verification_required', 'insufficient_funds', 'quota_for_entity_exceeded',
    'invalid_request_error', 'permission_error', 'authentication_error',
    'unsupported_country_region_territory', 'free_tier_model_not_supported',
  ]);
  const safeValue = (value: unknown) => typeof value === 'string' && allowed.has(value) ? value : null;
  const message = typeof error.message === 'string' ? error.message : '';
  const reason = /free.{0,30}(?:tier|credit).{0,160}(?:model|support|available|access)|model.{0,160}free/iu.test(message)
    ? 'MODEL_FREE_TIER_RESTRICTED'
    : /customer_verification_required|payment method|verify.{0,40}(?:customer|account)|organization must be verified/iu.test(message + ' ' + String(error.code))
      ? 'CUSTOMER_VERIFICATION_REQUIRED'
      : /country|region.{0,30}(?:unsupported|not supported)/iu.test(message)
        ? 'UNSUPPORTED_COUNTRY_REGION'
        : /insufficient_funds|quota_for_entity_exceeded/iu.test(String(error.code))
          ? 'CREDIT_OR_BUDGET_EXHAUSTED'
          : /(?:access|permission).{0,80}model|model.{0,80}(?:access|permission|not allowed)/iu.test(message)
            ? 'MODEL_ACCESS_DENIED' : 'UNKNOWN';
  return Object.freeze({ reason, errorCode: safeValue(error.code), errorType: safeValue(error.type) });
}

function failConfiguration(message: string): never {
  throw new OpenAiSeyeonStructuredProviderErrorV1(
    'INVALID_CONFIGURATION',
    message,
  );
}

function requiredSecret(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 20) {
    return failConfiguration(
      'OpenAI API key must be a non-empty server credential.',
    );
  }
  return normalized;
}

function modelKey(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 128 ||
    !/^[A-Za-z0-9._:-]+(?:\/[A-Za-z0-9._:-]+)?$/u.test(normalized)
  ) {
    return failConfiguration('OpenAI model identifier is invalid.');
  }
  return normalized;
}

function responsesEndpoint(originValue: string | undefined): string {
  const raw = originValue ?? OPENAI_RESPONSES_DEFAULT_ORIGIN_V1;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return failConfiguration('OpenAI origin must be an absolute URL.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    return failConfiguration(
      'OpenAI origin must be a credential-free HTTPS origin.',
    );
  }
  return new URL('/v1/responses', url).toString();
}

function timeoutMs(value: number | undefined): number {
  const resolved =
    value ?? OPENAI_SEYEON_STRUCTURED_PROVIDER_DEFAULT_TIMEOUT_MS_V1;
  if (
    !Number.isSafeInteger(resolved) ||
    resolved < 1 ||
    resolved > OPENAI_SEYEON_STRUCTURED_PROVIDER_MAX_TIMEOUT_MS_V1
  ) {
    return failConfiguration(
      'OpenAI structured provider timeout is outside supported bounds.',
    );
  }
  return resolved;
}

/** No Production default: existing provider requests remain byte-for-byte unchanged. */
function maxOutputTokens(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 1 || value > 32_768) {
    return failConfiguration('OpenAI structured provider output token ceiling is invalid.');
  }
  return value;
}

function responseFormatName(
  request: SeyeonStructuredProviderRequestV2,
): string {
  const raw = ('myeongha_' + request.purpose + '_v2')
    .replace(/[^A-Za-z0-9_-]/gu, '_')
    .slice(0, 64);
  return raw.length === 0 ? 'myeongha_structured_v2' : raw;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractStructuredText(raw: unknown): string {
  if (!isRecord(raw)) {
    throw new OpenAiSeyeonStructuredProviderErrorV1(
      'INVALID_RESPONSE',
      'OpenAI Responses payload must be an object.',
      200,
    );
  }
  if (raw.status !== 'completed') {
    throw new OpenAiSeyeonStructuredProviderErrorV1(
      'INVALID_RESPONSE',
      'OpenAI Responses request did not complete successfully.',
      200,
    );
  }
  if (!Array.isArray(raw.output)) {
    throw new OpenAiSeyeonStructuredProviderErrorV1(
      'INVALID_RESPONSE',
      'OpenAI Responses payload is missing output items.',
      200,
    );
  }

  const texts: string[] = [];
  for (const item of raw.output) {
    if (!isRecord(item) || item.type !== 'message') continue;
    if (!Array.isArray(item.content)) {
      throw new OpenAiSeyeonStructuredProviderErrorV1(
        'INVALID_RESPONSE',
        'OpenAI message output content is invalid.',
        200,
      );
    }
    for (const part of item.content) {
      if (!isRecord(part)) continue;
      if (part.type === 'refusal') {
        throw new OpenAiSeyeonStructuredProviderErrorV1(
          'MODEL_REFUSAL',
          'OpenAI model refused the structured request.',
          200,
        );
      }
      if (part.type === 'output_text') {
        if (typeof part.text !== 'string' || part.text.trim().length === 0) {
          throw new OpenAiSeyeonStructuredProviderErrorV1(
            'INVALID_RESPONSE',
            'OpenAI structured output text is invalid.',
            200,
          );
        }
        texts.push(part.text);
      }
    }
  }

  if (texts.length !== 1) {
    throw new OpenAiSeyeonStructuredProviderErrorV1(
      'INVALID_RESPONSE',
      'OpenAI structured request must produce exactly one output_text part.',
      200,
    );
  }
  return texts[0]!;
}

/** Structured telemetry only: never emit prompts, generated text, credentials or raw API responses. */
function emitSeyeonProviderMetricV1(input: {
  readonly purpose: SeyeonStructuredProviderRequestV2['purpose'];
  readonly model: string;
  readonly startedAt: number;
  readonly outcome: 'response_received' | 'http_failure';
  readonly httpStatus: number;
  readonly payload?: unknown;
}): void {
  const usage = isRecord(input.payload) && isRecord(input.payload.usage)
    ? input.payload.usage : {};
  const tokens = (value: unknown): number | null =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value : null;
  const inputDetails = isRecord(usage.input_tokens_details)
    ? usage.input_tokens_details : {};
  const outputDetails = isRecord(usage.output_tokens_details)
    ? usage.output_tokens_details : {};
  console.info('MYEONGHA_SEYEON_PROVIDER_METRIC ' + JSON.stringify({
    schemaVersion: 'myeongha-seyeon-provider-metric-v1',
    purpose: input.purpose,
    modelKey: input.model,
    outcome: input.outcome,
    httpStatus: input.httpStatus,
    elapsedMs: Math.max(0, Math.round(performance.now() - input.startedAt)),
    inputTokens: tokens(usage.input_tokens),
    outputTokens: tokens(usage.output_tokens),
    cachedInputTokens: tokens(inputDetails.cached_tokens),
    reasoningTokens: tokens(outputDetails.reasoning_tokens),
  }));
}

export function createOpenAiSeyeonStructuredProviderV1(
  config: OpenAiSeyeonStructuredProviderConfigV1,
): SeyeonStructuredProviderPortV2 {
  const apiKey = requiredSecret(config.apiKey);
  const model = modelKey(config.model);
  const endpoint = responsesEndpoint(config.origin);
  const requestTimeoutMs = timeoutMs(config.timeoutMs);
  const requestOutputCeiling = maxOutputTokens(config.maxOutputTokens);
  const fetchImpl = config.fetchImpl ?? fetch;

  return Object.freeze({
    providerKey: OPENAI_SEYEON_STRUCTURED_PROVIDER_KEY_V1,
    modelKey: model,

    async generate(
      request: SeyeonStructuredProviderRequestV2,
    ): Promise<unknown> {
      const startedAt = performance.now();
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, requestTimeoutMs);

      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            authorization: 'Bearer ' + apiKey,
            'content-type': 'application/json',
            'x-client-request-id': randomUUID(),
          },
          body: JSON.stringify({
            model,
            ...(endpoint === 'https://ai-gateway.vercel.sh/v1/responses' && model.startsWith('openai/')
              ? { providerOptions: { gateway: { only: ['openai'] } } }
              : {}),
            store: false,
            ...(requestOutputCeiling === undefined ? {} : { max_output_tokens: requestOutputCeiling }),
            instructions: request.instructions,
            input: [
              {
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: JSON.stringify(request.input),
                  },
                ],
              },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: responseFormatName(request),
                strict: true,
                schema: request.responseSchema,
              },
            },
          }),
          redirect: 'error',
          signal: controller.signal,
        });
      } catch {
        if (timedOut) {
          throw new OpenAiSeyeonStructuredProviderErrorV1(
            'TIMEOUT',
            'OpenAI structured request timed out.',
          );
        }
        throw new OpenAiSeyeonStructuredProviderErrorV1(
          'NETWORK_FAILURE',
          'OpenAI structured request failed before a response was accepted.',
        );
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const diagnostic = await readSeyeonProviderFailureDiagnosticV1(response);
        emitSeyeonProviderMetricV1({
          purpose: request.purpose, model, startedAt,
          outcome: 'http_failure', httpStatus: response.status,
        });
        throw new OpenAiSeyeonStructuredProviderErrorV1(
          'HTTP_FAILURE',
          'OpenAI structured request returned a non-success status.',
          response.status,
          diagnostic,
        );
      }

      const contentType = response.headers.get('content-type');
      if (
        contentType === null ||
        !/^application\/json(?:\s*;|$)/iu.test(contentType.trim())
      ) {
        try {
          void response.body?.cancel();
        } catch {
          // best-effort body cancellation only
        }
        throw new OpenAiSeyeonStructuredProviderErrorV1(
          'INVALID_CONTENT_TYPE',
          'OpenAI structured request returned a non-JSON success response.',
          response.status,
        );
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new OpenAiSeyeonStructuredProviderErrorV1(
          'INVALID_RESPONSE',
          'OpenAI structured response body is not valid JSON.',
          response.status,
        );
      }

      emitSeyeonProviderMetricV1({
        purpose: request.purpose, model, startedAt,
        outcome: 'response_received', httpStatus: response.status, payload: raw,
      });
      const text = extractStructuredText(raw);
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new OpenAiSeyeonStructuredProviderErrorV1(
          'INVALID_STRUCTURED_OUTPUT',
          'OpenAI structured output text is not valid JSON.',
          response.status,
        );
      }
    },
  });
}
