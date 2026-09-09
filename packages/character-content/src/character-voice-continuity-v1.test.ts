import { describe, expect, it } from 'vitest';

import {
  CHARACTER_RUNTIME_AUTHORING_V1_CHARACTER_IDS,
} from './runtime-authoring-v1.js';
import {
  CHARACTER_SAJU_VOICE_CONTINUITY_POLICY_V1,
  CHARACTER_VOICE_AUTHORITY_VERSION_V1,
  resolveCharacterVoiceAuthorityV1,
  validateCharacterVoiceContinuityV1,
} from './character-voice-continuity-v1.js';

describe('Character/Saju voice continuity v1', () => {
  it('resolves general chat and Saju products to the exact same authored voice objects', () => {
    for (const characterId of CHARACTER_RUNTIME_AUTHORING_V1_CHARACTER_IDS) {
      const general = resolveCharacterVoiceAuthorityV1(characterId, 'general_chat');
      const saju = resolveCharacterVoiceAuthorityV1(characterId, 'saju_product');

      expect(general.sourceVersion).toBe(CHARACTER_VOICE_AUTHORITY_VERSION_V1);
      expect(saju.sourceVersion).toBe(CHARACTER_VOICE_AUTHORITY_VERSION_V1);
      expect(saju.speech).toBe(general.speech);
      expect(saju.communication).toBe(general.communication);
    }
  });

  it('forbids a product-specific Saju voice while preserving semantic and visual channel boundaries', () => {
    expect(CHARACTER_SAJU_VOICE_CONTINUITY_POLICY_V1).toEqual({
      voiceAuthority: 'shared_runtime_authoring',
      sajuSpecificVoiceOverride: 'forbidden',
      protectedSemanticPayload: 'immutable',
      unauthorizedRealityInference: 'forbidden',
      stageDirectionInSpeech: 'forbidden',
      visualReactionChannel: 'emotion_animation_cue_only',
    });
  });

  it('fails closed when the rendered voice authority does not match the selected Character', () => {
    const result = validateCharacterVoiceContinuityV1({
      characterId: 'doyun',
      surface: 'saju_product',
      voiceAuthorityCharacterId: 'yeoul',
      voiceAuthorityVersion: CHARACTER_VOICE_AUTHORITY_VERSION_V1,
    });

    expect(result.ok).toBe(false);
    expect(result.violations.map((violation) => violation.code)).toContain(
      'VOICE_AUTHORITY_MISMATCH',
    );
  });

  it('fails closed when a Saju product requests a separate Character voice override', () => {
    const result = validateCharacterVoiceContinuityV1({
      characterId: 'doyun',
      surface: 'saju_product',
      voiceAuthorityCharacterId: 'doyun',
      voiceAuthorityVersion: CHARACTER_VOICE_AUTHORITY_VERSION_V1,
      sajuVoiceOverrideRequested: true,
    });

    expect(result.ok).toBe(false);
    expect(result.violations.map((violation) => violation.code)).toEqual([
      'SAJU_VOICE_OVERRIDE_FORBIDDEN',
    ]);
  });

  it('rejects reality-specific business wording when no user context authorizes it', () => {
    const result = validateCharacterVoiceContinuityV1({
      characterId: 'doyun',
      surface: 'saju_product',
      voiceAuthorityCharacterId: 'doyun',
      voiceAuthorityVersion: CHARACTER_VOICE_AUTHORITY_VERSION_V1,
      introducedRealityFactKeys: [
        'business.metric.click',
        'business.metric.inquiry',
        'business.metric.payment',
      ],
      authorizedRealityFactKeys: [],
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({ code: 'UNAUTHORIZED_REALITY_FACT', value: 'business.metric.click' }),
      expect.objectContaining({ code: 'UNAUTHORIZED_REALITY_FACT', value: 'business.metric.inquiry' }),
      expect.objectContaining({ code: 'UNAUTHORIZED_REALITY_FACT', value: 'business.metric.payment' }),
    ]);
  });

  it('allows reality-specific wording only when the same fact keys are explicitly authorized', () => {
    const result = validateCharacterVoiceContinuityV1({
      characterId: 'doyun',
      surface: 'saju_product',
      voiceAuthorityCharacterId: 'doyun',
      voiceAuthorityVersion: CHARACTER_VOICE_AUTHORITY_VERSION_V1,
      introducedRealityFactKeys: ['business.metric.click'],
      authorizedRealityFactKeys: ['business.metric.click'],
    });

    expect(result).toEqual({ ok: true, violations: [] });
  });

  it('rejects prose stage directions so pose and expression stay in visual runtime cues', () => {
    const result = validateCharacterVoiceContinuityV1({
      characterId: 'doyun',
      surface: 'saju_product',
      voiceAuthorityCharacterId: 'doyun',
      voiceAuthorityVersion: CHARACTER_VOICE_AUTHORITY_VERSION_V1,
      proseStageDirections: ['팔짱을 낀다', '피식 웃는다'],
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({ code: 'STAGE_DIRECTION_IN_SPEECH', value: '팔짱을 낀다' }),
      expect.objectContaining({ code: 'STAGE_DIRECTION_IN_SPEECH', value: '피식 웃는다' }),
    ]);
  });

  it('passes a clean Saju render contract without inventing product voice or reality facts', () => {
    const result = validateCharacterVoiceContinuityV1({
      characterId: 'yeoul',
      surface: 'saju_product',
      voiceAuthorityCharacterId: 'yeoul',
      voiceAuthorityVersion: CHARACTER_VOICE_AUTHORITY_VERSION_V1,
      sajuVoiceOverrideRequested: false,
      introducedRealityFactKeys: [],
      authorizedRealityFactKeys: [],
      proseStageDirections: [],
    });

    expect(result).toEqual({ ok: true, violations: [] });
  });
});
