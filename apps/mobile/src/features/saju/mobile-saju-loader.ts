import {
  MyeongHaApiClientErrorV1,
  type CurrentBirthProfileV1,
  type CurrentSajuCalculationV1,
} from '@myeongha/api-client';

import type { MobileBirthServiceV1 } from '../birth/mobile-birth-service.js';
import type { MobileSajuServiceV1 } from './mobile-saju-service.js';

export type MobileSajuLoadStateV1 =
  | Readonly<{ kind: 'birth_required' }>
  | Readonly<{
      kind: 'ready';
      profile: CurrentBirthProfileV1;
      calculation: CurrentSajuCalculationV1;
    }>
  | Readonly<{
      kind: 'auth_error' | 'saju_unavailable' | 'authority_mismatch' | 'error';
      retryable: boolean;
    }>;

function classifyAfterBirth(error: unknown): MobileSajuLoadStateV1 {
  if (!(error instanceof MyeongHaApiClientErrorV1)) {
    return Object.freeze({ kind: 'error', retryable: true });
  }
  if (error.kind === 'http' && error.status === 401) {
    return Object.freeze({ kind: 'auth_error', retryable: true });
  }
  if (error.kind === 'http' && error.status === 404) {
    return Object.freeze({ kind: 'authority_mismatch', retryable: false });
  }
  if (
    error.kind === 'http' &&
    (error.status === 503 || error.code === 'SAJU_TEMPORARILY_UNAVAILABLE')
  ) {
    return Object.freeze({ kind: 'saju_unavailable', retryable: true });
  }
  return Object.freeze({
    kind: 'error',
    retryable: error.kind === 'network' || error.retryable,
  });
}

export async function loadMobileCurrentSajuV1(input: {
  readonly birthService: Pick<MobileBirthServiceV1, 'readCurrent'>;
  readonly sajuService: Pick<MobileSajuServiceV1, 'calculateCurrent'>;
}): Promise<MobileSajuLoadStateV1> {
  let profile: CurrentBirthProfileV1 | null;
  try {
    profile = await input.birthService.readCurrent();
  } catch (error) {
    if (
      error instanceof MyeongHaApiClientErrorV1 &&
      error.kind === 'http' &&
      error.status === 401
    ) {
      return Object.freeze({ kind: 'auth_error', retryable: true });
    }
    return Object.freeze({
      kind: 'error',
      retryable:
        error instanceof MyeongHaApiClientErrorV1
          ? error.kind === 'network' || error.retryable
          : true,
    });
  }

  if (profile === null) {
    return Object.freeze({ kind: 'birth_required' });
  }

  try {
    const calculation = await input.sajuService.calculateCurrent();
    if (calculation.birthRevisionRef !== profile.currentRevision.revisionId) {
      return Object.freeze({ kind: 'authority_mismatch', retryable: false });
    }
    return Object.freeze({ kind: 'ready', profile, calculation });
  } catch (error) {
    return classifyAfterBirth(error);
  }
}
