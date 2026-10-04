import { describe, expect, it } from 'vitest';

import {
  parseSeyeonInternalDogfoodScenarioCommandV1,
} from '../apps/api/src/seyeon-internal-dogfood-scenario-cli-v1.js';

describe('Se-yeon internal dogfood scenario CLI V1', () => {
  it('parses an internal member scenario command', () => {
    expect(
      parseSeyeonInternalDogfoodScenarioCommandV1([
        '--member-auth-user-id',
        'auth-user-1',
        '--thread',
        'thread-1',
        '--scenario',
        'first-meeting-v1',
        '--run-id',
        'manual-001',
        '--verify-final-replay',
      ]),
    ).toEqual({
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: 'auth-user-1',
      },
      threadId: 'thread-1',
      scenarioId: 'first-meeting-v1',
      runId: 'manual-001',
      verifyFinalReplay: true,
    });
  });

  it('rejects caller attempts to inject relationship state', () => {
    expect(() =>
      parseSeyeonInternalDogfoodScenarioCommandV1([
        '--member-auth-user-id',
        'auth-user-1',
        '--thread',
        'thread-1',
        '--scenario',
        'first-meeting-v1',
        '--run-id',
        'manual-001',
        '--relationship-stage',
        'S4_SPECIAL',
      ]),
    ).toThrow(/Unsupported/i);
  });
});
