import { describe, expect, it } from 'vitest';

import type { CharacterContentDefinition } from '../packages/character-content/src/schema.js';
import {
  CHARACTER_CONCEPT_V1_WORKING_ROSTER,
  CHARACTER_CONCEPT_V1_WORKING_ROSTER_SIZE,
  type CharacterConceptV1WorkingRosterEntry,
} from '../packages/character-content/src/working-roster.js';

const workingEntryIsNotProductionContent: CharacterConceptV1WorkingRosterEntry extends CharacterContentDefinition
  ? never
  : true = true;
void workingEntryIsNotProductionContent;

const EXPECTED_WORKING_NAMES = ['세연', '여울', '서린', '라현', '미라', '태겸', '윤호', '도윤', '백헌'] as const;

describe('Character Concept V1 working roster source boundary', () => {
  it('preserves exactly the source-backed current working roster', () => {
    expect(CHARACTER_CONCEPT_V1_WORKING_ROSTER_SIZE).toBe(9);
    expect(CHARACTER_CONCEPT_V1_WORKING_ROSTER).toHaveLength(9);
    expect(CHARACTER_CONCEPT_V1_WORKING_ROSTER.map((entry) => entry.workingDisplayName)).toEqual(EXPECTED_WORKING_NAMES);
    expect(new Set(CHARACTER_CONCEPT_V1_WORKING_ROSTER.map((entry) => entry.workingDisplayName)).size).toBe(9);
  });

  it('marks all nine official Launch display names approved without establishing immutable canon', () => {
    for (const entry of CHARACTER_CONCEPT_V1_WORKING_ROSTER) {
      expect(entry.nameStatus).toBe('launch-approved');
      expect(entry.immutableCanonStatus).toBe('not_established');
      expect(entry.productionPublication).toBe('blocked');
    }
  });

  it('preserves source-backed relationship-fantasy direction without claiming differentiation PASS', () => {
    for (const entry of CHARACTER_CONCEPT_V1_WORKING_ROSTER) {
      expect(entry.relationshipFantasy.trim()).not.toBe('');
      expect(entry.relationshipHook.trim()).not.toBe('');
    }
    expect(CHARACTER_CONCEPT_V1_WORKING_ROSTER.find((entry) => entry.workingDisplayName === '세연')?.relationshipFantasy).toContain('First Companion');
    expect(CHARACTER_CONCEPT_V1_WORKING_ROSTER.find((entry) => entry.workingDisplayName === '미라')?.relationshipFantasy).toContain('Friends-to-Lovers');
    expect(CHARACTER_CONCEPT_V1_WORKING_ROSTER.find((entry) => entry.workingDisplayName === '백헌')?.relationshipFantasy).toContain('능력에서 오는 안정');
  });

  it('is structurally incapable of being mistaken for Production Character content', () => {
    for (const entry of CHARACTER_CONCEPT_V1_WORKING_ROSTER) {
      expect(entry.sourceStatus).toBe('character_concept_v1_working');
      expect(entry.productionPublication).toBe('blocked');
      expect('characterId' in entry).toBe(false);
      expect('contentVersion' in entry).toBe(false);
      expect('canon' in entry).toBe(false);
      expect('gender' in entry).toBe(false);
      expect('visual' in entry).toBe(false);
    }
  });
});
