import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';

export const SAJU_PREVIEW_READING_TEXTS_V1 = Object.freeze([
  '전체 사주',
  '직업운',
  '재물운',
  '연애운',
  '사업운',
] as const);

export type SajuPreviewReadingTextV1 =
  (typeof SAJU_PREVIEW_READING_TEXTS_V1)[number];

export type SajuPreviewProductStateV1 =
  | 'delivered'
  | 'delivered_with_fallback'
  | 'clarification_required'
  | 'unsupported_request'
  | 'invalid_request'
  | 'partial_evidence'
  | 'insufficient_evidence'
  | 'unsupported_intent'
  | 'temporarily_unavailable';

export type SajuPreviewMessageCodeV1 =
  | 'READING_DELIVERED'
  | 'READING_DELIVERED_WITH_GROUNDED_FALLBACK'
  | 'READING_REQUEST_CLARIFICATION_REQUIRED'
  | 'READING_REQUEST_NOT_SUPPORTED'
  | 'READING_REQUEST_INVALID'
  | 'READING_EVIDENCE_PARTIAL'
  | 'READING_EVIDENCE_INSUFFICIENT'
  | 'READING_INTENT_NOT_AVAILABLE'
  | 'READING_TEMPORARILY_UNAVAILABLE';

export type SajuPreviewRequiredActionV1 =
  | 'none'
  | 'clarify_request'
  | 'revise_request'
  | 'provide_required_context'
  | 'try_again_later';

export interface SajuPreviewReadingStepV1 {
  readonly title: string;
  readonly primary: string;
  readonly supporting: readonly string[];
  readonly structure: readonly string[];
}

export type SajuPreviewReadingResultV1 =
  | Readonly<{
      kind: 'delivered';
      readingText: SajuPreviewReadingTextV1;
      responseState: 'delivered' | 'delivered_with_fallback';
      readingId: string;
      steps: readonly SajuPreviewReadingStepV1[];
      notices: readonly string[];
    }>
  | Readonly<{
      kind: 'not_delivered';
      readingText: SajuPreviewReadingTextV1;
      responseState: Exclude<
        SajuPreviewProductStateV1,
        'delivered' | 'delivered_with_fallback'
      >;
      messageCode: SajuPreviewMessageCodeV1;
      requiredAction: SajuPreviewRequiredActionV1;
    }>;

const SAJU_PRODUCT_READING_RESPONSE_VERSION_V1 =
  'myeonghwa-product-reading-response-v2' as const;
const PREVIEW_NOTICE_SECTION_TITLE_V1 = '프리뷰 안내' as const;
const STRUCTURE_PREFIX_V1 = '근거 구조:' as const;
const supportedReadingTexts = new Set<string>(SAJU_PREVIEW_READING_TEXTS_V1);
const supportedSectionTypes = new Set<string>([
  'overview',
  'structure',
  'personality',
  'career',
  'wealth',
  'relationship',
  'health_tendency',
  'timing',
  'compatibility',
  'custom',
]);

const stateContract = Object.freeze({
  delivered: Object.freeze({
    messageCode: 'READING_DELIVERED',
    requiredAction: 'none',
  }),
  delivered_with_fallback: Object.freeze({
    messageCode: 'READING_DELIVERED_WITH_GROUNDED_FALLBACK',
    requiredAction: 'none',
  }),
  clarification_required: Object.freeze({
    messageCode: 'READING_REQUEST_CLARIFICATION_REQUIRED',
    requiredAction: 'clarify_request',
  }),
  unsupported_request: Object.freeze({
    messageCode: 'READING_REQUEST_NOT_SUPPORTED',
    requiredAction: 'revise_request',
  }),
  invalid_request: Object.freeze({
    messageCode: 'READING_REQUEST_INVALID',
    requiredAction: 'provide_required_context',
  }),
  partial_evidence: Object.freeze({
    messageCode: 'READING_EVIDENCE_PARTIAL',
    requiredAction: 'none',
  }),
  insufficient_evidence: Object.freeze({
    messageCode: 'READING_EVIDENCE_INSUFFICIENT',
    requiredAction: 'none',
  }),
  unsupported_intent: Object.freeze({
    messageCode: 'READING_INTENT_NOT_AVAILABLE',
    requiredAction: 'revise_request',
  }),
  temporarily_unavailable: Object.freeze({
    messageCode: 'READING_TEMPORARILY_UNAVAILABLE',
    requiredAction: 'try_again_later',
  }),
} as const satisfies Readonly<Record<
  SajuPreviewProductStateV1,
  Readonly<{
    messageCode: SajuPreviewMessageCodeV1;
    requiredAction: SajuPreviewRequiredActionV1;
  }>
>>);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformed(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'API_SAJU_PREVIEW_RESPONSE_INVALID',
    message,
  );
}

function clientInvalid(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'CLIENT_SAJU_PREVIEW_READING_INVALID',
    message,
  );
}

function requireString(path: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return malformed(`Saju Preview ${path} is invalid.`);
  }
  return value.trim();
}

function requireStringArray(path: string, value: unknown): readonly string[] {
  if (!Array.isArray(value)) return malformed(`Saju Preview ${path} is invalid.`);
  return Object.freeze(
    value.map((item, index) => requireString(`${path}[${String(index)}]`, item)),
  );
}

export function parseSajuPreviewReadingTextV1(
  input: unknown,
): SajuPreviewReadingTextV1 {
  if (typeof input !== 'string') {
    return clientInvalid('Saju Preview readingText must be an approved string.');
  }
  const normalized = input.trim();
  if (!supportedReadingTexts.has(normalized)) {
    return clientInvalid('Saju Preview readingText is outside the approved Preview set.');
  }
  return normalized as SajuPreviewReadingTextV1;
}

function pairTexts(
  path: string,
  value: unknown,
  valueField: 'text' | 'value',
): readonly string[] {
  if (!Array.isArray(value)) return malformed(`Saju Preview ${path} is invalid.`);
  return Object.freeze(value.map((item, index) => {
    if (!isRecord(item)) {
      return malformed(`Saju Preview ${path}[${String(index)}] is invalid.`);
    }
    const label = requireString(`${path}[${String(index)}].label`, item.label);
    const text = requireString(
      `${path}[${String(index)}].${valueField}`,
      item[valueField],
    );
    return `${label}: ${text}`;
  }));
}

function blockTexts(path: string, value: unknown): readonly string[] {
  if (!isRecord(value)) return malformed(`Saju Preview ${path} is invalid.`);
  const type = requireString(`${path}.type`, value.type);

  if (type === 'paragraph' || type === 'source_hint') {
    return Object.freeze([requireString(`${path}.text`, value.text)]);
  }
  if (type === 'key_points') {
    return requireStringArray(`${path}.items`, value.items);
  }
  if (type === 'comparison') {
    requireString(`${path}.title`, value.title);
    return pairTexts(`${path}.perspectives`, value.perspectives, 'text');
  }
  if (type === 'ambiguity') {
    const summary = requireString(`${path}.summary`, value.summary);
    return Object.freeze([
      summary,
      ...pairTexts(`${path}.scenarios`, value.scenarios, 'text'),
    ]);
  }
  if (type === 'timeline') {
    return pairTexts(`${path}.entries`, value.entries, 'text');
  }
  if (type === 'fact_table') {
    return pairTexts(`${path}.rows`, value.rows, 'value');
  }
  return malformed(`Saju Preview ${path}.type is unsupported.`);
}

function parseDeliveredReading(
  readingText: SajuPreviewReadingTextV1,
  responseState: 'delivered' | 'delivered_with_fallback',
  value: unknown,
): Extract<SajuPreviewReadingResultV1, { kind: 'delivered' }> {
  if (!isRecord(value)) return malformed('reading is invalid.');
  const readingId = requireString('reading.readingId', value.readingId);
  if (!Array.isArray(value.sections)) return malformed('reading.sections is invalid.');
  if (!Array.isArray(value.disclosures)) return malformed('reading.disclosures is invalid.');

  const notices: string[] = [];
  const steps: SajuPreviewReadingStepV1[] = [];

  value.sections.forEach((rawSection, sectionIndex) => {
    const path = `reading.sections[${String(sectionIndex)}]`;
    if (!isRecord(rawSection)) return malformed(`${path} is invalid.`);
    const sectionType = requireString(`${path}.sectionType`, rawSection.sectionType);
    if (!supportedSectionTypes.has(sectionType)) {
      return malformed(`${path}.sectionType is invalid.`);
    }
    const sectionState = requireString(`${path}.state`, rawSection.state);
    if (
      sectionState !== 'complete' &&
      sectionState !== 'partial' &&
      sectionState !== 'unavailable'
    ) {
      return malformed(`${path}.state is invalid.`);
    }
    const title = requireString(`${path}.title`, rawSection.title);
    if (!Array.isArray(rawSection.blocks)) {
      return malformed(`${path}.blocks is invalid.`);
    }
    const texts = rawSection.blocks.flatMap((block, blockIndex) =>
      blockTexts(`${path}.blocks[${String(blockIndex)}]`, block),
    );

    if (sectionState === 'unavailable' || texts.length === 0) return;
    if (title === PREVIEW_NOTICE_SECTION_TITLE_V1) {
      notices.push(...texts);
      return;
    }

    const structure = texts.filter((text) => text.startsWith(STRUCTURE_PREFIX_V1));
    const interpretation = texts.filter((text) => !text.startsWith(STRUCTURE_PREFIX_V1));
    if (interpretation.length === 0) return;

    steps.push(Object.freeze({
      title,
      primary: interpretation[0]!,
      supporting: Object.freeze(interpretation.slice(1)),
      structure: Object.freeze(structure),
    }));
  });

  value.disclosures.forEach((rawDisclosure, disclosureIndex) => {
    const path = `reading.disclosures[${String(disclosureIndex)}]`;
    if (!isRecord(rawDisclosure)) return malformed(`${path} is invalid.`);
    const type = requireString(`${path}.type`, rawDisclosure.type);
    if (
      type !== 'calculation_ambiguity' &&
      type !== 'methodology_difference' &&
      type !== 'insufficient_evidence' &&
      type !== 'scope_limitation'
    ) {
      return malformed(`${path}.type is invalid.`);
    }
    const text = requireString(`${path}.text`, rawDisclosure.text);
    if (type === 'scope_limitation' || steps.length === 0) {
      notices.push(text);
    } else {
      const first = steps[0]!;
      steps[0] = Object.freeze({
        ...first,
        supporting: Object.freeze([...first.supporting, text]),
      });
    }
  });

  if (steps.length === 0) {
    return malformed('delivered reading has no displayable governed sections.');
  }

  return Object.freeze({
    kind: 'delivered' as const,
    readingText,
    responseState,
    readingId,
    steps: Object.freeze(steps),
    notices: Object.freeze(notices),
  });
}

function parsePreviewResponse(
  readingText: SajuPreviewReadingTextV1,
  data: unknown,
): SajuPreviewReadingResultV1 {
  if (!isRecord(data) || data.lifecycle !== 'preview' || !isRecord(data.reading)) {
    return malformed('response envelope is invalid.');
  }

  const response = data.reading;
  if (response.responseVersion !== SAJU_PRODUCT_READING_RESPONSE_VERSION_V1) {
    return malformed('response version is invalid.');
  }
  if (
    typeof response.responseId !== 'string' ||
    !/^reading_response_[0-9a-f]{24}$/u.test(response.responseId)
  ) {
    return malformed('response identity is invalid.');
  }

  const responseState = requireString('response state', response.state);
  if (!Object.prototype.hasOwnProperty.call(stateContract, responseState)) {
    return malformed('response state is invalid.');
  }
  const typedState = responseState as SajuPreviewProductStateV1;
  const contract = stateContract[typedState];

  if (
    response.messageCode !== contract.messageCode ||
    response.requiredAction !== contract.requiredAction
  ) {
    return malformed('response state contract is inconsistent.');
  }

  if (typedState === 'delivered' || typedState === 'delivered_with_fallback') {
    if (response.reading === undefined) {
      return malformed('delivered response omitted reading.');
    }
    return parseDeliveredReading(readingText, typedState, response.reading);
  }

  if (response.reading !== undefined) {
    return malformed('non-delivered response must not include reading.');
  }

  return Object.freeze({
    kind: 'not_delivered' as const,
    readingText,
    responseState: typedState,
    messageCode: contract.messageCode,
    requiredAction: contract.requiredAction,
  });
}

export async function readCurrentSajuPreviewReadingV1(
  client: MyeongHaApiClientV1,
  bearer: string,
  readingTextInput: unknown,
): Promise<SajuPreviewReadingResultV1> {
  const readingText = parseSajuPreviewReadingTextV1(readingTextInput);
  const data = await client.requestData({
    method: 'POST',
    path: '/api/me/saju/preview-reading',
    bearer,
    body: Object.freeze({ readingText }),
  });
  return parsePreviewResponse(readingText, data);
}
