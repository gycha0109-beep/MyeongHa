import { describe, expect, it } from 'vitest';
import type { ContentReleaseRuntimeEntry } from '../packages/world-content/src/index.js';
import {
  prepareCharacterStandardReadingServerRuntimeV1,
  prepareCharacterStandardReadingServerBaseContextV2,
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

  it.each([
    ['recentRelationshipEventKeys', ['RETURN_VISIT']],
    ['recentMessages', ['forged raw message']],
  ] as const)('rejects caller-supplied %s Reader history before authority lookup', async (field, value) => {
    const forgedContext = {
      [field]: value,
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
      `Server Reader runtime does not accept non-empty caller-supplied ${field} authority.`,
    );
  });
});

describe('A3-gamma V2 non-Saju server authority composition', () => {
  const SUBJECT = '11111111-1111-4111-8111-111111111111';
  const THREAD = '22222222-2222-4222-8222-222222222222';
  const RELEASE = 'pinned-release';
  const BUNDLE = 'pinned-bundle';

  function ports() {
    return {
      resolvedSubjectId: SUBJECT,
      threadId: THREAD,
      contentEntry: {
        release: { releaseId: RELEASE, bundleId: BUNDLE },
        characters: { characters: [{ characterId: 'seyeon', capabilities: [] }] },
        world: { characterRelations: [] },
      } as unknown as ContentReleaseRuntimeEntry,
      threadBindingAuthorityPort: { readRuntimeBinding: async () => [{
        threadId: THREAD, status: 'active', contentRevision: 2,
        activeContentReleaseId: RELEASE, activeContentBundleId: BUNDLE,
        participantCharacterIds: ['seyeon'],
      }] },
      relationshipAuthorityPort: { readCurrentRelationship: async () => [{
        stateId: '33333333-3333-4333-8333-333333333333',
        characterId: 'seyeon', closeness: 10, trust: 15, friction: 5,
        relationshipStage: 'initial', revision: 1, policyVersion: 'v1',
        lastInteractionAt: null, updatedAt: '2026-10-09T00:00:00Z',
      }] },
      memoryItemsAuthorityPort: { readCurrentItems: async () => [] },
      memoryGrantsAuthorityPort: { readActiveGrants: async () => [] },
      nonMemoryContextAuthorityPort: { readGrantedLifeFacts: async () => [] },
      contextInput: ({ relationshipProjectionPolicy: { version: 'v1' } } as unknown as CharacterStandardReadingServerContextInputV1),
    };
  }

  it('builds pinned non-Saju context for a Reader with zero specialist capabilities', async () => {
    const input = ports();
    const base = await prepareCharacterStandardReadingServerBaseContextV2(input);
    expect(base.threadBinding.activeContentReleaseId).toBe(RELEASE);
    expect(base.contextInput.character.characterId).toBe('seyeon');
    expect(base.contextInput.character.capabilities).toEqual([]);
    expect(base.contextInput.contentBundleId).toBe(BUNDLE);
    expect(base.contextInput.recentMessages).toEqual([]);
    expect(base.contextInput.grantedMemories).toEqual([]);
    expect('saju' in base.contextInput).toBe(false);
  });

  it('rejects a forged Saju context before reading server authority', async () => {
    const input = ports();
    await expect(prepareCharacterStandardReadingServerBaseContextV2({
      ...input,
      contextInput: ({ ...input.contextInput, saju: { readingRef: 'forged' } } as CharacterStandardReadingServerContextInputV1),
      threadBindingAuthorityPort: {
        readRuntimeBinding: async () => { throw new Error('must not query'); },
      },
    })).rejects.toThrow('caller-supplied saju authority');
  });
});
