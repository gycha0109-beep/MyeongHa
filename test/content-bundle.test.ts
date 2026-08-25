import { describe, expect, it } from 'vitest';
import { buildCharacterContentManifest, validateCharacterContentBundle } from '../packages/character-content/src/index.js';
import { validateWorldContentBundle } from '../packages/world-content/src/index.js';
import { DEV_CHARACTER_CONTENT_BUNDLE, DEV_WORLD_CONTENT_BUNDLE } from '../packages/test-fixtures/src/index.js';

describe('immutable content bundle validation', () => {
  it('accepts the coherent placeholder character/world bundle', () => {
    expect(validateCharacterContentBundle(DEV_CHARACTER_CONTENT_BUNDLE)).toBe(DEV_CHARACTER_CONTENT_BUNDLE);
    expect(validateWorldContentBundle(DEV_WORLD_CONTENT_BUNDLE, DEV_CHARACTER_CONTENT_BUNDLE)).toBe(DEV_WORLD_CONTENT_BUNDLE);
  });

  it('creates a deterministic manifest for the immutable character bundle', () => {
    const first = buildCharacterContentManifest(DEV_CHARACTER_CONTENT_BUNDLE);
    const second = buildCharacterContentManifest(DEV_CHARACTER_CONTENT_BUNDLE);
    expect(first).toEqual(second);
    expect(first.characterIds).toEqual([
      'john-doe-01',
      'john-doe-02',
      'john-doe-03',
      'john-doe-04',
      'john-doe-05',
    ]);
    expect(first.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it('rejects a world relation that points outside the same character bundle', () => {
    expect(() =>
      validateWorldContentBundle(
        {
          ...DEV_WORLD_CONTENT_BUNDLE,
          characterRelations: [
            {
              fromCharacterId: 'john-doe-01',
              toCharacterId: 'future-character',
              relationType: 'invalid',
              summary: 'must fail',
            },
          ],
        },
        DEV_CHARACTER_CONTENT_BUNDLE,
      ),
    ).toThrow(/outside bundle/u);
  });

  it('rejects duplicate character ids', () => {
    expect(() =>
      validateCharacterContentBundle({
        ...DEV_CHARACTER_CONTENT_BUNDLE,
        characters: [
          DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!,
          DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!,
        ],
      }),
    ).toThrow(/duplicate/u);
  });
});
