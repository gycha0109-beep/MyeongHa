import type {
  BirthInputV1,
  CurrentBirthProfileV1,
  CurrentSubjectProfileV1,
} from '@myeongha/api-client';

export interface MobileMyProfileViewV1 {
  readonly displayName: string;
  readonly subjectLabel: string;
  readonly statusLabel: string;
  readonly locale: string | null;
  readonly timezone: string | null;
}

export interface MobileMyBirthViewV1 {
  readonly birthDate: string;
  readonly birthTime: string;
  readonly basis: string;
  readonly sex: string;
  readonly revisionLabel: string;
}

function sexText(value: BirthInputV1['sex']): string {
  if (value === 'male') return '남성';
  if (value === 'female') return '여성';
  if (value === 'unspecified') return '미지정';
  return '미입력';
}

function calendarText(input: BirthInputV1): string {
  if (input.calendarType === 'solar') return '양력';
  return input.isLeapMonth ? '음력 · 윤달' : '음력';
}

export function createMobileMyProfileViewV1(
  profile: CurrentSubjectProfileV1,
): MobileMyProfileViewV1 {
  const displayName = profile.profile?.displayName?.trim();
  return Object.freeze({
    displayName: displayName && displayName.length > 0 ? displayName : '호칭 미설정',
    subjectLabel:
      profile.subjectKind === 'guest'
        ? '게스트로 이용 중'
        : '회원 세션 · 네이티브 계정 관리 준비 중',
    statusLabel:
      profile.subjectStatus === 'deletion_pending'
        ? '삭제 요청 진행 중'
        : '사용 중',
    locale: profile.profile?.locale ?? null,
    timezone: profile.profile?.timezone ?? null,
  });
}

export function createMobileMyBirthViewV1(
  birth: CurrentBirthProfileV1,
): MobileMyBirthViewV1 {
  const input = birth.currentRevision.input;
  return Object.freeze({
    birthDate: input.birthDate.replaceAll('-', '.'),
    birthTime:
      input.timeKnown && input.birthTime !== null
        ? input.birthTime.slice(0, 5)
        : '시간 모름',
    basis: calendarText(input),
    sex: sexText(input.sex),
    revisionLabel: `현재 입력 · revision ${birth.currentRevision.revisionNo}`,
  });
}
