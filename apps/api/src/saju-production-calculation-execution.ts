import type {
  SajuBirthRevisionBindingV1,
  SajuProductionCalculationIngressArtifactV1,
} from '../../../packages/domain/src/index.js';
import type { BirthProfileReadResponseV1 } from './birth-profile-read.js';
import {
  SajuProductionCalculationHttpAdapterErrorV1,
  type SajuProductionCalculationHttpAdapterV1,
} from './saju-production-calculation-http-adapter.js';

function invalidCurrentRevision(message: string): never {
  throw new SajuProductionCalculationHttpAdapterErrorV1(
    'INVALID_BIRTH_REVISION',
    message,
  );
}

export function bindCurrentBirthProfileRevisionForSajuV1(
  profile: BirthProfileReadResponseV1,
): SajuBirthRevisionBindingV1 {
  const current = profile.currentRevision;
  const revisionRef = current.revisionId.trim();
  if (revisionRef.length === 0) {
    return invalidCurrentRevision('Current Birth Profile revisionId must be non-empty.');
  }

  const calendarType = current.input.calendarType;
  if (calendarType !== 'solar' && calendarType !== 'lunar') {
    return invalidCurrentRevision('Current Birth Profile calendarType is unsupported by Saju V1.');
  }

  const sex = current.input.sex;
  if (
    sex !== null &&
    sex !== 'male' &&
    sex !== 'female' &&
    sex !== 'unspecified'
  ) {
    return invalidCurrentRevision('Current Birth Profile sex is unsupported by Saju V1.');
  }

  return Object.freeze({
    birthRevisionRef: revisionRef,
    calendarType,
    birthDate: current.input.birthDate,
    birthTime: current.input.birthTime,
    timeKnown: current.input.timeKnown,
    isLeapMonth: current.input.isLeapMonth,
    sex,
  });
}

export async function executeCurrentBirthProfileSajuCalculationV1(input: {
  readonly profile: BirthProfileReadResponseV1;
  readonly adapter: SajuProductionCalculationHttpAdapterV1;
}): Promise<SajuProductionCalculationIngressArtifactV1> {
  const binding = bindCurrentBirthProfileRevisionForSajuV1(input.profile);
  return input.adapter.calculate(binding);
}
