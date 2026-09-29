import {
  MyeongHaApiClientErrorV1,
  type CurrentBirthProfileV1,
  type CurrentSajuCalculationV1,
  type CurrentSubjectProfileV1,
  type ReadingHistoryItemV1,
} from '@myeongha/api-client';

import type { MobileHomeServiceV1 } from './mobile-home-service.js';

export type MobileHomeProfileStateV1 =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'ready'; profile: CurrentSubjectProfileV1 }>
  | Readonly<{ kind: 'error'; retryable: boolean }>;

export type MobileHomeBirthStateV1 =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'ready'; birth: CurrentBirthProfileV1 }>
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'error'; retryable: boolean }>;

export type MobileHomeSajuStateV1 =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'ready'; calculation: CurrentSajuCalculationV1 }>
  | Readonly<{ kind: 'not_requested'; reason: 'birth_required' | 'birth_unavailable' }>
  | Readonly<{ kind: 'authority_mismatch' }>
  | Readonly<{ kind: 'error'; retryable: boolean }>;

export type MobileHomeRecentReadingStateV1 =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'ready'; reading: ReadingHistoryItemV1 }>
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'error'; retryable: boolean }>;

export interface MobileHomeStateV1 {
  readonly profile: MobileHomeProfileStateV1;
  readonly birth: MobileHomeBirthStateV1;
  readonly saju: MobileHomeSajuStateV1;
  readonly recentReading: MobileHomeRecentReadingStateV1;
}

export const MOBILE_HOME_LOADING_STATE_V1: MobileHomeStateV1 = Object.freeze({
  profile: Object.freeze({ kind: 'loading' }),
  birth: Object.freeze({ kind: 'loading' }),
  saju: Object.freeze({ kind: 'loading' }),
  recentReading: Object.freeze({ kind: 'loading' }),
});

function retryable(error: unknown): boolean {
  return error instanceof MyeongHaApiClientErrorV1
    ? error.retryable || error.status === 401
    : true;
}

export async function loadMobileHomeV1(
  service: MobileHomeServiceV1,
): Promise<MobileHomeStateV1> {
  const [profileResult, birthResult, readingResult] = await Promise.allSettled([
    service.readProfile(),
    service.readBirth(),
    service.readLatestReading(),
  ]);

  const profile: MobileHomeProfileStateV1 =
    profileResult.status === 'fulfilled'
      ? Object.freeze({ kind: 'ready', profile: profileResult.value })
      : Object.freeze({ kind: 'error', retryable: retryable(profileResult.reason) });

  const birth: MobileHomeBirthStateV1 =
    birthResult.status === 'rejected'
      ? Object.freeze({ kind: 'error', retryable: retryable(birthResult.reason) })
      : birthResult.value === null
        ? Object.freeze({ kind: 'empty' })
        : Object.freeze({ kind: 'ready', birth: birthResult.value });

  const recentReading: MobileHomeRecentReadingStateV1 =
    readingResult.status === 'rejected'
      ? Object.freeze({ kind: 'error', retryable: retryable(readingResult.reason) })
      : readingResult.value === null
        ? Object.freeze({ kind: 'empty' })
        : Object.freeze({ kind: 'ready', reading: readingResult.value });

  let saju: MobileHomeSajuStateV1;
  if (birthResult.status === 'rejected') {
    saju = Object.freeze({ kind: 'not_requested', reason: 'birth_unavailable' });
  } else if (birthResult.value === null) {
    saju = Object.freeze({ kind: 'not_requested', reason: 'birth_required' });
  } else {
    try {
      const calculation = await service.calculateCurrentSaju();
      saju =
        calculation.birthRevisionRef === birthResult.value.currentRevision.revisionId
          ? Object.freeze({ kind: 'ready', calculation })
          : Object.freeze({ kind: 'authority_mismatch' });
    } catch (error) {
      saju = Object.freeze({ kind: 'error', retryable: retryable(error) });
    }
  }

  return Object.freeze({ profile, birth, saju, recentReading });
}
