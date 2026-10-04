import { describe, expect, it } from 'vitest';

import {
  getSeyeonInternalDogfoodScenarioV1,
  SEYEON_INTERNAL_DOGFOOD_SCENARIOS_V1,
} from '../apps/api/src/seyeon-internal-dogfood-scenarios-v1.js';

describe('Se-yeon internal dogfood scenario catalog V1', () => {
  it('pins the initial long-run scenario suite', () => {
    expect(SEYEON_INTERNAL_DOGFOOD_SCENARIOS_V1['first-meeting-v1'].turns)
      .toHaveLength(10);
    expect(SEYEON_INTERNAL_DOGFOOD_SCENARIOS_V1['normal-accumulation-v1'].turns)
      .toHaveLength(20);
    expect(SEYEON_INTERNAL_DOGFOOD_SCENARIOS_V1['false-shared-memory-v1'].turns)
      .toHaveLength(8);
    expect(SEYEON_INTERNAL_DOGFOOD_SCENARIOS_V1['biography-injection-v1'].turns)
      .toHaveLength(8);
    expect(SEYEON_INTERNAL_DOGFOOD_SCENARIOS_V1['open-conflict-v1'].turns)
      .toHaveLength(8);
    expect(SEYEON_INTERNAL_DOGFOOD_SCENARIOS_V1['reconciliation-v1'].turns)
      .toHaveLength(8);
    expect(SEYEON_INTERNAL_DOGFOOD_SCENARIOS_V1['return-after-absence-v1'].turns)
      .toHaveLength(8);

    expect(
      SEYEON_INTERNAL_DOGFOOD_SCENARIOS_V1['open-conflict-v1']
        .relationshipPrecondition,
    ).toEqual({
      attainedStage: 'S3_OPENED',
      currentCondition: 'OPEN_CONFLICT',
      behaviorAccess: 'RESTRICTED_BY_CONFLICT',
      requiredActiveEventKinds: ['CONFLICT_OPENED'],
    });
  });

  it('fails closed on an unknown scenario id', () => {
    expect(() =>
      getSeyeonInternalDogfoodScenarioV1('unknown-scenario'),
    ).toThrow(/Unknown Se-yeon internal dogfood scenario/i);
  });
});
