import { describe, expect, it } from 'vitest';

import {
  parseSeyeonInternalFirstMeetingCampaignCommandV1,
} from '../apps/api/src/seyeon-internal-first-meeting-campaign-cli-v1.js';

describe('Se-yeon first-meeting live campaign CLI V1', () => {
  it('accepts only verified Member identity plus run id', () => {
    expect(
      parseSeyeonInternalFirstMeetingCampaignCommandV1([
        '--member-auth-user-id',
        'auth-user-1',
        '--run-id',
        'live-first-meeting-001',
      ]),
    ).toEqual({
      verifiedAuthUserId: 'auth-user-1',
      runId: 'live-first-meeting-001',
    });
  });

  it('rejects caller-supplied thread, Character, and Guest authority', () => {
    for (const extra of [
      ['--thread', 'thread-1'],
      ['--character', 'seyeon'],
      ['--guest-token-hash', 'guest-hash'],
    ]) {
      expect(() =>
        parseSeyeonInternalFirstMeetingCampaignCommandV1([
          '--member-auth-user-id',
          'auth-user-1',
          '--run-id',
          'live-first-meeting-001',
          ...extra,
        ]),
      ).toThrow(/Unsupported/i);
    }
  });
});
