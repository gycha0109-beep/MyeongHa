import { describe, expect, it } from 'vitest';

import { SAJU_DOMAINS } from '../packages/contracts/src/index.js';
import type { CharacterCanonProfile } from '../packages/character-content/src/schema.js';
import {
  hasUnresolvedCharacterAuthority,
  INITIAL_CHARACTER_ROSTER_DRAFT_VERSION,
  INITIAL_CHARACTER_ROSTER_DRAFTS,
  type CharacterInitialRosterDraft,
} from '../packages/character-content/src/initial-roster.js';

const EXPECTED_IDS = [
  'seyeon',
  'yeoul',
  'seorin',
  'rahyeon',
  'mira_working',
  'taegyeom',
  'yunho',
  'doyoon',
  'baekheon',
] as const;

// Compile-time fail-closed guard: a C2 draft cannot be passed as Production canon
// while source-authority markers remain unresolved.
const draftCanonIsNotProductionCanon: CharacterInitialRosterDraft['canon'] extends CharacterCanonProfile
  ? never
  : true = true;
void draftCanonIsNotProductionCanon;

describe('C2 nine-character authoring draft', () => {
  it('materializes exactly the user-approved nine-character skeleton', () => {
    expect(INITIAL_CHARACTER_ROSTER_DRAFT_VERSION).toBe('c2-nine-roster-draft-v2');
    expect(INITIAL_CHARACTER_ROSTER_DRAFTS.map((draft) => draft.characterId)).toEqual(EXPECTED_IDS);
    expect(new Set(INITIAL_CHARACTER_ROSTER_DRAFTS.map((draft) => draft.characterId)).size).toBe(9);
  });

  it('keeps Mira explicitly working-name only', () => {
    const working = INITIAL_CHARACTER_ROSTER_DRAFTS.filter((draft) => draft.nameStatus === 'working');
    expect(working).toHaveLength(1);
    expect(working[0]?.characterId).toBe('mira_working');
    expect(working[0]?.displayName).toBe('미라');
  });

  it('records all prepared Saju domains for all nine without changing Saju semantic authority', () => {
    for (const draft of INITIAL_CHARACTER_ROSTER_DRAFTS) {
      expect(draft.sajuDomainAccess).toEqual(SAJU_DOMAINS);
      expect(new Set(draft.sajuDomainAccess).size).toBe(SAJU_DOMAINS.length);
      expect(draft.sajuProfile.attentionAxes.length).toBeGreaterThan(0);
      expect(draft.sajuProfile.followUpQuestionStrategies.length).toBeGreaterThan(0);
    }
  });

  it('locks the approved draft distinctions without claiming SRC-35 Production differentiation PASS', () => {
    // These exact-string uniqueness assertions are regression guards for the
    // user-approved skeleton only. They do NOT define roster-level comparison,
    // weighting, thresholds, semantic equivalence, or review authority; SRC-35
    // therefore remains OPEN/BLOCKING.
    const primaryAttentionAxis = INITIAL_CHARACTER_ROSTER_DRAFTS.map(
      (draft) => draft.sajuProfile.attentionAxes[0],
    );
    const primaryQuestionPriority = INITIAL_CHARACTER_ROSTER_DRAFTS.map(
      (draft) => draft.behavior.questionPriorities[0],
    );
    expect(new Set(primaryAttentionAxis).size).toBe(9);
    expect(new Set(primaryQuestionPriority).size).toBe(9);

    for (const draft of INITIAL_CHARACTER_ROSTER_DRAFTS) {
      expect(draft.canon.worldview.coreValues.length).toBeGreaterThanOrEqual(4);
      expect(draft.canon.worldview.humanTheory.trim()).not.toBe('');
      expect(draft.canon.psychology.flaw.trim()).not.toBe('');
      expect(draft.canon.psychology.hiddenMotivation.trim()).not.toBe('');
      expect(draft.persona.questioning.preferredStrategies.length).toBeGreaterThan(0);
      expect(draft.relationshipBehavior.rules.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps unresolved canon structurally blocked from Production publication', () => {
    for (const draft of INITIAL_CHARACTER_ROSTER_DRAFTS) {
      expect(draft.productionPublication).toBe('blocked');
      expect(hasUnresolvedCharacterAuthority(draft)).toBe(true);
      expect(typeof draft.gender).toBe('object');
      expect('status' in draft.visual).toBe(true);
      expect(typeof draft.canon.origin).toBe('object');
      expect(typeof draft.canon.apparentAgeBand).toBe('object');
      expect(typeof draft.canon.deityBond.deityId).toBe('object');
      expect(typeof draft.canon.deityBond.representationRole).toBe('object');
      expect(Array.isArray(draft.canon.deityBond.acceptedDoctrine)).toBe(false);
      expect(Array.isArray(draft.canon.deityBond.resistedDoctrine)).toBe(false);
    }
  });

  it('preserves memory-consent and semantic-authority boundaries for every character', () => {
    for (const draft of INITIAL_CHARACTER_ROSTER_DRAFTS) {
      const memoryRule = draft.behavior.rules.find((rule) =>
        rule.ruleKey.endsWith('_memory_consent_boundary'),
      );
      expect(memoryRule?.triggerKey).toBe('memory_permission_denied');
      expect(memoryRule?.avoid).toContain('repeat_consent_request');
      expect(memoryRule?.avoid).toContain('relationship_pressure');
      expect(draft.persona.questioning.avoidedStrategies).toContain('deterministic_fortune_claim');
      expect(draft.persona.questioning.avoidedStrategies).toContain('mind_reading_claim');
    }
  });
});
