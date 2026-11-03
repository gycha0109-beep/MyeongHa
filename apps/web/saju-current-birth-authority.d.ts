export const CURRENT_SAJU_BIRTH_PROFILE_ENDPOINT_V1: '/api/me/birth-profile';

export class CurrentSajuBirthProfileErrorV1 extends Error {
  readonly operation: string;
  readonly status: number;
  readonly code: string | null;
  constructor(operation: string, status: number, code: string | null);
}

export interface CurrentSajuBirthProfileV1 {
  readonly birthProfileId: string;
  readonly profileKind: 'self';
  readonly archivedAt: null;
  readonly currentRevision: Readonly<{
    revisionId: string;
    revisionNo: number;
    input: Readonly<{
      birthDate: string;
      birthTime: string | null;
      timeKnown: boolean;
      calendarType: 'solar' | 'lunar';
      isLeapMonth: boolean;
      sex: 'male' | 'female' | 'unspecified' | null;
    }>;
  }>;
}

export function readCurrentSajuBirthProfileV1(
  token: string,
  fetchImpl?: typeof fetch,
): Promise<CurrentSajuBirthProfileV1 | null>;

export function matchCurrentSajuBirthProfileV1(
  profile: CurrentSajuBirthProfileV1 | null,
  calculation: Readonly<{ birthRevisionRef?: string }> | null,
): CurrentSajuBirthProfileV1 | null;
