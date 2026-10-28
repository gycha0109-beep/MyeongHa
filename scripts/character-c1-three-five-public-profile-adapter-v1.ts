import { CHARACTER_RUNTIME_AUTHORING_V1 } from '../packages/character-content/src/runtime-authoring-v1.js';

/** Existing authored C1 public persona/behavior only, not a new per-person prompt. */
const IDS = Object.freeze(['seyeon', 'yeoul', 'taegyeom'] as const);
export function getC1PublicComparisonProfilesV1() {
  const profiles = IDS.map(characterId => {
    const authored = CHARACTER_RUNTIME_AUTHORING_V1.find(c => c.characterId === characterId);
    if (!authored || !authored.persona || !authored.behavior || !authored.speech ||
        !Array.isArray(authored.behavior.rules) || authored.behavior.rules.length < 1) {
      throw new Error('C1_PUBLIC_AUTHORING_NOT_READY_' + characterId);
    }
    return Object.freeze({
      characterId,
      displayName: authored.displayName,
      speech: authored.speech,
      persona: authored.persona,
      behavior: authored.behavior,
    });
  });
  if (profiles.length !== 3 ||
      new Set(profiles.map(x => x.characterId)).size !== 3) {
    throw new Error('C1_COMPARISON_ROSTER_MISMATCH');
  }
  return Object.freeze(profiles);
}
