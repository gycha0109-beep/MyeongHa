import { MyeongHaApiClientErrorV1 } from './http.js';

export const PRODUCT_READING_RESPONSE_VERSION_V2 =
  'myeonghwa-product-reading-response-v2' as const;

export type ProductReadingStateV2 =
  | 'delivered'
  | 'delivered_with_fallback'
  | 'clarification_required'
  | 'unsupported_request'
  | 'invalid_request'
  | 'partial_evidence'
  | 'insufficient_evidence'
  | 'unsupported_intent'
  | 'temporarily_unavailable';

export type ProductReadingMessageCodeV2 =
  | 'READING_DELIVERED'
  | 'READING_DELIVERED_WITH_GROUNDED_FALLBACK'
  | 'READING_REQUEST_CLARIFICATION_REQUIRED'
  | 'READING_REQUEST_NOT_SUPPORTED'
  | 'READING_REQUEST_INVALID'
  | 'READING_EVIDENCE_PARTIAL'
  | 'READING_EVIDENCE_INSUFFICIENT'
  | 'READING_INTENT_NOT_AVAILABLE'
  | 'READING_TEMPORARILY_UNAVAILABLE';

export type ProductReadingRequiredActionV2 =
  | 'none'
  | 'clarify_request'
  | 'revise_request'
  | 'provide_required_context'
  | 'try_again_later';

export interface ProductReadingDisplayStepV2 {
  readonly title: string;
  readonly primary: string;
  readonly supporting: readonly string[];
  readonly structure: readonly string[];
}

export type ProductReadingDisplayResultV2 =
  | Readonly<{
      kind: 'delivered';
      responseVersion: typeof PRODUCT_READING_RESPONSE_VERSION_V2;
      responseState: 'delivered' | 'delivered_with_fallback';
      readingId: string;
      steps: readonly ProductReadingDisplayStepV2[];
      notices: readonly string[];
    }>
  | Readonly<{
      kind: 'not_delivered';
      responseVersion: typeof PRODUCT_READING_RESPONSE_VERSION_V2;
      responseState: Exclude<
        ProductReadingStateV2,
        'delivered' | 'delivered_with_fallback'
      >;
      messageCode: ProductReadingMessageCodeV2;
      requiredAction: ProductReadingRequiredActionV2;
    }>;

const PREVIEW_NOTICE_SECTION_TITLE_V1 = '프리뷰 안내' as const;
const STRUCTURE_PREFIX_V1 = '근거 구조:' as const;
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
  ProductReadingStateV2,
  Readonly<{
    messageCode: ProductReadingMessageCodeV2;
    requiredAction: ProductReadingRequiredActionV2;
  }>
>>);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformed(errorCode: string, message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    errorCode,
    message,
  );
}

function requireString(
  errorCode: string,
  path: string,
  value: unknown,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return malformed(errorCode, `Product Reading ${path} is invalid.`);
  }
  return value.trim();
}

function requireStringArray(
  errorCode: string,
  path: string,
  value: unknown,
): readonly string[] {
  if (!Array.isArray(value)) {
    return malformed(errorCode, `Product Reading ${path} is invalid.`);
  }
  return Object.freeze(
    value.map((item, index) =>
      requireString(errorCode, `${path}[${String(index)}]`, item),
    ),
  );
}

function pairTexts(
  errorCode: string,
  path: string,
  value: unknown,
  valueField: 'text' | 'value',
): readonly string[] {
  if (!Array.isArray(value)) {
    return malformed(errorCode, `Product Reading ${path} is invalid.`);
  }
  return Object.freeze(value.map((item, index) => {
    if (!isRecord(item)) {
      return malformed(
        errorCode,
        `Product Reading ${path}[${String(index)}] is invalid.`,
      );
    }
    const label = requireString(
      errorCode,
      `${path}[${String(index)}].label`,
      item.label,
    );
    const text = requireString(
      errorCode,
      `${path}[${String(index)}].${valueField}`,
      item[valueField],
    );
    return `${label}: ${text}`;
  }));
}

function blockTexts(
  errorCode: string,
  path: string,
  value: unknown,
): readonly string[] {
  if (!isRecord(value)) {
    return malformed(errorCode, `Product Reading ${path} is invalid.`);
  }
  const type = requireString(errorCode, `${path}.type`, value.type);

  if (type === 'paragraph' || type === 'source_hint') {
    return Object.freeze([
      requireString(errorCode, `${path}.text`, value.text),
    ]);
  }
  if (type === 'key_points') {
    return requireStringArray(errorCode, `${path}.items`, value.items);
  }
  if (type === 'comparison') {
    requireString(errorCode, `${path}.title`, value.title);
    return pairTexts(
      errorCode,
      `${path}.perspectives`,
      value.perspectives,
      'text',
    );
  }
  if (type === 'ambiguity') {
    const summary = requireString(errorCode, `${path}.summary`, value.summary);
    return Object.freeze([
      summary,
      ...pairTexts(
        errorCode,
        `${path}.scenarios`,
        value.scenarios,
        'text',
      ),
    ]);
  }
  if (type === 'timeline') {
    return pairTexts(errorCode, `${path}.entries`, value.entries, 'text');
  }
  if (type === 'fact_table') {
    return pairTexts(errorCode, `${path}.rows`, value.rows, 'value');
  }
  return malformed(errorCode, `Product Reading ${path}.type is unsupported.`);
}

function projectDeliveredReading(
  errorCode: string,
  responseState: 'delivered' | 'delivered_with_fallback',
  value: unknown,
): Extract<ProductReadingDisplayResultV2, { kind: 'delivered' }> {
  if (!isRecord(value)) return malformed(errorCode, 'Product Reading reading is invalid.');
  const readingId = requireString(errorCode, 'reading.readingId', value.readingId);
  if (!Array.isArray(value.sections)) {
    return malformed(errorCode, 'Product Reading reading.sections is invalid.');
  }
  if (!Array.isArray(value.disclosures)) {
    return malformed(errorCode, 'Product Reading reading.disclosures is invalid.');
  }

  const notices: string[] = [];
  const steps: ProductReadingDisplayStepV2[] = [];

  value.sections.forEach((rawSection, sectionIndex) => {
    const path = `reading.sections[${String(sectionIndex)}]`;
    if (!isRecord(rawSection)) {
      return malformed(errorCode, `Product Reading ${path} is invalid.`);
    }
    const sectionType = requireString(
      errorCode,
      `${path}.sectionType`,
      rawSection.sectionType,
    );
    if (!supportedSectionTypes.has(sectionType)) {
      return malformed(errorCode, `Product Reading ${path}.sectionType is invalid.`);
    }

    const sectionState = requireString(
      errorCode,
      `${path}.state`,
      rawSection.state,
    );
    if (
      sectionState !== 'complete' &&
      sectionState !== 'partial' &&
      sectionState !== 'unavailable'
    ) {
      return malformed(errorCode, `Product Reading ${path}.state is invalid.`);
    }

    const title = requireString(errorCode, `${path}.title`, rawSection.title);
    if (!Array.isArray(rawSection.blocks)) {
      return malformed(errorCode, `Product Reading ${path}.blocks is invalid.`);
    }

    const texts = rawSection.blocks.flatMap((block, blockIndex) =>
      blockTexts(
        errorCode,
        `${path}.blocks[${String(blockIndex)}]`,
        block,
      ),
    );

    if (sectionState === 'unavailable' || texts.length === 0) return;
    if (title === PREVIEW_NOTICE_SECTION_TITLE_V1) {
      notices.push(...texts);
      return;
    }

    const structure = texts.filter((text) =>
      text.startsWith(STRUCTURE_PREFIX_V1),
    );
    const interpretation = texts.filter((text) =>
      !text.startsWith(STRUCTURE_PREFIX_V1),
    );
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
    if (!isRecord(rawDisclosure)) {
      return malformed(errorCode, `Product Reading ${path} is invalid.`);
    }
    const type = requireString(errorCode, `${path}.type`, rawDisclosure.type);
    if (
      type !== 'calculation_ambiguity' &&
      type !== 'methodology_difference' &&
      type !== 'insufficient_evidence' &&
      type !== 'scope_limitation'
    ) {
      return malformed(errorCode, `Product Reading ${path}.type is invalid.`);
    }
    const text = requireString(errorCode, `${path}.text`, rawDisclosure.text);
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
    return malformed(
      errorCode,
      'Product Reading delivered response has no displayable governed sections.',
    );
  }

  return Object.freeze({
    kind: 'delivered' as const,
    responseVersion: PRODUCT_READING_RESPONSE_VERSION_V2,
    responseState,
    readingId,
    steps: Object.freeze(steps),
    notices: Object.freeze(notices),
  });
}

export function projectProductReadingResponseV2(
  value: unknown,
  errorCode = 'API_PRODUCT_READING_RESPONSE_INVALID',
): ProductReadingDisplayResultV2 {
  if (!isRecord(value)) {
    return malformed(errorCode, 'Product Reading response is invalid.');
  }
  if (value.responseVersion !== PRODUCT_READING_RESPONSE_VERSION_V2) {
    return malformed(errorCode, 'Product Reading response version is invalid.');
  }
  if (
    typeof value.responseId !== 'string' ||
    !/^reading_response_[0-9a-f]{24}$/u.test(value.responseId)
  ) {
    return malformed(errorCode, 'Product Reading response identity is invalid.');
  }

  const responseState = requireString(errorCode, 'response.state', value.state);
  if (!Object.prototype.hasOwnProperty.call(stateContract, responseState)) {
    return malformed(errorCode, 'Product Reading response state is invalid.');
  }
  const typedState = responseState as ProductReadingStateV2;
  const contract = stateContract[typedState];

  if (
    value.messageCode !== contract.messageCode ||
    value.requiredAction !== contract.requiredAction
  ) {
    return malformed(
      errorCode,
      'Product Reading response state contract is inconsistent.',
    );
  }

  if (typedState === 'delivered' || typedState === 'delivered_with_fallback') {
    if (value.reading === undefined) {
      return malformed(errorCode, 'Product Reading delivered response omitted reading.');
    }
    return projectDeliveredReading(errorCode, typedState, value.reading);
  }

  if (value.reading !== undefined) {
    return malformed(
      errorCode,
      'Product Reading non-delivered response must not include reading.',
    );
  }

  return Object.freeze({
    kind: 'not_delivered' as const,
    responseVersion: PRODUCT_READING_RESPONSE_VERSION_V2,
    responseState: typedState,
    messageCode: contract.messageCode,
    requiredAction: contract.requiredAction,
  });
}
