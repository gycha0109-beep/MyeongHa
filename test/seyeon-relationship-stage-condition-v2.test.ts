import { describe, expect, it } from 'vitest';

import {
  buildSeyeonRelationshipEvidenceEpisodesV2,
  projectSeyeonRelationshipStateShadowV2,
} from '../packages/domain/src/seyeon-relationship-semantics-v2.js';
import { seyeonEventFixture } from './support/seyeon-event-fixture-v2.js';

describe('Se-yeon relationship attained stage vs current condition v2', () => {
  it('keeps historical S4 depth while an explicit conflict restricts current behavior', () => {
    const conflict = seyeonEventFixture({
      id: 'specialness-invalidated',
      kind: 'SPECIALNESS_INVALIDATED',
      day: 100,
    });
    const episodes = buildSeyeonRelationshipEvidenceEpisodesV2([conflict]);

    const state = projectSeyeonRelationshipStateShadowV2({
      previousAttainedStage: 'S4_SPECIAL',
      currentCandidateStage: 'S2_REGULAR',
      episodes,
    });

    expect(state.attainedStage).toBe('S4_SPECIAL');
    expect(state.currentCandidateStage).toBe('S2_REGULAR');
    expect(state.currentCondition).toBe('OPEN_CONFLICT');
    expect(state.behaviorAccess).toBe('RESTRICTED_BY_CONFLICT');
    expect(state.unresolvedEpisodeIds).toEqual([
      'episode:specialness-invalidated',
    ]);
  });

  it('moves from open conflict to cautious post-repair behavior without erasing attained depth', () => {
    const conflict = seyeonEventFixture({
      id: 'conflict',
      kind: 'CONFLICT_EVENT',
      day: 100,
    });
    const repair = seyeonEventFixture({
      id: 'repair',
      kind: 'RECONCILIATION_EVENT',
      day: 130,
      causalPredecessorEventIds: [conflict.eventId],
    });
    const episodes = buildSeyeonRelationshipEvidenceEpisodesV2([
      conflict,
      repair,
    ]);

    const state = projectSeyeonRelationshipStateShadowV2({
      previousAttainedStage: 'S4_SPECIAL',
      currentCandidateStage: 'S4_SPECIAL',
      episodes,
    });

    expect(state.attainedStage).toBe('S4_SPECIAL');
    expect(state.currentCondition).toBe('RESOLVED_RECENTLY');
    expect(state.behaviorAccess).toBe('CAUTIOUS_AFTER_REPAIR');
    expect(state.unresolvedEpisodeIds).toEqual([]);
    expect(state.causalEventIds).toEqual(['conflict', 'repair']);
  });

  it('never promotes attained depth merely because time passes or the user returns', () => {
    const returned = seyeonEventFixture({
      id: 'returned',
      kind: 'RETURNED_AFTER_ABSENCE',
      day: 365,
    });
    const episodes = buildSeyeonRelationshipEvidenceEpisodesV2([returned]);

    const state = projectSeyeonRelationshipStateShadowV2({
      previousAttainedStage: 'S2_REGULAR',
      currentCandidateStage: 'S2_REGULAR',
      episodes,
    });

    expect(state.attainedStage).toBe('S2_REGULAR');
    expect(state.currentCondition).toBe('STABLE');
    expect(state.behaviorAccess).toBe('STAGE_ALIGNED');
  });

  it('allows evidence-backed upward depth while preventing candidate regression from rewriting history', () => {
    const progressed = projectSeyeonRelationshipStateShadowV2({
      previousAttainedStage: 'S2_REGULAR',
      currentCandidateStage: 'S3_OPENED',
      episodes: [],
    });
    const laterLowerCandidate = projectSeyeonRelationshipStateShadowV2({
      previousAttainedStage: progressed.attainedStage,
      currentCandidateStage: 'S1_FAMILIAR',
      episodes: [],
    });

    expect(progressed.attainedStage).toBe('S3_OPENED');
    expect(laterLowerCandidate.attainedStage).toBe('S3_OPENED');
    expect(laterLowerCandidate.currentCandidateStage).toBe('S1_FAMILIAR');
  });
});
