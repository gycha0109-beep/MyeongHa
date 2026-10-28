import { CHARACTER_RUNTIME_AUTHORING_V1 } from '../packages/character-content/src/runtime-authoring-v1.js';
import { CHARACTER_IMMUTABLE_AUTHORING_V1 } from '../packages/character-content/src/immutable-authoring-v1.js';
import {
  composeCharacterDialogueContinuityPlanShadowV1,
  type CharacterDialogueMessageShadowV1,
} from '../packages/domain/src/character-dialogue-continuity-shadow-v1.js';

/**
 * C1 authored research projection. Neither this definition nor the standalone
 * paid runner has authority to claim that a Production Runtime is active.
 * In particular, Yeoul/ Taegyeom must not be marked Production-ready
 * merely because typed authoring exists.
 */
export const C1_PUBLIC_THREE_FIVE_RESEARCH_IDS_V1 =
  Object.freeze(['seyeon', 'yeoul', 'taegyeom'] as const);

export function getC1PublicComparisonProfilesV1() {
  const profiles = C1_PUBLIC_THREE_FIVE_RESEARCH_IDS_V1.map(characterId => {
    const authored = CHARACTER_RUNTIME_AUTHORING_V1.find(c => c.characterId === characterId);
    const identity = CHARACTER_IMMUTABLE_AUTHORING_V1.find(c => c.characterId === characterId);
    if (!authored || !identity ||
        authored.displayName !== identity.displayName ||
        !authored.persona || !authored.behavior || !authored.speech ||
        !Array.isArray(authored.behavior.rules) ||
        authored.behavior.rules.length < 1 ||
        identity.values.length < 1 || identity.flaws.length < 1) {
      throw new Error('C1_RESEARCH_AUTHORING_INCOMPLETE_' + characterId);
    }
    return Object.freeze({
      characterId,
      displayName: identity.displayName,
      sourceKind: 'REVIEWED_PUBLIC_AUTHORING_NOT_LIVE_RUNTIME' as const,
      sourcePaths: Object.freeze([
        'packages/character-content/src/runtime-authoring-v1.ts',
        'packages/character-content/src/immutable-authoring-v1.ts',
      ]),
      // Intentionally exclude deprecated occupation/worldRole and private
      // biography: approved late Taegyeom occupation updates have a separate
      // source and should not be overwritten by old global identity labels.
      publicIdentity: Object.freeze({
        personalityTraits: Object.freeze([...identity.personalityTraits]),
        values: Object.freeze([...identity.values]),
        flaws: Object.freeze([...identity.flaws]),
        acceptedDoctrine: Object.freeze([...identity.deityBond.acceptedDoctrine]),
        resistedDoctrine: Object.freeze([...identity.deityBond.resistedDoctrine]),
      }),
      speech: authored.speech,
      persona: authored.persona,
      behavior: authored.behavior,
    });
  });
  if (profiles.length !== 3 ||
      new Set(profiles.map(p => p.characterId)).size !== 3) {
    throw new Error('C1_COMPARISON_ROSTER_MISMATCH');
  }
  return Object.freeze(profiles);
}

/**
 * For turns 2..5, compose the ACTUAL shared C1 continuity decision plan
 * from exactly the generated previous utterances. The model cannot nominate
 * a character, change the source, or invent a prior assistant response.
 *
 * Turn 1 intentionally has no C1 continuity plan because there is no
 * previous assistant utterance. Do not synthesize one to satisfy the bounded
 * database-backed continuity contract.
 */
export function buildC1PublicComparisonPlanV1(input: Readonly<{
  profile: ReturnType<typeof getC1PublicComparisonProfilesV1>[number];
  previousDialogue: readonly Readonly<{ role: 'user' | 'assistant'; text: string }>[];
  currentUserText: string;
}>) {
  const { profile, previousDialogue, currentUserText } = input;
  if (!C1_PUBLIC_THREE_FIVE_RESEARCH_IDS_V1.some(id => id === profile.characterId) ||
      typeof currentUserText !== 'string' || !currentUserText.trim() ||
      previousDialogue.length > 8 || previousDialogue.length % 2 !== 0 ||
      previousDialogue.some((item, i) =>
        item.role !== (i % 2 === 0 ? 'user' : 'assistant') ||
        !item.text || !item.text.trim() || item.text.length > 1200)) {
    throw new Error('C1_COMPARISON_DIALOGUE_NOT_ELIGIBLE');
  }
  if (previousDialogue.length === 0) {
    return Object.freeze({
      turnKind: 'FIRST_USER_TURN_NO_PRIOR_ASSISTANT' as const,
      plan: null,
    });
  }
  const recentConversation: CharacterDialogueMessageShadowV1[] =
    previousDialogue.map((m, i) => ({
      role: m.role,
      text: m.text,
      messageId: `research:${profile.characterId}:${i}`,
    }));
  recentConversation.push({
    role: 'user',
    text: currentUserText,
    messageId: `research:${profile.characterId}:${previousDialogue.length}`,
  });
  const plan = composeCharacterDialogueContinuityPlanShadowV1({
    voice: {
      characterId: profile.characterId,
      speech: profile.speech,
      persona: profile.persona,
      behavior: profile.behavior,
    },
    recentConversation,
  });
  return Object.freeze({
    turnKind: 'C1_BOUNDED_CONTINUITY_RESEARCH' as const,
    plan,
  });
}
