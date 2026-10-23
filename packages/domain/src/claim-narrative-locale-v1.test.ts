import { describe, expect, it } from 'vitest';
import { selectClaimNarrativeLocaleTemplateV1, type ClaimNarrativeProfileV1 } from './claim-narrative-locale-v1.js';

const profile: ClaimNarrativeProfileV1 = {
  profileId: 'sample-not-production',
  version: 'draft-v1',
  claimType: 'illustrative-claim',
  semanticKeys: ['illustrative-key'],
  allowedEpistemicTypes: ['traditional-interpretation'],
  requiredMethodAttribution: true,
  templates: [
    { templateKey: 'main', language: 'ko-KR', text: '검증 예시 문구' },
    { templateKey: 'main', language: 'ja-JP', text: '検証用の例文' },
  ],
};
const base = { profile, claimType: 'illustrative-claim', semanticKey: 'illustrative-key',
  epistemicType: 'traditional-interpretation', templateKey: 'main' };
describe('ClaimNarrativeProfile locale template selector', () => {
  it('uses only a matching versioned source-owned template', () => {
    expect(selectClaimNarrativeLocaleTemplateV1({ ...base, locale: 'ja-JP' })).toEqual({
      state: 'selected', profileId: 'sample-not-production', version: 'draft-v1',
      semanticKey: 'illustrative-key', language: 'ja-JP', templateKey: 'main', text: '検証用の例文',
    });
  });
  it('never silently falls back to Korean or invents a translation', () => {
    expect(selectClaimNarrativeLocaleTemplateV1({ ...base, locale: 'zh-TW' })).toEqual({
      state: 'unavailable', reason: 'template_missing',
    });
    expect(selectClaimNarrativeLocaleTemplateV1({ ...base, locale: 'en-US' })).toEqual({
      state: 'unavailable', reason: 'unsupported_locale',
    });
  });
  it('refuses unauthorized epistemic, semantic, or claim types', () => {
    for (const changes of [{ claimType: 'different' }, { semanticKey: 'other-key' }, { epistemicType: 'fact' }]) {
      expect(selectClaimNarrativeLocaleTemplateV1({ ...base, ...changes, locale: 'ja-JP' })).toEqual({
        state: 'unavailable', reason: 'claim_not_admitted',
      });
    }
  });
  it('rejects conflicting language versions instead of picking arbitrarily', () => {
    const duplicateProfile = { ...profile, templates: [...profile.templates!, profile.templates![1]!] };
    expect(selectClaimNarrativeLocaleTemplateV1({ ...base, profile: duplicateProfile, locale: 'ja-JP' })).toEqual({
      state: 'unavailable', reason: 'template_ambiguous',
    });
  });
});
