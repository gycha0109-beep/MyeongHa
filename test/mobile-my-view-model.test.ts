import { describe, expect, it } from 'vitest';
import { translateMobileUiCopy } from '../apps/mobile/src/ui/mobile-ui-copy.js';

import {
  createMobileMyBirthViewV1,
  createMobileMyProfileViewV1,
} from '../apps/mobile/src/features/my/my-view-model.js';

describe('mobile My view model', () => {
  it('uses source-backed guest/profile labels without inventing identity', () => {
    expect(createMobileMyProfileViewV1({
      subjectId: 'subject-1',
      subjectKind: 'guest',
      subjectStatus: 'active',
      profile: null,
    })).toMatchObject({
      displayName: '호칭 미설정',
      displayNameIsFallback: true,
      subjectLabel: '게스트로 이용 중',
      statusLabel: '사용 중',
    });

    expect(createMobileMyProfileViewV1({
      subjectId: 'subject-2',
      subjectKind: 'member',
      subjectStatus: 'deletion_pending',
      profile: {
        displayName: '명하',
        locale: 'ko-KR',
        timezone: 'Asia/Seoul',
        onboardingState: null,
        updatedAt: '2026-09-29T00:00:00.000Z',
      },
    })).toMatchObject({
      displayName: '명하',
      displayNameIsFallback: false,
      subjectLabel: '회원으로 이용 중',
      statusLabel: '삭제 요청 진행 중',
    });
  });

  it('preserves a user-selected name even if it equals the Korean fallback UI copy', () => {
    const base = {
      subjectId: 'subject-3',
      subjectKind: 'member' as const,
      subjectStatus: 'active' as const,
      profile: {
        displayName: '호칭 미설정',
        locale: 'en-US',
        timezone: 'Asia/Seoul',
        onboardingState: null,
        updatedAt: '2026-11-05T00:00:00.000Z',
      },
    };
    const userName = createMobileMyProfileViewV1(base);
    expect(userName.displayName).toBe('호칭 미설정');
    expect(userName.displayNameIsFallback).toBe(false);
    const emptyName = createMobileMyProfileViewV1({ ...base, profile: { ...base.profile, displayName: '   ' } });
    expect(emptyName.displayNameIsFallback).toBe(true);
    for (const locale of ['ko-KR', 'ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
      const authenticName = userName.displayNameIsFallback
        ? translateMobileUiCopy(userName.displayName, locale) : userName.displayName;
      const fallbackLabel = emptyName.displayNameIsFallback
        ? translateMobileUiCopy(emptyName.displayName, locale) : emptyName.displayName;
      expect(authenticName).toBe('호칭 미설정');
      expect(fallbackLabel).toBe(translateMobileUiCopy('호칭 미설정', locale));
    }
  });

  it('formats only canonical Birth input facts', () => {
    const view = createMobileMyBirthViewV1({
      birthProfileId: 'birth-1',
      profileKind: 'self',
      label: null,
      archivedAt: null,
      currentRevision: {
        revisionId: 'revision-2',
        revisionNo: 2,
        input: {
          calendarType: 'lunar',
          birthDate: '1995-08-17',
          birthTime: null,
          timeKnown: false,
          isLeapMonth: true,
          sex: 'female',
        },
      },
      revisions: [
        { revisionId: 'revision-1', revisionNo: 1, isCurrent: false },
        { revisionId: 'revision-2', revisionNo: 2, isCurrent: true },
      ],
    });

    expect(view).toEqual({
      birthDate: '1995.08.17',
      birthTime: '시간 모름',
      basis: '음력 · 윤달',
      sex: '여성',
      revisionLabel: '현재 입력 · revision 2',
    });
  });

  it('localizes My birth facts in all five UI languages without altering the original birth input', () => {
    const input = {
      calendarType: 'lunar' as const,
      birthDate: '1995-08-17',
      birthTime: '00:05',
      timeKnown: true,
      isLeapMonth: true,
      sex: 'female' as const,
    };
    const birth = {
      birthProfileId: 'birth-1',
      profileKind: 'self' as const,
      label: null,
      archivedAt: null,
      currentRevision: {
        revisionId: 'revision-2',
        revisionNo: 2,
        input,
      },
      revisions: [{ revisionId: 'revision-2', revisionNo: 2, isCurrent: true }],
    };
    expect(createMobileMyBirthViewV1(birth, 'ko-KR')).toMatchObject({
      birthDate: '1995.08.17', birthTime: '00:05', basis: '음력 · 윤달', sex: '여성',
    });
    expect(createMobileMyBirthViewV1(birth, 'ja-JP')).toMatchObject({
      birthDate: '1995年8月17日', birthTime: '0:05', sex: '女性',
      basis: '旧暦 · 閏月 · サーバー計算基準',
    });
    expect(createMobileMyBirthViewV1(birth, 'zh-TW')).toMatchObject({
      birthDate: '1995年8月17日', birthTime: '0:05',
      basis: '農曆 · 閏月 · 伺服器計算基準',
    });
    expect(createMobileMyBirthViewV1(birth, 'en-US')).toMatchObject({
      birthDate: 'August 17, 1995', birthTime: '12:05 AM',
      basis: 'Lunar · Leap month · Server-calculated', sex: 'Female',
      revisionLabel: 'Current input · revision 2',
    });
    expect(createMobileMyBirthViewV1(birth, 'zh-CN')).toMatchObject({
      birthDate: '1995年8月17日', birthTime: '00:05',
      basis: '农历 · 闰月 · 服务器计算基准',
    });
    expect(birth.currentRevision.input).toEqual(input);
  });
});
