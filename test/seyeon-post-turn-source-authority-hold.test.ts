import { describe, expect, it } from 'vitest';
import {
  assertSeyeonPostTurnSourceAuthorityV1,
  SeyeonPostTurnSourceAuthorityHoldV1,
} from '../apps/api/src/seyeon-post-turn-analysis-worker-v1.js';

describe('Production post-turn source authority', () => {
  it('only permits no-source OFF cleanup without a checkpoint', () => {
    expect(() => assertSeyeonPostTurnSourceAuthorityV1('OFF', null))
      .not.toThrow();
    for (const mode of ['SHADOW', 'WRITE'] as const) {
      expect(() => assertSeyeonPostTurnSourceAuthorityV1(mode, null))
        .toThrow(SeyeonPostTurnSourceAuthorityHoldV1);
    }
    expect(() => assertSeyeonPostTurnSourceAuthorityV1('OFF', {
      schemaVersion: 'seyeon-post-turn-analysis-checkpoint-v1',
      decision: 'relationship_event',
    })).toThrow(SeyeonPostTurnSourceAuthorityHoldV1);
  });
});
