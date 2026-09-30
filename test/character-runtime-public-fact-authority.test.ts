import { describe, expect, it } from 'vitest';
import type { CharacterContentDefinition } from '../packages/character-content/src/index.js';
import {
  assembleCharacterRuntimeContext,
} from '../packages/domain/src/index.js';
import {
  attachServerAuthorizedCharacterPublicFactsV1,
} from '../packages/domain/src/character-runtime-context.js';
import { DEV_CHARACTER_CONTENT_BUNDLE } from '../packages/test-fixtures/src/index.js';

function authoredCharacter(): CharacterContentDefinition {
  const base = DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!;
  return {
    ...base,
    characterId: 'seyeon',
    displayName: '세연',
    representativeTitle: 'test-representative',
    emotionIds: ['neutral'],
    animationCueIds: ['idle'],
    developmentPlaceholder: undefined as never,
  };
}

function runtimeContext() {
  const character = authoredCharacter();
  return assembleCharacterRuntimeContext({
    character,
    contentBundleId: 'bundle-public-fact-test',
    relationshipState: {
      closeness: 0,
      trust: 0,
      friction: 0,
      stage: 'source-unresolved-stage',
      revision: 1,
      policyVersion: 'relationship-policy-test',
    },
    recentRelationshipEventKeys: [],
    relationshipProjectionPolicy: {
      version: 'relationship-render-test',
      closeness: { lowMax: 20, mediumMax: 60 },
      trust: { lowMax: 20, mediumMax: 60 },
      friction: { lowMax: 20, mediumMax: 60 },
    },
    worldRelations: [],
    grantedLifeFacts: [],
    grantedMemories: [],
    recentMessages: [],
  });
}

describe('Character Runtime public fact source authority', () => {
  it('starts direct/general runtime assembly with no public Character facts', () => {
    const context = runtimeContext();
    expect(context.publicCharacterFacts).toEqual([]);
  });

  it('attaches only server-authorized resolved facts scoped to the active Character', () => {
    const context = runtimeContext();
    const attached = attachServerAuthorizedCharacterPublicFactsV1(context, [{
      characterId: 'seyeon',
      factKey: 'identity.birthday',
      sourceAuthority: 'CANON',
      value: '3월 18일',
      sourceReleaseId: 'release-public-fact-test',
      sourceSection: 'B1',
      sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
      sourceBibleRevision: 'source-revision-test',
    }]);

    expect(context.publicCharacterFacts).toEqual([]);
    expect(attached.publicCharacterFacts).toEqual([{
      factKey: 'identity.birthday',
      sourceAuthority: 'CANON',
      value: '3월 18일',
      sourceReleaseId: 'release-public-fact-test',
      sourceSection: 'B1',
      sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
      sourceBibleRevision: 'source-revision-test',
    }]);
  });

  it('rejects a fact belonging to another Character', () => {
    expect(() =>
      attachServerAuthorizedCharacterPublicFactsV1(runtimeContext(), [{
        characterId: 'yeoul',
        factKey: 'identity.birthday',
        sourceAuthority: 'CANON',
        value: 'test',
        sourceReleaseId: 'release-public-fact-test',
        sourceSection: 'B1',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'source-revision-test',
      }]),
    ).toThrow(/not scoped to the active character/u);
  });

  it('rejects unresolved source authority and duplicate fact keys', () => {
    expect(() =>
      attachServerAuthorizedCharacterPublicFactsV1(runtimeContext(), [{
        characterId: 'seyeon',
        factKey: 'principle_calling.binding',
        sourceAuthority: 'WORLD_DEPENDENT' as never,
        value: 'must-not-enter-runtime',
        sourceReleaseId: 'release-public-fact-test',
        sourceSection: 'World/Principle-Calling',
        sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
        sourceBibleRevision: 'source-revision-test',
      }]),
    ).toThrow(/sourceAuthority is not resolved/u);

    const duplicate = {
      characterId: 'seyeon',
      factKey: 'identity.name',
      sourceAuthority: 'CANON' as const,
      value: '세연',
      sourceReleaseId: 'release-public-fact-test',
      sourceSection: 'B1',
      sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
      sourceBibleRevision: 'source-revision-test',
    };

    expect(() =>
      attachServerAuthorizedCharacterPublicFactsV1(runtimeContext(), [
        duplicate,
        duplicate,
      ]),
    ).toThrow(/Duplicate public Character fact key/u);
  });
});
