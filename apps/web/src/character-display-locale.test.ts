import { describe, it, expect } from 'vitest';
import { CANONICAL_CHARACTER_IDS_V1, resolveCanonicalCharacterPresentationV1 } from '../character-presentation-identity.js';
import { CHARACTER_DISPLAY_NAMES_V1, resolveCharacterDisplayNameV1 } from '../character-display-locale.js';
describe('temporary international character names', () => {
  it('covers all canonical characters and leaves their IDs untouched', () => {
    expect(Object.keys(CHARACTER_DISPLAY_NAMES_V1).sort()).toEqual([...CANONICAL_CHARACTER_IDS_V1].sort());
    for (const id of CANONICAL_CHARACTER_IDS_V1) {
      expect(resolveCharacterDisplayNameV1(id,'ko-KR')).toBe(resolveCanonicalCharacterPresentationV1(id)?.name);
      expect(resolveCharacterDisplayNameV1(id,'ja-JP')).toMatch(/^[\u30A0-\u30FFー]+$/u);
      expect(resolveCharacterDisplayNameV1(id,'zh-TW')).toMatch(/^[A-Za-z]+$/u);
    }
  });
  it('does not fabricate unknown identities', () => {
    expect(resolveCharacterDisplayNameV1('unknown','ja-JP')).toBeNull();
    expect(resolveCharacterDisplayNameV1('__proto__','zh-TW')).toBeNull();
    expect(resolveCharacterDisplayNameV1(null,'zh-TW')).toBeNull();
  });
  it('uses the user-approved temporary script convention', () => {
    expect(resolveCharacterDisplayNameV1('seyeon','ja-JP')).toBe('セヨン');
    expect(resolveCharacterDisplayNameV1('seyeon','zh-TW')).toBe('Seyeon');
    expect(resolveCharacterDisplayNameV1('taegyeom','ja-JP')).toBe('テギョム');
  });
});
