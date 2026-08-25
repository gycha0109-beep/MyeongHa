import { describe, expect, it } from 'vitest';
import { buildCharacterContentManifest, validateCharacterContentBundle } from '../packages/character-content/src/index.js';
import { buildCoherentContentRelease, buildWorldContentManifest, validateWorldContentBundle } from '../packages/world-content/src/index.js';
import { DEV_CHARACTER_CONTENT_BUNDLE, DEV_WORLD_CONTENT_BUNDLE } from '../packages/test-fixtures/src/index.js';

describe('immutable content bundle validation', () => {
  it('accepts the coherent placeholder character/world bundle', () => {
    expect(validateCharacterContentBundle(DEV_CHARACTER_CONTENT_BUNDLE)).toBe(DEV_CHARACTER_CONTENT_BUNDLE);
    expect(validateWorldContentBundle(DEV_WORLD_CONTENT_BUNDLE, DEV_CHARACTER_CONTENT_BUNDLE)).toBe(DEV_WORLD_CONTENT_BUNDLE);
  });

  it('creates deterministic manifests and a coherent release', () => {
    const characterManifestA = buildCharacterContentManifest(DEV_CHARACTER_CONTENT_BUNDLE);
    const characterManifestB = buildCharacterContentManifest(DEV_CHARACTER_CONTENT_BUNDLE);
    const worldManifestA = buildWorldContentManifest(DEV_WORLD_CONTENT_BUNDLE, DEV_CHARACTER_CONTENT_BUNDLE);
    const worldManifestB = buildWorldContentManifest(DEV_WORLD_CONTENT_BUNDLE, DEV_CHARACTER_CONTENT_BUNDLE);
    expect(characterManifestA).toEqual(characterManifestB);
    expect(worldManifestA).toEqual(worldManifestB);
    expect(characterManifestA.characterIds).toEqual(['john-doe-01','john-doe-02','john-doe-03','john-doe-04','john-doe-05']);
    expect(characterManifestA.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(worldManifestA).toMatchObject({ bundleId: 'dev-content-bundle-0001', contentVersion: '0.0.1-dev', episodeIds: ['dev-first-contact'], relationCount: 1 });
    expect(worldManifestA.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(buildCoherentContentRelease('dev-release-0001', characterManifestA, worldManifestA)).toMatchObject({ releaseId: 'dev-release-0001', bundleId: 'dev-content-bundle-0001', contentVersion: '0.0.1-dev' });
  });

  it('rejects a world relation that points outside the same character bundle', () => {
    expect(() => validateWorldContentBundle({ ...DEV_WORLD_CONTENT_BUNDLE, characterRelations: [{ fromCharacterId: 'john-doe-01', toCharacterId: 'future-character', relationType: 'unknown', summary: 'must fail' }] }, DEV_CHARACTER_CONTENT_BUNDLE)).toThrow(/outside bundle/u);
  });

  it('rejects duplicate character ids', () => {
    expect(() => validateCharacterContentBundle({ ...DEV_CHARACTER_CONTENT_BUNDLE, characters: [DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!, DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!] })).toThrow(/duplicate/u);
  });

  it('rejects incoherent world and character bundle versions', () => {
    expect(() => validateWorldContentBundle({ ...DEV_WORLD_CONTENT_BUNDLE, contentVersion: '0.0.2-dev' }, DEV_CHARACTER_CONTENT_BUNDLE)).toThrow(/contentVersion must match/u);
  });

  it('rejects a character or episode version that drifts from its bundle', () => {
    expect(() => validateCharacterContentBundle({ ...DEV_CHARACTER_CONTENT_BUNDLE, characters: [{ ...DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!, contentVersion: '0.0.2-dev' }] })).toThrow(/must match bundle contentVersion/u);
    expect(() => validateWorldContentBundle({ ...DEV_WORLD_CONTENT_BUNDLE, episodes: [{ ...DEV_WORLD_CONTENT_BUNDLE.episodes[0]!, contentVersion: '0.0.2-dev' }] }, DEV_CHARACTER_CONTENT_BUNDLE)).toThrow(/must match world contentVersion/u);
  });

  it('rejects empty episode participants or character capabilities', () => {
    expect(() => validateWorldContentBundle({ ...DEV_WORLD_CONTENT_BUNDLE, episodes: [{ ...DEV_WORLD_CONTENT_BUNDLE.episodes[0]!, participants: [] }] }, DEV_CHARACTER_CONTENT_BUNDLE)).toThrow(/participants must not be empty/u);
    expect(() => validateCharacterContentBundle({ ...DEV_CHARACTER_CONTENT_BUNDLE, characters: [{ ...DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!, capabilities: [] }] })).toThrow(/capabilities must not be empty/u);
  });

  it('rejects character speech content that can alter Saju semantics', () => {
    expect(() => validateCharacterContentBundle({ ...DEV_CHARACTER_CONTENT_BUNDLE, characters: [{ ...DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!, speech: { ...DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!.speech, forbiddenBehaviors: [] } }] })).toThrow(/must forbid alter_saju_semantics/u);
  });

  it('rejects incoherent release manifests', () => {
    const characters = buildCharacterContentManifest(DEV_CHARACTER_CONTENT_BUNDLE);
    const world = buildWorldContentManifest(DEV_WORLD_CONTENT_BUNDLE, DEV_CHARACTER_CONTENT_BUNDLE);
    expect(() => buildCoherentContentRelease('dev-release-invalid', characters, { ...world, bundleId: 'other-bundle' })).toThrow(/share bundleId/u);
  });

  it('allows placeholder metadata but requires authored personality once placeholder flag is removed', () => {
    expect(() => validateCharacterContentBundle({
      ...DEV_CHARACTER_CONTENT_BUNDLE,
      characters: [{ ...DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!, developmentPlaceholder: undefined, personalityTraits: [] }],
    })).toThrow(/personalityTraits must not be empty/u);
  });
});
