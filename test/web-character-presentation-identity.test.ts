import { describe, expect, it } from 'vitest';

import {
  CANONICAL_CHARACTER_IDS_V1,
  resolveCanonicalCharacterPresentationKeyV1,
  resolveCanonicalCharacterPresentationV1,
} from '../apps/web/character-presentation-identity.js';

describe('canonical Character presentation identity', () => {
  it('maps the approved exact-nine English ids by equality', () => {
    expect(CANONICAL_CHARACTER_IDS_V1).toEqual([
      'seyeon',
      'yeoul',
      'seorin',
      'rahyeon',
      'mira',
      'taegyeom',
      'yunho',
      'doyun',
      'baekheon',
    ]);

    for (const characterId of CANONICAL_CHARACTER_IDS_V1) {
      expect(resolveCanonicalCharacterPresentationKeyV1(characterId)).toBe(characterId);
    }
  });

  it('retires the legacy doyoon identity spelling and fails unknown ids closed', () => {
    expect(resolveCanonicalCharacterPresentationV1('doyoon')).toBeNull();
    expect(resolveCanonicalCharacterPresentationV1('unknown')).toBeNull();
    expect(resolveCanonicalCharacterPresentationV1(' 도윤 ')).toBeNull();
  });
});
