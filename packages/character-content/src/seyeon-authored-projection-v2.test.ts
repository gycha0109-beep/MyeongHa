import { describe, expect, it } from 'vitest';

import {
  SEYEON_ACTION_KEYS_V2,
  SEYEON_AUTHORED_PROJECTION_V2,
  SEYEON_BIBLE_SLICE_IDS_V2,
  SEYEON_EXPRESSION_STATES_V2,
  SEYEON_HYPOTHESIS_FIELDS_V2,
  SEYEON_UNDEFINED_FIELDS_V2,
} from './seyeon-authored-projection-v2.js';

describe('Se-yeon authored projection v2', () => {
  it('stays explicitly derived from the authored Bible/Runtime instead of becoming a second Canon', () => {
    expect(SEYEON_AUTHORED_PROJECTION_V2.characterId).toBe('seyeon');
    expect(SEYEON_AUTHORED_PROJECTION_V2.authority).toBe(
      'derived_projection_not_independent_canon',
    );
    expect(SEYEON_AUTHORED_PROJECTION_V2.source.bible.declaredVersion).toBe('v0.2');
    expect(SEYEON_AUTHORED_PROJECTION_V2.source.runtime.declaredVersion).toBe('v0.1');
    expect(SEYEON_AUTHORED_PROJECTION_V2.source.bible.gitBlobSha).toBe(
      '03ec32f43e56c2efbca75461c24a19a4690f683e',
    );
    expect(SEYEON_AUTHORED_PROJECTION_V2.source.runtime.gitBlobSha).toBe(
      '931607ce12ec5c77e064c740b1ce14cb2344c51c',
    );
  });

  it('preserves all runtime must-not-invent boundaries', () => {
    expect(SEYEON_UNDEFINED_FIELDS_V2).toEqual([
      'exact_age',
      'occupation_or_social_role',
      'world_position',
      'independent_current_goal',
      'long_term_life_goal',
      'specific_friends_colleagues_family',
      'general_romance_view',
      'past_romance',
      'confirmed_upbringing',
      'confirmed_family_relationships',
      'important_past_events',
      'secrets_regrets_unresolved_problems',
      'self_view_of_appearance',
      'fashion_or_self_styling',
    ]);
    expect(SEYEON_HYPOTHESIS_FIELDS_V2).toEqual([
      'growth_environment',
      'family_emotional_style',
    ]);
  });

  it('projects the authored action repertoire and expression states as bounded vocabularies', () => {
    expect(SEYEON_ACTION_KEYS_V2).toEqual([
      'approach',
      'activate',
      'narrow_choices',
      'remember_naturally',
      'tease',
      'invite',
      'care_practically',
      'give_space',
      'admit_boundary',
      'accept_care',
      'self_disclose',
    ]);
    expect(SEYEON_EXPRESSION_STATES_V2).toContain('baseline');
    expect(SEYEON_EXPRESSION_STATES_V2).toContain('hurt');
    expect(SEYEON_EXPRESSION_STATES_V2).toContain('vulnerable');
  });

  it('keeps every declared slice traceable and includes memory/drift/guard slices', () => {
    expect(Object.keys(SEYEON_AUTHORED_PROJECTION_V2.bibleSlices).sort()).toEqual(
      [...SEYEON_BIBLE_SLICE_IDS_V2].sort(),
    );
    expect(SEYEON_AUTHORED_PROJECTION_V2.bibleSlices.R12_memory_behavior.invariants).toContain(
      'No callback without retrieval provenance.',
    );
    expect(SEYEON_AUTHORED_PROJECTION_V2.bibleSlices.R13_drift_risks.invariants).toContain(
      'Brightness does not convert every emotion into positivity.',
    );
    expect(SEYEON_AUTHORED_PROJECTION_V2.bibleSlices.R11_relationship_reveal.invariants).toContain(
      'Sensitive personal questions require disclosure eligibility before private content retrieval.',
    );
    expect(SEYEON_AUTHORED_PROJECTION_V2.bibleSlices.R14_guards.invariants).toContain(
      'Undefined biography must not be invented.',
    );
  });
});