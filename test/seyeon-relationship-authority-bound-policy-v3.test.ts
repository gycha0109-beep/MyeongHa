import { describe, expect, it } from 'vitest';

import {
  bindSeyeonAuthorizedRelationshipEvidenceV3,
  projectSeyeonRelationshipPolicyShadowV3,
  SeyeonRelationshipPolicyShadowErrorV3,
} from '../packages/domain/src/index.js';
import { seyeonEventFixture } from './support/seyeon-event-fixture-v2.js';
import {
  bindAuthorizedEventFixturesV3,
  eventAuthorityFixtureV3,
} from './support/seyeon-relationship-policy-convergence-v3.js';

describe('Se-yeon authority-bound relationship policy shadow v3', () => {
  it('drops rejected Event Authority decisions before relationship policy input', () => {
    const event = seyeonEventFixture({
      id: 'unsupported-promise-kept',
      kind: 'PROMISE_KEPT',
      day: 2,
      causalPredecessorEventIds: ['promise-made'],
    });

    for (let index = 0; index < 100; index += 1) {
      expect(
        bindSeyeonAuthorizedRelationshipEvidenceV3({
          event,
          eventAuthority: eventAuthorityFixtureV3({
            event,
            decision: 'REJECT',
          }),
        }),
      ).toBeNull();
    }
  });

  it('rejects a materialized Event whose provenance was changed after Event Authority', () => {
    const event = seyeonEventFixture({
      id: 'authorized-recognition',
      kind: 'USER_REMEMBERED_SEYEON_DETAIL',
      day: 10,
    });
    const authority = eventAuthorityFixtureV3({ event });
    const tampered = {
      ...event,
      sourceTurnId: 'different-turn',
    };

    expect(() =>
      bindSeyeonAuthorizedRelationshipEvidenceV3({
        event: tampered,
        eventAuthority: authority,
      }),
    ).toThrow(SeyeonRelationshipPolicyShadowErrorV3);
  });

  it('folds promise outcomes into causal episodes before rolling family credit', () => {
    const events = [1, 2, 3, 4].flatMap((index) => {
      const keptDay = index <= 2 ? 7 : 8;
      const made = seyeonEventFixture({
        id: `authority-made-${index}`,
        kind: 'PROMISE_MADE',
        day: keptDay - 1,
      });
      const kept = seyeonEventFixture({
        id: `authority-kept-${index}`,
        kind: 'PROMISE_KEPT',
        day: keptDay,
        causalPredecessorEventIds: [made.eventId],
      });
      return [made, kept];
    });

    const projection = projectSeyeonRelationshipPolicyShadowV3({
      evidence: bindAuthorizedEventFixturesV3(events),
      currentCandidateStage: 'S2_REGULAR',
    });

    expect(projection.admittedEventIds).toHaveLength(8);
    expect(projection.episodes).toHaveLength(4);
    expect(projection.credits.creditedEpisodeIds).toHaveLength(2);
    expect(projection.credits.suppressedEpisodeIds).toHaveLength(2);
    expect(
      projection.credits.decisions.filter(
        (decision) =>
          decision.suppressionReason === 'ROLLING_FAMILY_WINDOW_LIMIT',
      ),
    ).toHaveLength(2);
    expect(projection.constraints.productionPolicyApproved).toBe(false);
    expect(projection.constraints.src22Status).toBe('OPEN');
  });

  it('folds repeated repair callbacks into one conflict episode with no default repair milestone credit', () => {
    const conflict = seyeonEventFixture({
      id: 'authority-conflict',
      kind: 'CONFLICT_EVENT',
      day: 1,
    });
    const repair1 = seyeonEventFixture({
      id: 'authority-repair-1',
      kind: 'RECONCILIATION_EVENT',
      day: 3,
      causalPredecessorEventIds: [conflict.eventId],
    });
    const repair2 = seyeonEventFixture({
      id: 'authority-repair-2',
      kind: 'RECONCILIATION_EVENT',
      day: 4,
      causalPredecessorEventIds: [conflict.eventId],
    });

    const projection = projectSeyeonRelationshipPolicyShadowV3({
      evidence: bindAuthorizedEventFixturesV3([
        conflict,
        repair1,
        repair2,
      ]),
      previousAttainedStage: 'S4_SPECIAL',
      currentCandidateStage: 'S4_SPECIAL',
    });

    expect(projection.episodes).toHaveLength(1);
    expect(projection.episodes[0]?.eventIds).toEqual([
      'authority-conflict',
      'authority-repair-1',
      'authority-repair-2',
    ]);
    expect(projection.profile.familyCounts.conflict_repair).toBe(1);
    expect(projection.credits.milestoneKinds).toEqual([]);
    expect(projection.state.attainedStage).toBe('S4_SPECIAL');
    expect(projection.state.currentCondition).toBe('RESOLVED_RECENTLY');
  });
});
