import { describe, expect, it } from 'vitest';
import type { CharacterContentDefinition } from '../packages/character-content/src/index.js';
import {
  assembleCharacterRuntimeContext,
} from '../packages/domain/src/index.js';
import {
  attachServerAuthorizedCharacterPublicFactsV1,
} from '../packages/domain/src/character-runtime-context.js';
import {
  CHARACTER_RUNTIME_AUTHORING_V1,
} from '../packages/character-content/src/runtime-authoring-v1.js';

function authoredCharacter(): CharacterContentDefinition {
  const runtime = CHARACTER_RUNTIME_AUTHORING_V1.find(
    (entry) => entry.characterId === 'seyeon',
  );
  if (runtime === undefined) throw new Error('Missing Seyeon runtime authoring fixture.');

  return {
    characterId: 'seyeon',
    contentVersion: 'public-fact-runtime-test-v1',
    displayName: runtime.displayName,
    representativeTitle: 'runtime_test_representative',
    shortDescriptor: 'public fact runtime authority test only',
    personalityTraits: ['observant'],
    flaws: ['overchecks boundaries'],
    values: ['truth'],
    speech: runtime.speech,
    capabilities: runtime.capabilities,
    assetRefs: [],
    emotionIds: ['neutral'],
    animationCueIds: ['idle'],
    canon: {
      worldRole: 'test representative',
      origin: 'test fixture',
      apparentAgeBand: 'adult',
      callingBond: {
        authorityState: 'world_dependent',
        note: 'Test fixture intentionally leaves Principle/Calling unresolved.',
      },
      worldview: {
        coreValues: ['truth'],
        humanTheory: 'People retain agency.',
        agencyTheory: 'People choose for themselves.',
        truthTheory: 'Claims require provenance.',
      },
      psychology: {
        desire: 'Help without replacing choice.',
        fear: 'Overstepping authority.',
        flaw: 'Overchecks boundaries.',
        contradiction: 'Acts quickly but guards authority.',
        hiddenMotivation: 'Keep the interaction grounded.',
      },
    },
    persona: runtime.persona,
    behavior: runtime.behavior,
    sajuProfile: runtime.sajuProfile,
    relationshipBehavior: runtime.relationshipBehavior,
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
