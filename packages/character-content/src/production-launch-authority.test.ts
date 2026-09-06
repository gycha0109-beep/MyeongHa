import { describe, expect, it } from 'vitest';

import {
  MVP_PRODUCTION_LAUNCH_CHARACTER_DISPLAY_NAMES,
  MVP_PRODUCTION_LAUNCH_CHARACTER_ROSTER_SIZE,
  ProductionCharacterContentValidationError,
  validateMvpProductionLaunchRosterDisplayNames,
} from './production.js';
import {
  CHARACTER_CONCEPT_V1_WORKING_ROSTER,
  CHARACTER_CONCEPT_V1_WORKING_ROSTER_SIZE,
} from './working-roster.js';

const approvedNames = [...MVP_PRODUCTION_LAUNCH_CHARACTER_DISPLAY_NAMES];

describe('MVP Production Launch Character identity authority', () => {
  it('pins the exact approved nine official display names', () => {
    expect(MVP_PRODUCTION_LAUNCH_CHARACTER_ROSTER_SIZE).toBe(9);
    expect(approvedNames).toEqual([
      '세연',
      '여울',
      '서린',
      '라현',
      '미라',
      '태겸',
      '윤호',
      '도윤',
      '백헌',
    ]);
    expect(() => validateMvpProductionLaunchRosterDisplayNames(approvedNames)).not.toThrow();
  });

  it('fails closed when the Production launch roster cardinality is not exactly nine', () => {
    try {
      validateMvpProductionLaunchRosterDisplayNames(approvedNames.slice(0, 8));
      throw new Error('expected Production roster validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionCharacterContentValidationError);
      expect((error as ProductionCharacterContentValidationError).code).toBe(
        'PRODUCTION_ROSTER_COUNT_MISMATCH',
      );
    }
  });

  it('fails closed when an approved display name is replaced by an unapproved name', () => {
    const changedNames = approvedNames.map((name) => (name === '미라' ? '미라-대체' : name));

    try {
      validateMvpProductionLaunchRosterDisplayNames(changedNames);
      throw new Error('expected Production roster validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionCharacterContentValidationError);
      expect((error as ProductionCharacterContentValidationError).code).toBe(
        'PRODUCTION_ROSTER_NAME_MISMATCH',
      );
    }
  });

  it('fails closed on duplicate display names even when roster cardinality remains nine', () => {
    const duplicatedNames = [...approvedNames];
    duplicatedNames[4] = '세연';

    try {
      validateMvpProductionLaunchRosterDisplayNames(duplicatedNames);
      throw new Error('expected Production roster validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ProductionCharacterContentValidationError);
      expect((error as ProductionCharacterContentValidationError).code).toBe(
        'PRODUCTION_ROSTER_NAME_MISMATCH',
      );
    }
  });

  it('keeps working concepts Production-blocked while marking all launch display names approved', () => {
    expect(CHARACTER_CONCEPT_V1_WORKING_ROSTER_SIZE).toBe(9);
    expect(CHARACTER_CONCEPT_V1_WORKING_ROSTER.map((entry) => entry.workingDisplayName)).toEqual(
      approvedNames,
    );
    expect(
      CHARACTER_CONCEPT_V1_WORKING_ROSTER.every(
        (entry) =>
          entry.nameStatus === 'launch-approved' &&
          entry.immutableCanonStatus === 'not_established' &&
          entry.productionPublication === 'blocked',
      ),
    ).toBe(true);
  });
});
