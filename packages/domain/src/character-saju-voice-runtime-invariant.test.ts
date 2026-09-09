import { describe, expect, it } from 'vitest';

import {
  CHARACTER_RUNTIME_AUTHORING_V1,
  resolveCharacterVoiceAuthorityV1,
} from '../../character-content/src/index.js';
import {
  assertCharacterSajuVoiceRuntimeInvariantV1,
  guardCharacterSajuSafeRendererOutput,
} from './character-saju-safe-renderer.js';
import type { CharacterRuntimeContextV1 } from './character-runtime-context.js';

function makeDoyunSajuContext(): CharacterRuntimeContextV1 {
  const definition = CHARACTER_RUNTIME_AUTHORING_V1.find(
    (candidate) => candidate.characterId === 'doyun',
  );
  if (definition === undefined) throw new Error('doyun runtime authoring fixture is required');

  const contentVersion = 'test-published-doyun-v1';
  const voiceAuthority = resolveCharacterVoiceAuthorityV1(
    {
      characterId: definition.characterId,
      contentVersion,
      speech: definition.speech,
      persona: definition.persona,
    },
    'saju_product',
  );

  return {
    characterId: definition.characterId,
    contentVersion,
    speech: definition.speech,
    persona: definition.persona,
    voiceAuthority,
    saju: {},
  } as unknown as CharacterRuntimeContextV1;
}

describe('Character Saju voice runtime invariant v1', () => {
  it('accepts the exact published Character voice objects for a Saju turn', () => {
    expect(() => assertCharacterSajuVoiceRuntimeInvariantV1(makeDoyunSajuContext())).not.toThrow();
  });

  it('fails closed on cross-Character voice authority before renderer output parsing', () => {
    const context = makeDoyunSajuContext();
    const forgedContext = {
      ...context,
      voiceAuthority: {
        ...context.voiceAuthority,
        characterId: 'yeoul',
      },
    } as CharacterRuntimeContextV1;

    expect(() =>
      guardCharacterSajuSafeRendererOutput({
        rawOutput: null,
        context: forgedContext,
        allowedSuggestedActionKeys: [],
      }),
    ).toThrow('Saju renderer voice authority does not match the active Character.');
  });

  it('fails closed on a stale published content version', () => {
    const context = makeDoyunSajuContext();
    const forgedContext = {
      ...context,
      voiceAuthority: {
        ...context.voiceAuthority,
        contentVersion: 'test-published-doyun-v0',
      },
    } as CharacterRuntimeContextV1;

    expect(() => assertCharacterSajuVoiceRuntimeInvariantV1(forgedContext)).toThrow(
      'Saju renderer voice authority does not match the active Character content version.',
    );
  });

  it('fails closed when a general-chat authority is surface-swapped into Saju', () => {
    const context = makeDoyunSajuContext();
    const forgedContext = {
      ...context,
      voiceAuthority: {
        ...context.voiceAuthority,
        surface: 'general_chat',
      },
    } as CharacterRuntimeContextV1;

    expect(() => assertCharacterSajuVoiceRuntimeInvariantV1(forgedContext)).toThrow(
      'Saju renderer voice authority surface must be saju_product.',
    );
  });

  it('rejects a cloned speech object even when its values are otherwise identical', () => {
    const context = makeDoyunSajuContext();
    const forgedContext = {
      ...context,
      speech: { ...context.speech },
    } as CharacterRuntimeContextV1;

    expect(() => assertCharacterSajuVoiceRuntimeInvariantV1(forgedContext)).toThrow(
      'Saju renderer must use the exact published Character speech object for the turn.',
    );
  });

  it('rejects a cloned communication object even when its values are otherwise identical', () => {
    const context = makeDoyunSajuContext();
    const forgedContext = {
      ...context,
      persona: {
        ...context.persona,
        communication: { ...context.persona.communication },
      },
    } as CharacterRuntimeContextV1;

    expect(() => assertCharacterSajuVoiceRuntimeInvariantV1(forgedContext)).toThrow(
      'Saju renderer must use the exact published Character communication object for the turn.',
    );
  });
});
