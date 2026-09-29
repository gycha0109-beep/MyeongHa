import type { ReadingHistoryItemV1 } from '@myeongha/api-client';

import { createMobileSajuViewModelV1 } from '../saju/saju-view-model.js';
import type { MobileHomeStateV1 } from './mobile-home-loader.js';

export type HomeReadingTopicKeyV1 = 'general' | 'career' | 'wealth' | 'love';

export interface HomeReadingTopicV1 {
  readonly key: HomeReadingTopicKeyV1;
  readonly title: string;
  readonly subtitle: string;
  readonly sourceReadingText: '전체 사주' | '직업운' | '재물운' | '연애운';
}

export const HOME_READING_TOPICS_V1: readonly HomeReadingTopicV1[] = Object.freeze([
  Object.freeze({
    key: 'general',
    title: '전체 사주',
    subtitle: '나라는 사람을 더 깊이',
    sourceReadingText: '전체 사주',
  }),
  Object.freeze({
    key: 'career',
    title: '직업 · 커리어',
    subtitle: '일과 선택을 더 깊이',
    sourceReadingText: '직업운',
  }),
  Object.freeze({
    key: 'wealth',
    title: '재물',
    subtitle: '재물과 자원의 흐름',
    sourceReadingText: '재물운',
  }),
  Object.freeze({
    key: 'love',
    title: '연애 · 관계',
    subtitle: '관계에서 반복되는 방식',
    sourceReadingText: '연애운',
  }),
]);

export type MobileHomeTodayCardV1 =
  | Readonly<{
      kind: 'ready';
      label: '현재 명식';
      dayMaster: string;
      element: string;
      completeness: string;
    }>
  | Readonly<{ kind: 'birth_required' }>
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'unavailable'; reason: 'birth' | 'saju' | 'authority_mismatch' }>;

export type MobileHomeContinuationCardV1 =
  | Readonly<{
      kind: 'ready';
      readingId: string;
      title: string;
      status: string;
      dateLabel: string;
    }>
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'unavailable' }>;

export interface MobileHomeViewModelV1 {
  readonly greeting: string;
  readonly subheading: string;
  readonly today: MobileHomeTodayCardV1;
  readonly continuation: MobileHomeContinuationCardV1;
  readonly readingTopics: readonly HomeReadingTopicV1[];
  readonly characterSurface: Readonly<{
    kind: 'pending';
    title: '오늘 이야기할 사람';
    body: string;
  }>;
}

function displayName(state: MobileHomeStateV1): string {
  if (state.profile.kind !== 'ready') return '당신';
  const value = state.profile.profile.profile?.displayName?.trim();
  return value && value.length > 0 ? value : '당신';
}

export function createHomeGreetingV1(now: Date, name: string): string {
  const hour = now.getHours();
  const period = hour < 12 ? '좋은 아침이에요' : hour < 18 ? '좋은 오후예요' : '좋은 저녁이에요';
  return `${period}, ${name}`;
}

function readingTitle(item: ReadingHistoryItemV1): string {
  const labels: Readonly<Record<string, string>> = Object.freeze({
    general: '전체 사주',
    family: '가족',
    relationship: '연애 · 관계',
    compatibility: '궁합',
    career: '직업 · 커리어',
    business: '사업',
    wealth: '재물',
    life_stage: '삶의 단계',
    question_specific: '지금 고민으로 보기',
  });
  return labels[item.sajuDomain] ?? '사주 풀이';
}

function readingStatus(item: ReadingHistoryItemV1): string {
  if (item.productResponseState === 'delivered' || item.productResponseState === 'delivered_with_fallback') {
    return '완료';
  }
  if (item.productResponseState === 'clarification_required') return '추가 확인 필요';
  return '저장됨';
}

function dateLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(value);
  return match === null ? '—' : `${match[1]}.${match[2]}.${match[3]}`;
}

function todayCard(state: MobileHomeStateV1): MobileHomeTodayCardV1 {
  if (state.birth.kind === 'loading' || state.saju.kind === 'loading') {
    return Object.freeze({ kind: 'loading' });
  }
  if (state.birth.kind === 'empty') {
    return Object.freeze({ kind: 'birth_required' });
  }
  if (state.birth.kind === 'error' || state.saju.kind === 'not_requested') {
    return Object.freeze({ kind: 'unavailable', reason: 'birth' });
  }
  if (state.saju.kind === 'authority_mismatch') {
    return Object.freeze({ kind: 'unavailable', reason: 'authority_mismatch' });
  }
  if (state.saju.kind === 'error') {
    return Object.freeze({ kind: 'unavailable', reason: 'saju' });
  }
  if (state.birth.kind !== 'ready' || state.saju.kind !== 'ready') {
    return Object.freeze({ kind: 'loading' });
  }

  const saju = createMobileSajuViewModelV1({
    profile: state.birth.birth,
    calculation: state.saju.calculation,
  });
  const dayMaster = saju.dayMaster.status === 'resolved'
    ? `${saju.dayMaster.hanja} · ${saju.dayMaster.hangul}`
    : '일간 미확정';
  const element = saju.dayMaster.element ?? '오행 미확정';

  return Object.freeze({
    kind: 'ready',
    label: '현재 명식',
    dayMaster,
    element,
    completeness: saju.completeness.headline,
  });
}

function continuationCard(
  state: MobileHomeStateV1,
): MobileHomeContinuationCardV1 {
  if (state.recentReading.kind === 'loading') return Object.freeze({ kind: 'loading' });
  if (state.recentReading.kind === 'empty') return Object.freeze({ kind: 'empty' });
  if (state.recentReading.kind === 'error') return Object.freeze({ kind: 'unavailable' });

  const item = state.recentReading.reading;
  return Object.freeze({
    kind: 'ready',
    readingId: item.readingId,
    title: readingTitle(item),
    status: readingStatus(item),
    dateLabel: dateLabel(item.completedAt),
  });
}

export function createMobileHomeViewModelV1(
  state: MobileHomeStateV1,
  now: Date = new Date(),
): MobileHomeViewModelV1 {
  return Object.freeze({
    greeting: createHomeGreetingV1(now, displayName(state)),
    subheading: '오늘도 명하에서 이어가 볼까요?',
    today: todayCard(state),
    continuation: continuationCard(state),
    readingTopics: HOME_READING_TOPICS_V1,
    characterSurface: Object.freeze({
      kind: 'pending',
      title: '오늘 이야기할 사람',
      body: '캐릭터 선택은 서버가 허용한 대화 authority와 함께 연결됩니다.',
    }),
  });
}
