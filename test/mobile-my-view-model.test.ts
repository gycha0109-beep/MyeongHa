import { describe, expect, it } from 'vitest';

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
      subjectLabel: '회원으로 이용 중',
      statusLabel: '삭제 요청 진행 중',
    });
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
});
