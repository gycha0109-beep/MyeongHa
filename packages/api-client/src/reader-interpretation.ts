import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';

export const READER_INTERPRETATION_PREVIEW_PATH_V1 =
  '/api/me/readings/reader-interpretation/preview' as const;
export const READER_INTERPRETATION_PREVIEW_SCHEMA_V1 =
  'myeongha-reader-interpretation-preview-http-v1' as const;

export const READER_INTERPRETATION_SAJU_DOMAINS_V1 = Object.freeze([
  'general', 'family', 'relationship', 'compatibility', 'career',
  'business', 'wealth', 'life_stage', 'question_specific',
] as const);
export type ReaderInterpretationSajuDomainV1 =
  (typeof READER_INTERPRETATION_SAJU_DOMAINS_V1)[number];

export type ReaderInterpretationSegmentKindV1 =
  | 'semantic_realization'
  | 'character_reaction'
  | 'follow_up_question'
  | 'protected_disclosure';

export interface ReaderInterpretationPreviewRequestV1 {
  readonly threadId: string;
  readonly officialReadingId: string;
}

export interface ReaderInterpretationSegmentV1 {
  readonly kind: ReaderInterpretationSegmentKindV1;
  readonly text: string;
}

interface ReaderInterpretationCommonV1 {
  readonly schemaVersion: typeof READER_INTERPRETATION_PREVIEW_SCHEMA_V1;
  readonly lifecycle: 'preview';
  readonly officialReadingId: string;
  readonly readerCharacterId: string;
  readonly domain: ReaderInterpretationSajuDomainV1;
  readonly interpretationHash: string;
}

export type ReaderInterpretationPreviewResultV1 =
  | (ReaderInterpretationCommonV1 & {
      readonly mode: 'reader_interpretation';
      readonly utterance: Readonly<{
        characterId: string;
        requestedDomain: ReaderInterpretationSajuDomainV1;
        segments: readonly ReaderInterpretationSegmentV1[];
      }>;
    })
  | (ReaderInterpretationCommonV1 & {
      readonly mode: 'protected_fallback';
      readonly fallbackReason: 'renderer_protected_fallback' | 'semantic_guard_failed';
    });

const UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH_V1 = /^sha256:v1:[0-9a-f]{64}$/u;
const DOMAINS = new Set<string>(READER_INTERPRETATION_SAJU_DOMAINS_V1);
const SEGMENTS = new Set<string>([
  'semantic_realization', 'character_reaction',
  'follow_up_question', 'protected_disclosure',
]);
const FALLBACKS = new Set<string>([
  'renderer_protected_fallback', 'semantic_guard_failed',
]);

function invalid(message: string, code = 'API_READER_SCENE_RESPONSE_INVALID'): never {
  throw new MyeongHaApiClientErrorV1('malformed_response', code, message);
}
function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid(field + ' must be an object.');
  }
  return value as Record<string, unknown>;
}
function exactKeys(data: Record<string, unknown>, keys: readonly string[], field: string) {
  if (Object.keys(data).length !== keys.length ||
    Object.keys(data).some((key) => !keys.includes(key))) {
    invalid(field + ' has an unexpected or missing field.');
  }
}
function requiredString(value: unknown, field: string, maxLength = 512): string {
  if (typeof value !== 'string') return invalid(field + ' must be a string.');
  const text = value.trim();
  if (text.length === 0 || text.length > maxLength) {
    return invalid(field + ' is outside its supported bounds.');
  }
  return text;
}
function uuid(value: unknown, field: string, request = false): string {
  const text = requiredString(value, field, 36);
  if (!UUID_V1.test(text)) {
    return invalid(field + ' must be a UUID.',
      request ? 'CLIENT_READER_SCENE_REQUEST_INVALID' : 'API_READER_SCENE_RESPONSE_INVALID');
  }
  return text;
}
function domain(value: unknown, field: string): ReaderInterpretationSajuDomainV1 {
  const result = requiredString(value, field, 64);
  if (!DOMAINS.has(result)) return invalid(field + ' is unsupported.');
  return result as ReaderInterpretationSajuDomainV1;
}

export function parseReaderInterpretationPreviewV1(
  payload: unknown,
  expectedOfficialReadingId: unknown,
): ReaderInterpretationPreviewResultV1 {
  const data = record(payload, 'Reader Scene response');
  const expectedId = uuid(expectedOfficialReadingId, 'expected official Reading');
  const baseKeys = [
    'schemaVersion', 'lifecycle', 'mode', 'officialReadingId',
    'readerCharacterId', 'domain', 'interpretationHash',
  ];
  if (data.schemaVersion !== READER_INTERPRETATION_PREVIEW_SCHEMA_V1 ||
    data.lifecycle !== 'preview') {
    return invalid('Reader Scene schema or lifecycle is unsupported.');
  }
  const officialReadingId = uuid(data.officialReadingId, 'officialReadingId');
  if (officialReadingId !== expectedId) {
    return invalid('Reader Scene official Reading authority changed.');
  }
  const readerCharacterId = requiredString(data.readerCharacterId, 'readerCharacterId');
  const resolvedDomain = domain(data.domain, 'domain');
  const interpretationHash = requiredString(data.interpretationHash, 'interpretationHash', 74);
  if (!HASH_V1.test(interpretationHash)) {
    return invalid('Reader Scene interpretation hash is malformed.');
  }
  const common = {
    schemaVersion: READER_INTERPRETATION_PREVIEW_SCHEMA_V1,
    lifecycle: 'preview' as const,
    officialReadingId, readerCharacterId,
    domain: resolvedDomain, interpretationHash,
  };
  if (data.mode === 'protected_fallback') {
    exactKeys(data, [...baseKeys, 'fallbackReason'], 'Reader Scene response');
    const fallbackReason = requiredString(data.fallbackReason, 'fallbackReason', 128);
    if (!FALLBACKS.has(fallbackReason)) return invalid('Reader fallback is unsupported.');
    return Object.freeze({
      ...common, mode: 'protected_fallback' as const,
      fallbackReason: fallbackReason as 'renderer_protected_fallback' | 'semantic_guard_failed',
    });
  }
  if (data.mode !== 'reader_interpretation') {
    return invalid('Reader Scene mode is unsupported.');
  }
  exactKeys(data, [...baseKeys, 'utterance'], 'Reader Scene response');
  const utterance = record(data.utterance, 'utterance');
  exactKeys(utterance, ['characterId', 'requestedDomain', 'segments'], 'utterance');
  const characterId = requiredString(utterance.characterId, 'utterance.characterId');
  const requestedDomain = domain(utterance.requestedDomain, 'utterance.requestedDomain');
  if (characterId !== readerCharacterId || requestedDomain !== resolvedDomain) {
    return invalid('Reader Scene utterance identity changed.');
  }
  if (!Array.isArray(utterance.segments) || utterance.segments.length === 0) {
    return invalid('Reader Scene segments must be non-empty.');
  }
  const segments = Object.freeze(utterance.segments.map((part, index) => {
    const item = record(part, 'utterance.segments[' + index + ']');
    exactKeys(item, ['kind', 'text'], 'utterance segment');
    const kind = requiredString(item.kind, 'segment.kind', 128);
    if (!SEGMENTS.has(kind)) return invalid('Reader segment kind is unsupported.');
    return Object.freeze({
      kind: kind as ReaderInterpretationSegmentKindV1,
      text: requiredString(item.text, 'segment.text', 10000),
    });
  }));
  return Object.freeze({
    ...common, mode: 'reader_interpretation' as const,
    utterance: Object.freeze({ characterId, requestedDomain, segments }),
  });
}

/**
 * A mobile/web transport boundary, NOT a public activation mechanism.
 * The production route is intentionally unavailable until the owning
 * Reader track approves and deploys the public route and gates.
 */
export async function readReaderInterpretationPreviewV1(
  client: MyeongHaApiClientV1,
  bearer: string,
  requestInput: unknown,
  options: { readonly publicRouteActivated?: boolean } = {},
): Promise<ReaderInterpretationPreviewResultV1> {
  // Do not issue a network request merely because a screen has a Reader choice.
  if (options.publicRouteActivated !== true) {
    return invalid('Public Reader Interpretation has not been activated.',
      'CLIENT_READER_SCENE_UNAVAILABLE');
  }
  const request = record(requestInput, 'Reader Scene request');
  exactKeys(request, ['threadId', 'officialReadingId'], 'Reader Scene request');
  const threadId = uuid(request.threadId, 'threadId', true);
  const officialReadingId = uuid(request.officialReadingId, 'officialReadingId', true);
  const data = await client.requestData({
    method: 'POST',
    path: READER_INTERPRETATION_PREVIEW_PATH_V1,
    bearer,
    body: Object.freeze({ threadId, officialReadingId }),
  });
  return parseReaderInterpretationPreviewV1(data, officialReadingId);
}
