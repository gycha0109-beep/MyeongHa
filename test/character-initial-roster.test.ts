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

const draftCanonIsNotProductionCanon: CharacterInitialRosterDraft['canon'] extends CharacterCanonProfile
  ? never
  : true = true;

void draftCanonIsNotProductionCanon;

describe('C2 nine-character initial roster authoring draft', () => {
  it('materializes exactly the approved nine-character roster', () => {
    expect(INITIAL_CHARACTER_ROSTER_DRAFT_VERSION).toBe('c2-nine-roster-draft-v1');
    expect(INITIAL_CHARACTER_ROSTER_DRAFTS).toHaveLength(9);
    expect(INITIAL_CHARACTER_ROSTER_DRAFTS.map((draft) => draft.characterId)).toEqual(
      EXPECTED_IDS,
    );
    expect(new Set(INITIAL_CHARACTER_ROSTER_DRAFTS.map((draft) => draft.characterId)).size).toBe(9);
  });

  it('keeps Mira explicitly working-name while the other approved display names are stable', () => {
    const workingNames = INITIAL_CHARACTER_ROSTER_DRAFTS.filter(
      (draft) => draft.nameStatus === 'working',
    );
    expect(workingNames).toHaveLength(1);
    expect(workingNames[0]?.characterId).toBe('mira_working');
    expect(workingNames[0]?.displayName).toBe('미라');
  });

  it('gives every character access intent for every prepared Saju domain without changing semantics', () => {
    for (const draft of INITIAL_CHARACTER_ROSTER_DRAFTS) {
      expect(draft.sajuDomainAccess).toEqual(SAJU_DOMAINS);
      expect(new Set(draft.sajuDomainAccess).size).toBe(SAJU_DOMAINS.length);
      expect(draft.sajuProfile.attentionAxes.length).toBeGreaterThan(0);
      expect(draft.sajuProfile.followUpQuestionStrategies.length).toBeGreaterThan(0);
    }
  });

  it('keeps the nine approved relationship/question axes meaningfully differentiated', () => {
    const primaryAttentionAxis = INITIAL_CHARACTER_ROSTER_DRAFTS.map(
      (draft) => draft.sajuProfile.attentionAxes[0],
    );
    const primaryQuestionPriority = INITIAL_CHARACTER_ROSTER_DRAFTS.map(
      (draft) => draft.behavior.questionPriorities[0],
    );

    expect(new Set(primaryAttentionAxis).size).toBe(9);
    expect(new Set(primaryQuestionPriority).size).toBe(9);

    for (const draft of INITIAL_CHARACTER_ROSTER_DRAFTS) {
      expect(draft.canon.worldview.coreValues.length).toBeGreaterThanOrEqual(3);
      expect(draft.canon.worldview.humanTheory.trim()).not.toBe('');
      expect(draft.canon.psychology.flaw.trim()).not.toBe('');
      expect(draft.persona.questioning.preferredStrategies.length).toBeGreaterThan(0);
      expect(draft.behavior.rules.length).toBeGreaterThanOrEqual(2);
      expect(draft.relationshipBehavior.rules.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('fails closed on canon fields that were not approved by source authority', () => {
    for (const draft of INITIAL_CHARACTER_ROSTER_DRAFTS) {
      expect(draft.productionPublication).toBe('blocked');
      expect(hasUnresolvedCharacterAuthority(draft)).toBe(true);
      expect(typeof draft.gender).toBe('object');
      expect(typeof draft.visual).toBe('object');
      expect(typeof draft.canon.origin).toBe('object');
      expect(typeof draft.canon.apparentAgeBand).toBe('object');
      expect(typeof draft.canon.deityBond.deityId).toBe('object');
      expect(typeof draft.canon.deityBond.representationRole).toBe('object');
      expect(Array.isArray(draft.canon.deityBond.acceptedDoctrine)).toBe(false);
      expect(Array.isArray(draft.canon.deityBond.resistedDoctrine)).toBe(false);
    }
  });

  it('preserves consent and semantic-authority boundaries in every behavior draft', () => {
    for (const draft of INITIAL_CHARACTER_ROSTER_DRAFTS) {
      const memoryRule = draft.behavior.rules.find((rule) =>
        rule.ruleKey.endsWith('_memory_consent_boundary'),
      );
      expect(memoryRule?.triggerKey).toBe('memory_permission_denied');
      expect(memoryRule?.avoid).toContain('repeat_consent_request');
      expect(memoryRule?.avoid).toContain('relationship_pressure');

      expect(draft.persona.questioning.avoidedStrategies).toContain(
        'deterministic_fortune_claim',
      );
      expect(draft.persona.questioning.avoidedStrategies).toContain('mind_reading_claim');
    }
  });
});
