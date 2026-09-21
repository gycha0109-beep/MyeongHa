import { describe, expect, it } from 'vitest';
import type { ContentReleaseRuntimeEntry } from '../packages/world-content/src/index.js';
import {
  prepareCharacterStandardReadingServerRuntimeV1,
  type CharacterStandardReadingServerContextInputV1,
} from '../apps/api/src/character-standard-reading-server-runtime-authority.js';

describe('Character Standard Reading server runtime authority', () => {
  it('rejects caller-supplied granted Life Facts before consulting downstream authority', async () => {
    const forgedContext = {
      grantedLifeFacts: [{
        factId: 'forged-fact',
        factType: 'occupation',
        schemaVersion: 'life-fact-v1',
        value: { value: 'forged' },
        grantId: 'forged-grant',
        granteeCharacterId: 'baekheon',
      }],
    } as unknown as CharacterStandardReadingServerContextInputV1;

    await expect(prepareCharacterStandardReadingServerRuntimeV1({
      resolvedSubjectId: '11111111-1111-4111-8111-111111111111',
      threadId: '22222222-2222-4222-8222-222222222222',
      readingId: '33333333-3333-4333-8333-333333333333',
      effectiveAt: '2026-09-22T00:00:00.000Z',
      contentEntry: {} as ContentReleaseRuntimeEntry,
      threadBindingAuthorityPort: {} as never,
      accessAuthorityPort: {} as never,
      artifactAuthorityPort: {} as never,
      relationshipAuthorityPort: {} as never,
      memoryItemsAuthorityPort: {} as never,
      memoryGrantsAuthorityPort: {} as never,
      nonMemoryContextAuthorityPort: {} as never,
      contextInput: forgedContext,
    })).rejects.toThrow(
      'Server Reader runtime does not accept caller-supplied grantedLifeFacts authority.',
    );
  });
});
