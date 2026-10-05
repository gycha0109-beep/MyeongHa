import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_SEYEON_CHAT_RUNTIME_BINDINGS_V1,
  PRODUCTION_SEYEON_CHAT_RUNTIME_VERSION_V1,
} from '../apps/api/src/production-seyeon-chat-runtime-v1.js';

describe('Production Se-yeon Chat runtime V1 boundary', () => {
  it('stays internal, pinned-thread-only, WRITE_DARK, and deferred post-turn', () => {
    expect(PRODUCTION_SEYEON_CHAT_RUNTIME_VERSION_V1)
      .toBe('production-seyeon-chat-runtime-v1');
    expect(PRODUCTION_SEYEON_CHAT_RUNTIME_BINDINGS_V1).toEqual({
      publicRoute: null,
      routeMounted: false,
      browserAuthority: false,
      relationshipMode: 'WRITE_DARK',
      postTurnExecution: 'DEFERRED',
      clientCompatibilityVerdict: false,
      existingSingleCharacterThreadRequired: true,
    });
  });
});
