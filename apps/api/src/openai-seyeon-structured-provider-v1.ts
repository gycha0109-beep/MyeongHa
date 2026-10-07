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
  ) {
    super(message);
    this.name = 'OpenAiSeyeonStructuredProviderErrorV1';
  }
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

export function createOpenAiSeyeonStructuredProviderV1(
  config: OpenAiSeyeonStructuredProviderConfigV1,
): SeyeonStructuredProviderPortV2 {
  const apiKey = requiredSecret(config.apiKey);
  const model = modelKey(config.model);
  const endpoint = responsesEndpoint(config.origin);
  const requestTimeoutMs = timeoutMs(config.timeoutMs);
  const fetchImpl = config.fetchImpl ?? fetch;

  return Object.freeze({
    providerKey: OPENAI_SEYEON_STRUCTURED_PROVIDER_KEY_V1,
    modelKey: model,

    async generate(
      request: SeyeonStructuredProviderRequestV2,
    ): Promise<unknown> {
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
            store: false,
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
        try {
          void response.body?.cancel();
        } catch {
          // best-effort body cancellation only
        }
        throw new OpenAiSeyeonStructuredProviderErrorV1(
          'HTTP_FAILURE',
          'OpenAI structured request returned a non-success status.',
          response.status,
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
