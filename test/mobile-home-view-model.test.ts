import { describe, expect, it } from 'vitest';

import type {
  CurrentBirthProfileV1,
  CurrentSajuCalculationV1,
  CurrentSubjectProfileV1,
  ReadingHistoryItemV1,
} from '../packages/api-client/src/index.js';
import {
  HOME_READING_TOPICS_V1,
  createHomeGreetingV1,
  createMobileHomeViewModelV1,
} from '../apps/mobile/src/features/home/home-view-model.js';
import type { MobileHomeStateV1 } from '../apps/mobile/src/features/home/mobile-home-loader.js';

const profile: CurrentSubjectProfileV1 = {
  subjectId: 'subject-1',
  subjectKind: 'guest',
  subjectStatus: 'active',
  profile: {
    displayName: '명하',
    locale: 'ko-KR',
    timezone: 'Asia/Seoul',
    onboardingState: null,
    updatedAt: '2026-09-29T00:00:00.000Z',
  },
};

const birth: CurrentBirthProfileV1 = {
  birthProfileId: 'birth-1',
  profileKind: 'self',
  label: null,
  archivedAt: null,
  currentRevision: {
    revisionId: 'revision-1',
    revisionNo: 1,
    input: {
      calendarType: 'solar',
      birthDate: '1995-08-17',
      birthTime: '14:30:00',
      timeKnown: true,
      isLeapMonth: false,
      sex: 'male',
    },
  },
  revisions: [{ revisionId: 'revision-1', revisionNo: 1, isCurrent: true }],
};

const calculation: CurrentSajuCalculationV1 = {
  schemaVersion: 'calc.v1',
  kind: 'saju_calculation_evidence',
  semanticAuthority: 'calculation_only',
  interpretationAuthorized: false,
  birthRevisionRef: 'revision-1',
  snapshot: {
    snapshotId: 'snapshot-1',
    schemaVersion: 'snapshot.v1',
    calculationHash: 'hash-1',
    createdAt: '2026-09-29T00:00:00.000Z',
    pillars: {
      year: {
        status: 'resolved',
        value: {
          stem: { value: '갑', hanja: '甲', element: '목', yinYang: '양' },
          branch: { value: '자', hanja: '子', element: '수', yinYang: '양' },
        },
      },
      month: {
        status: 'resolved',
        value: {
          stem: { value: '을', hanja: '乙', element: '목', yinYang: '음' },
          branch: { value: '축', hanja: '丑', element: '토', yinYang: '음' },
        },
      },
      day: {
        status: 'resolved',
        value: {
          stem: { value: '병', hanja: '丙', element: '화', yinYang: '양' },
          branch: { value: '인', hanja: '寅', element: '목', yinYang: '양' },
        },
      },
      hour: {
        status: 'resolved',
        value: {
          stem: { value: '정', hanja: '丁', element: '화', yinYang: '음' },
          branch: { value: '묘', hanja: '卯', element: '목', yinYang: '음' },
        },
      },
    },
    completeness: {
      birthTimeKnown: true,
      fullyResolved: true,
      resolvedPaths: ['pillars.year', 'pillars.month', 'pillars.day', 'pillars.hour'],
      ambiguousPaths: [],
      unavailablePaths: [],
    },
  },
};

const reading: ReadingHistoryItemV1 = {
  readingId: 'reading-1',
  readingSessionId: 'session-1',
  sajuDomain: 'career',
  readingContractVersion: 'v1',
  productResponseState: 'delivered',
  readerCharacterIds: ['character-a'],
  createdAt: '2026-09-28T00:00:00.000Z',
  completedAt: '2026-09-28T01:00:00.000Z',
};

const state: MobileHomeStateV1 = {
  profile: { kind: 'ready', profile },
  birth: { kind: 'ready', birth },
  saju: { kind: 'ready', calculation },
  recentReading: { kind: 'ready', reading },
};

describe('mobile Home view model', () => {
  it('uses device-local daypart only for greeting presentation', () => {
    expect(createHomeGreetingV1(new Date(2026, 8, 29, 8, 0), '명하')).toBe('좋은 아침이에요, 명하');
    expect(createHomeGreetingV1(new Date(2026, 8, 29, 13, 0), '명하')).toBe('좋은 오후예요, 명하');
    expect(createHomeGreetingV1(new Date(2026, 8, 29, 20, 0), '명하')).toBe('좋은 저녁이에요, 명하');
  });

  it('projects only calculation facts into the Home current-chart card', () => {
    const view = createMobileHomeViewModelV1(state, new Date(2026, 8, 29, 13, 0));
    expect(view.today).toEqual({
      kind: 'ready',
      label: '현재 명식',
      dayMaster: '丙 · 병',
      element: '화',
      completeness: '네 기둥 계산 완료',
    });
    expect(JSON.stringify(view.today)).not.toContain('운세');
    expect(JSON.stringify(view.today)).not.toContain('좋습니다');
  });

  it('projects the latest Reading as a continuation card without Character inference', () => {
    const view = createMobileHomeViewModelV1(state);
    expect(view.continuation).toEqual({
      kind: 'ready',
      readingId: 'reading-1',
      title: '직업 · 커리어',
      status: '완료',
      dateLabel: '2026.09.28',
    });
    expect(JSON.stringify(view.continuation)).not.toContain('character-a');
  });

  it('keeps the four Home topics source-bounded and non-executing', () => {
    expect(HOME_READING_TOPICS_V1.map((item) => item.sourceReadingText)).toEqual([
      '전체 사주',
      '직업운',
      '재물운',
      '연애운',
    ]);
  });
});
