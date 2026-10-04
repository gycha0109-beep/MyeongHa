import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';
import {
  projectProductReadingResponseV2,
  type ProductReadingDisplayStepV2,
  type ProductReadingMessageCodeV2,
  type ProductReadingRequiredActionV2,
  type ProductReadingStateV2,
} from './product-reading-display.js';

export const SAJU_PREVIEW_READING_TEXTS_V1 = Object.freeze([
  '전체 사주',
  '직업운',
  '재물운',
  '연애운',
  '사업운',
] as const);

export type SajuPreviewReadingTextV1 =
  (typeof SAJU_PREVIEW_READING_TEXTS_V1)[number];

export type SajuPreviewProductStateV1 = ProductReadingStateV2;
export type SajuPreviewMessageCodeV1 = ProductReadingMessageCodeV2;
export type SajuPreviewRequiredActionV1 = ProductReadingRequiredActionV2;
export type SajuPreviewReadingStepV1 = ProductReadingDisplayStepV2;

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

const supportedReadingTexts = new Set<string>(SAJU_PREVIEW_READING_TEXTS_V1);

function clientInvalid(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'CLIENT_SAJU_PREVIEW_READING_INVALID',
    message,
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

  if (
    typeof data !== 'object' ||
    data === null ||
    Array.isArray(data) ||
    (data as Record<string, unknown>).lifecycle !== 'preview'
  ) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'API_SAJU_PREVIEW_RESPONSE_INVALID',
      'Saju Preview response envelope is invalid.',
    );
  }

  const reading = (data as Record<string, unknown>).reading;
  const display = projectProductReadingResponseV2(
    reading,
    'API_SAJU_PREVIEW_RESPONSE_INVALID',
  );
  if (display.kind === 'delivered') {
    return Object.freeze({
      kind: 'delivered' as const,
      readingText,
      responseState: display.responseState,
      readingId: display.readingId,
      steps: display.steps,
      notices: display.notices,
    });
  }
  return Object.freeze({
    kind: 'not_delivered' as const,
    readingText,
    responseState: display.responseState,
    messageCode: display.messageCode,
    requiredAction: display.requiredAction,
  });
}
