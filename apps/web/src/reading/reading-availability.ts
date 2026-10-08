/**
 * Presentation-only mirror of the currently admitted Web Saju preview routes.
 * This does not grant a Product, Reader, entitlement, or successful delivery.
 * Keep aligned with reading-character.js PREVIEW_READING_TEXTS and route resolver.
 */
export type ReadingAvailabilityKindV1 = 'preview' | 'input_pending' | 'unavailable';

export interface ReadingAvailabilityV1 {
  readonly kind: ReadingAvailabilityKindV1;
  readonly label: string;
  readonly description: string;
}

const PREVIEW = Object.freeze({
  kind: 'preview' as const,
  label: '프리뷰 확인',
  description: '출생정보와 현재 세션이 확인되면 검증된 프리뷰를 요청할 수 있습니다.',
});
const INPUT_PENDING = Object.freeze({
  kind: 'input_pending' as const,
  label: '추가 입력 준비 중',
  description: '필요한 입력과 실행 경로가 아직 연결되지 않았습니다.',
});
const UNAVAILABLE = Object.freeze({
  kind: 'unavailable' as const,
  label: '정식 읽기 준비 중',
  description: '해당 주제는 아직 승인된 웹 프리뷰로 제공되지 않습니다.',
});

const PREVIEW_ROUTES = new Set([
  'reading-detail.html?topic=temperament&scope=original',
  'reading-detail.html?topic=career',
  'reading-detail.html?topic=money',
  'reading-detail.html?topic=love',
  'reading-detail.html?topic=business',
]);
const INPUT_PENDING_ROUTES = new Set([
  'reading-detail.html?topic=family',
  'reading-detail.html?topic=compatibility',
  'reading-detail.html?topic=question-specific',
]);

export function resolveReadingAvailabilityV1(href: string): ReadingAvailabilityV1 {
  if (PREVIEW_ROUTES.has(href)) return PREVIEW;
  if (INPUT_PENDING_ROUTES.has(href)) return INPUT_PENDING;
  return UNAVAILABLE;
}
