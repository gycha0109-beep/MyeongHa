import { describe, expect, it } from 'vitest';

import {
  SeyeonRelationshipSemanticsErrorV2,
  buildSeyeonRelationshipEvidenceEpisodesV2,
  creditSeyeonRelationshipEpisodesV2,
} from '../packages/domain/src/seyeon-relationship-semantics-v2.js';
import { seyeonEventFixture } from './support/seyeon-event-fixture-v2.js';

describe('Se-yeon causal relationship episodes v2', () => {
  it('folds promise creation and fulfillment into one causal commitment episode', () => {
    const made = seyeonEventFixture({
      id: 'promise-made',
      kind: 'PROMISE_MADE',
      day: 1,
    });
    const kept = seyeonEventFixture({
      id: 'promise-kept',
      kind: 'PROMISE_KEPT',
      day: 8,
      causalPredecessorEventIds: [made.eventId],
    });

    const episodes = buildSeyeonRelationshipEvidenceEpisodesV2([made, kept]);

    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      episodeId: 'episode:promise-made',
      family: 'commitment',
      rootEventId: 'promise-made',
      eventIds: ['promise-made', 'promise-kept'],
      status: 'resolved',
      outcome: 'promise_kept',
      milestoneKind: 'commitment_follow_through',
      opensConflict: false,
    });
  });

  it('folds repeated reconciliation callbacks into one conflict episode and one milestone opportunity', () => {
    const conflict = seyeonEventFixture({
      id: 'conflict',
      kind: 'CONFLICT_EVENT',
      day: 1,
    });
    const repair1 = seyeonEventFixture({
      id: 'repair-1',
      kind: 'RECONCILIATION_EVENT',
      day: 3,
      causalPredecessorEventIds: [conflict.eventId],
    });
    const repair2 = seyeonEventFixture({
      id: 'repair-2',
      kind: 'RECONCILIATION_EVENT',
      day: 4,
      causalPredecessorEventIds: [conflict.eventId],
    });

    const episodes = buildSeyeonRelationshipEvidenceEpisodesV2([
      conflict,
      repair1,
      repair2,
    ]);
    const credits = creditSeyeonRelationshipEpisodesV2(episodes, {
      repairCountsTowardMilestones: true,
    });

    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.eventIds).toEqual([
      'conflict',
      'repair-1',
      'repair-2',
    ]);
    expect(episodes[0]?.outcome).toBe('conflict_repaired');
    expect(credits.creditedEpisodeIds).toEqual(['episode:conflict']);
    expect(credits.milestoneKinds).toEqual(['repair_resolution']);
  });

  it('fails closed when a causal outcome has no predecessor event in the supplied active history', () => {
    const orphan = seyeonEventFixture({
      id: 'orphan-kept',
      kind: 'PROMISE_KEPT',
      day: 2,
      causalPredecessorEventIds: ['missing-promise'],
    });

    expect(() =>
      buildSeyeonRelationshipEvidenceEpisodesV2([orphan]),
    ).toThrow(SeyeonRelationshipSemanticsErrorV2);
  });

  it('applies rolling seven-day family credit after causal episode folding', () => {
    const events = [1, 2, 3, 4].flatMap((index) => {
      const keptDay = index <= 2 ? 7 : 8;
      const made = seyeonEventFixture({
        id: `made-${index}`,
        kind: 'PROMISE_MADE',
        day: keptDay - 1,
      });
      const kept = seyeonEventFixture({
        id: `kept-${index}`,
        kind: 'PROMISE_KEPT',
        day: keptDay,
        causalPredecessorEventIds: [made.eventId],
      });
      return [made, kept];
    });

    const episodes = buildSeyeonRelationshipEvidenceEpisodesV2(events);
    const credits = creditSeyeonRelationshipEpisodesV2(episodes);

    expect(episodes).toHaveLength(4);
    expect(credits.creditedEpisodeIds).toHaveLength(2);
    expect(credits.suppressedEpisodeIds).toHaveLength(2);
    expect(
      credits.decisions.filter(
        (decision) =>
          decision.suppressionReason === 'ROLLING_FAMILY_WINDOW_LIMIT',
      ),
    ).toHaveLength(2);
  });

  it('does not count repair as a progression milestone unless the shadow policy explicitly enables it', () => {
    const conflict = seyeonEventFixture({
      id: 'repair-policy-conflict',
      kind: 'SPECIALNESS_INVALIDATED',
      day: 1,
    });
    const repair = seyeonEventFixture({
      id: 'repair-policy-repair',
      kind: 'RECONCILIATION_EVENT',
      day: 5,
      causalPredecessorEventIds: [conflict.eventId],
    });
    const episodes = buildSeyeonRelationshipEvidenceEpisodesV2([
      conflict,
      repair,
    ]);

    expect(
      creditSeyeonRelationshipEpisodesV2(episodes).milestoneKinds,
    ).toEqual([]);
    expect(
      creditSeyeonRelationshipEpisodesV2(episodes, {
        repairCountsTowardMilestones: true,
      }).milestoneKinds,
    ).toEqual(['repair_resolution']);
  });
});
