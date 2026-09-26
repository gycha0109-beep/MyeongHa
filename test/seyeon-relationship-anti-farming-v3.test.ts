import { describe, expect, it } from 'vitest';

import { projectSeyeonRelationshipPolicyShadowV3 } from '../packages/domain/src/index.js';
import { seyeonEventFixture } from './support/seyeon-event-fixture-v2.js';
import { bindAuthorizedEventFixturesV3 } from './support/seyeon-relationship-policy-convergence-v3.js';

describe('Se-yeon causal repair anti-farming convergence v3', () => {
  it('folds one conflict plus one hundred repair callbacks into one causal episode and zero default repair milestones', () => {
    const conflict = seyeonEventFixture({
      id: 'repair-farm-root',
      kind: 'CONFLICT_EVENT',
      day: 1,
    });
    const repairs = Array.from({ length: 100 }, (_, index) =>
      seyeonEventFixture({
        id: `repair-farm-callback-${index}`,
        kind: 'RECONCILIATION_EVENT',
        day: 2 + index,
        causalPredecessorEventIds: [conflict.eventId],
      }),
    );

    const projection = projectSeyeonRelationshipPolicyShadowV3({
      evidence: bindAuthorizedEventFixturesV3([conflict, ...repairs]),
      currentCandidateStage: 'S2_REGULAR',
    });

    expect(projection.episodes).toHaveLength(1);
    expect(projection.episodes[0]?.eventIds).toHaveLength(101);
    expect(projection.credits.creditedEpisodeIds).toHaveLength(1);
    expect(projection.credits.milestoneKinds).toEqual([]);
    expect(projection.profile.familyCounts.conflict_repair).toBe(1);
  });

  it('keeps distinct conflict-repair cycles visible while refusing to invent whether they should count as progression diversity', () => {
    const events = Array.from({ length: 50 }, (_, index) => {
      const day = 1 + index * 8;
      const conflict = seyeonEventFixture({
        id: `cycle-conflict-${index}`,
        kind: 'CONFLICT_EVENT',
        day,
      });
      const repair = seyeonEventFixture({
        id: `cycle-repair-${index}`,
        kind: 'RECONCILIATION_EVENT',
        day: day + 1,
        causalPredecessorEventIds: [conflict.eventId],
      });
      return [conflict, repair];
    }).flat();

    const projection = projectSeyeonRelationshipPolicyShadowV3({
      evidence: bindAuthorizedEventFixturesV3(events),
      currentCandidateStage: 'S2_REGULAR',
    });

    expect(projection.episodes).toHaveLength(50);
    expect(projection.profile.familyCounts.conflict_repair).toBe(50);
    expect(projection.credits.milestoneKinds).toEqual([]);
    expect(projection.constraints.productionPolicyApproved).toBe(false);
    expect(projection.constraints.src22Status).toBe('OPEN');
  });
});
