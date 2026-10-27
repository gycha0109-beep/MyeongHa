import { describe, expect, it } from 'vitest';
import { BETA_TARGETS_V1, DISABLED_OPERATOR_ACTIONS_V1 } from './AdminOperationalReadiness.js';
describe('unverified analytics and operator controls', () => {
  it('never presents beta objectives as measured results', () => {
    expect(BETA_TARGETS_V1).toHaveLength(5);
    expect(BETA_TARGETS_V1.every(item => item.value === null)).toBe(true);
  });
  it('keeps all unapproved write operations disabled', () => {
    expect(DISABLED_OPERATOR_ACTIONS_V1).toHaveLength(5);
    expect(DISABLED_OPERATOR_ACTIONS_V1.every(item => item.reason.length > 0)).toBe(true);
  });
});
