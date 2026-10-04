import type { SajuPreviewReadingTextV1 } from '@myeongha/api-client';

export type MobileSajuTopicSectionKeyV1 =
  | 'self'
  | 'flow'
  | 'relationship'
  | 'question';

export type MobileSajuTopicBlockReasonV1 =
  | 'preview_not_authorized'
  | 'family_scope_required'
  | 'target_person_required'
  | 'question_required';

export type MobileSajuTopicAvailabilityV1 =
  | Readonly<{
      kind: 'preview';
      readingText: SajuPreviewReadingTextV1;
      statusLabel: '바로 보기';
    }>
  | Readonly<{
      kind: 'blocked';
      reason: MobileSajuTopicBlockReasonV1;
      message: string;
      statusLabel: '준비 중' | '추가 입력 필요';
    }>;

export interface MobileSajuTopicV1 {
  readonly key:
    | 'temperament'
    | 'career'
    | 'money'
    | 'love'
    | 'business'
    | 'family'
    | 'life-stage'
    | 'year'
    | 'month'
    | 'spouse'
    | 'compatibility'
    | 'question-specific';
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly webHref: string;
  readonly availability: MobileSajuTopicAvailabilityV1;
}

export interface MobileSajuTopicSectionV1 {
  readonly key: MobileSajuTopicSectionKeyV1;
  readonly title: string;
  readonly support?: string;
  readonly topics: readonly MobileSajuTopicV1[];
}

const previewBlocked =
  '웹의 주제와 Saju Engine 요청 매핑은 준비되어 있지만 현재 승인된 Preview 실행 범위에는 포함되지 않습니다. 다른 주제의 풀이로 대신 보여주지 않습니다.';

export const MOBILE_SAJU_TOPIC_SECTIONS_V1 = Object.freeze([
  Object.freeze({
    key: 'self',
    title: '나를 읽기',
    support: '나를 더 깊이 이해하는 시간',
    topics: Object.freeze([
      Object.freeze({
        key: 'temperament',
        label: '전체 사주',
        description: '나라는 사람을 더 깊이',
        icon: '✦',
        webHref: 'reading-detail.html?topic=temperament&scope=original',
        availability: Object.freeze({
          kind: 'preview',
          readingText: '전체 사주',
          statusLabel: '바로 보기',
        }),
      }),
      Object.freeze({
        key: 'career',
        label: '직업 · 커리어',
        description: '지금의 길, 더 나은 길로',
        icon: '⌁',
        webHref: 'reading-detail.html?topic=career',
        availability: Object.freeze({
          kind: 'preview',
          readingText: '직업운',
          statusLabel: '바로 보기',
        }),
      }),
      Object.freeze({
        key: 'money',
        label: '재물',
        description: '흐르는 기회를 잡는 법',
        icon: '財',
        webHref: 'reading-detail.html?topic=money',
        availability: Object.freeze({
          kind: 'preview',
          readingText: '재물운',
          statusLabel: '바로 보기',
        }),
      }),
      Object.freeze({
        key: 'love',
        label: '연애 · 관계',
        description: '더 좋은 인연이 있는 곳',
        icon: '緣',
        webHref: 'reading-detail.html?topic=love',
        availability: Object.freeze({
          kind: 'preview',
          readingText: '연애운',
          statusLabel: '바로 보기',
        }),
      }),
      Object.freeze({
        key: 'business',
        label: '사업',
        description: '시작과 확장의 흐름',
        icon: '業',
        webHref: 'reading-detail.html?topic=business',
        availability: Object.freeze({
          kind: 'preview',
          readingText: '사업운',
          statusLabel: '바로 보기',
        }),
      }),
      Object.freeze({
        key: 'family',
        label: '가족',
        description: '함께하는 마음의 길',
        icon: '家',
        webHref: 'reading-detail.html?topic=family',
        availability: Object.freeze({
          kind: 'blocked',
          reason: 'family_scope_required',
          statusLabel: '추가 입력 필요',
          message:
            '가족 읽기는 부모운 또는 자녀운을 먼저 선택해야 합니다. 현재 모바일에는 이 선택 입력과 실행 경로가 아직 연결되지 않았습니다.',
        }),
      }),
      Object.freeze({
        key: 'life-stage',
        label: '삶의 단계',
        description: '지금의 시기를 지나, 다음으로',
        icon: '葉',
        webHref: 'reading-detail.html?topic=life-stage',
        availability: Object.freeze({
          kind: 'blocked',
          reason: 'preview_not_authorized',
          statusLabel: '준비 중',
          message: previewBlocked,
        }),
      }),
    ]),
  }),
  Object.freeze({
    key: 'flow',
    title: '지금의 흐름',
    support: '지금, 놓치지 말아야 할 시간',
    topics: Object.freeze([
      Object.freeze({
        key: 'year',
        label: '올해',
        description: '지금의 흐름을 한눈에, 주요 키워드와 변화의 시기를 읽어보세요.',
        icon: '年',
        webHref: 'reading-detail.html?scope=year',
        availability: Object.freeze({
          kind: 'blocked',
          reason: 'preview_not_authorized',
          statusLabel: '준비 중',
          message: previewBlocked,
        }),
      }),
      Object.freeze({
        key: 'month',
        label: '이번 달',
        description: '이번 달의 기운과 흐름, 놓치지 말아야 할 순간을 짚어봅니다.',
        icon: '月',
        webHref: 'reading-detail.html?scope=month',
        availability: Object.freeze({
          kind: 'blocked',
          reason: 'preview_not_authorized',
          statusLabel: '준비 중',
          message: previewBlocked,
        }),
      }),
    ]),
  }),
  Object.freeze({
    key: 'relationship',
    title: '사람과의 관계',
    topics: Object.freeze([
      Object.freeze({
        key: 'spouse',
        label: '배우자 · 관계',
        description: '소중한 인연의 흐름을 알아보세요.',
        icon: '♡',
        webHref: 'reading-detail.html?topic=spouse',
        availability: Object.freeze({
          kind: 'blocked',
          reason: 'preview_not_authorized',
          statusLabel: '준비 중',
          message: previewBlocked,
        }),
      }),
      Object.freeze({
        key: 'compatibility',
        label: '궁합',
        description: '함께할 때 더욱 빛나는 이야기',
        icon: '∞',
        webHref: 'reading-detail.html?topic=compatibility',
        availability: Object.freeze({
          kind: 'blocked',
          reason: 'target_person_required',
          statusLabel: '추가 입력 필요',
          message:
            '궁합은 상대 인물 선택이 먼저 필요합니다. 현재 모바일에는 대상 인물을 선택한 뒤 궁합을 실행하는 경로가 아직 연결되지 않았습니다.',
        }),
      }),
    ]),
  }),
  Object.freeze({
    key: 'question',
    title: '고민이 있다면',
    topics: Object.freeze([
      Object.freeze({
        key: 'question-specific',
        label: '지금 고민으로 보기',
        description: '지금 마음에 있는 질문을 바탕으로, 사주가 전하는 범위 안에서 읽어보세요.',
        icon: '…',
        webHref: 'reading-detail.html?topic=question-specific',
        availability: Object.freeze({
          kind: 'blocked',
          reason: 'question_required',
          statusLabel: '추가 입력 필요',
          message:
            '지금 고민으로 보기는 실제 질문 입력이 먼저 필요합니다. 현재 모바일에는 질문 입력 후 해석을 실행하는 경로가 아직 연결되지 않았습니다.',
        }),
      }),
    ]),
  }),
] as const satisfies readonly MobileSajuTopicSectionV1[]);

export const MOBILE_SAJU_TOPICS_V1 = Object.freeze(
  MOBILE_SAJU_TOPIC_SECTIONS_V1.flatMap((section) => [...section.topics]),
);
