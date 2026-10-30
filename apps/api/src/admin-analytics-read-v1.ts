import type { AdminListFiltersV1, AdminReadResultV1 } from './admin-read-contract-v1.js';

// Exact baseline of ANALYTICS_EXPERIMENT_SPEC.md §3. This is a consumer
// registry, not approval to emit events or to provision an analytics store.
export const ADMIN_ANALYTICS_EVENT_REGISTRY_V1 = Object.freeze([
  'LANDING_VIEWED', 'ENTERED_HALL', 'CHARACTER_SELECTED',
  'BIRTH_RECORD_STARTED', 'BIRTH_RECORD_COMPLETED', 'FIRST_READING_DELIVERED',
  'MEMORY_PROPOSED', 'MEMORY_ACCEPTED', 'RELATIONSHIP_STAGE_CHANGED',
  'READING_PURCHASED', 'RETURN_PUSH_OPENED',
] as const);

export function isRegisteredAdminAnalyticsEventV1(value: unknown): boolean {
  return typeof value === 'string' && ADMIN_ANALYTICS_EVENT_REGISTRY_V1.some(name => name === value);
}

const METRICS = [
  { metricKey: 'valid_visitors', label: '상품 상세 유효 방문자', eventName: null,
    definition: '선택한 동일 UTC 기간·캠페인에서 유효 방문 조건을 만족한 고유 분석 참조 수. LANDING_VIEWED는 상품 상세 유효 방문의 대체 근거가 아님.',
    numeratorDefinition: '기간 내 유효 방문 고유 참조', denominatorDefinition: '해당 없음', unit: '명' },
  { metricKey: 'birth_completed', label: '명식 입력 완료', eventName: 'BIRTH_RECORD_COMPLETED',
    definition: '동일 방문 코호트에서 Birth 기록 완료가 확인된 고유 분석 참조 수. 원문 출생정보는 분석 대상 아님.',
    numeratorDefinition: '방문 코호트 중 입력 완료 고유 참조', denominatorDefinition: '상품 상세 유효 방문자', unit: '명' },
  { metricKey: 'checkout_attempts', label: '결제 시도', eventName: null,
    definition: '동일 방문 코호트에서 결제 시도가 확인된 고유 참조 수. 버튼 클릭을 구매 완료로 간주하지 않음.',
    numeratorDefinition: '방문 코호트 중 결제 시도 고유 참조', denominatorDefinition: '상품 상세 유효 방문자', unit: '명' },
  { metricKey: 'verified_purchasers', label: '서버 검증 구매자', eventName: 'READING_PURCHASED',
    definition: '동일 방문 코호트 중 서버 검증 영수증·권한 commit과 결속된 유료 구매 고유 참조 수. 영수증 건수·체험단을 구매자 수로 대체하지 않음.',
    numeratorDefinition: '기간 내 검증 유료 구매 고유 참조', denominatorDefinition: '상품 상세 유효 방문자', unit: '명' },
  { metricKey: 'reading_delivered', label: '첫 Reading 전달', eventName: 'FIRST_READING_DELIVERED',
    definition: '서버 전달 근거가 있는 고유 참조 수. 전달은 사용자의 결과 열람과 다른 단계.',
    numeratorDefinition: '구매 코호트 중 서버 전달 고유 참조', denominatorDefinition: '서버 검증 구매자', unit: '명' },
  { metricKey: 'result_views', label: '결과 열람', eventName: null,
    definition: '동일 구매 코호트에서 결과 열람이 관측된 고유 참조 수. 전달 이벤트를 열람으로 추정하지 않음.',
    numeratorDefinition: '구매 코호트 중 결과 열람 고유 참조', denominatorDefinition: '서버 검증 구매자', unit: '명' },
  { metricKey: 'purchase_conversion', label: '구매 전환율', eventName: 'READING_PURCHASED',
    definition: '동일 UTC 기간·유효 방문 코호트의 검증 유료 구매 고유 참조 / 유효 방문 고유 참조 × 100. 방문 100명 미만은 목표 기준 표본 부족.',
    numeratorDefinition: '서버 검증 구매자', denominatorDefinition: '상품 상세 유효 방문자', unit: '%' },
  { metricKey: 'satisfaction', label: '구매 만족도', eventName: null,
    definition: '동일 구매 코호트의 유효한 1~5점 응답 합 / 유효 응답 수. 응답자 수와 구매자 대비 응답률을 별도로 표시해야 함.',
    numeratorDefinition: '유효 점수 합', denominatorDefinition: '유효 구매 후 평가 응답 수', unit: '/5' },
  { metricKey: 'refund_complaint_rate', label: '환불·중대 불만 비율', eventName: null,
    definition: '동일 구매 코호트에서 제공자 환불 완료 또는 승인된 중대 불만 분류가 확인된 구매자 합집합 / 유료 구매자 × 100. 중복 계수 금지; revoked 영수증은 환불 완료의 대체값 아님.',
    numeratorDefinition: '환불 완료 또는 중대 불만 구매자 합집합', denominatorDefinition: '동일 기간·코호트 유료 구매자', unit: '%' },
  { metricKey: 'paid_purchasers_phase2', label: '2차 유료 구매자', eventName: 'READING_PURCHASED',
    definition: '명시적으로 정한 2차 UTC 기간의 검증 유료 구매 고유 참조 수. 체험단·무료 지급과 분리.',
    numeratorDefinition: '2차 기간 검증 유료 구매 고유 참조', denominatorDefinition: '해당 없음', unit: '명' },
  { metricKey: 'campaign_attribution', label: '유입 채널·캠페인', eventName: null,
    definition: '승인된 비식별 source/medium/campaign 근거만 사용. 근거 없는 유입은 unknown; 임의로 직접/검색/소셜로 분류하지 않음.',
    numeratorDefinition: '승인된 채널 귀속 고유 방문자', denominatorDefinition: '동일 기간 유효 방문자', unit: '명' },
] as const;

/** No tracking, identity joins, data writes or made-up measurements. */
export function readAdminAnalyticsEvidenceV1(filters: AdminListFiltersV1): AdminReadResultV1 {
  if (filters.kind !== 'analytics' || filters.subjectId !== null) throw new Error('Invalid analytics evidence read.');
  const offset = filters.cursor === null ? 0 : Number(filters.cursor);
  if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) throw new Error('Invalid evidence cursor.');
  const rows = METRICS.slice(offset, offset + filters.limit).map(metric => Object.freeze({
    ...metric,
    registryStatus: isRegisteredAdminAnalyticsEventV1(metric.eventName) ? 'registered' : 'contract_missing',
    readModelVersion: 'admin-beta-evidence-v1',
    sourceStatus: 'no_verified_analytics_store',
    measurementStatus: 'unmeasured',
    value: null, numerator: null, denominator: null, sampleSize: null,
    sampleStatus: 'unknown',
    consentStatus: 'analytics_consent_unverified',
    retentionStatus: 'analytics_linkage_retention_unverified',
    campaignKey: 'unknown',
    periodFrom: filters.from, periodTo: filters.to, timezone: 'UTC',
  }));
  return Object.freeze({ rows, nextCursor: offset + filters.limit < METRICS.length ? String(offset + filters.limit) : null });
}
