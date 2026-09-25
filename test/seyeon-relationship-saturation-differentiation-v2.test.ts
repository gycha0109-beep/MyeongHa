import { describe, expect, it } from 'vitest';

import {
  buildSeyeonRelationshipEvidenceEpisodesV2,
  summarizeSeyeonRelationshipEpisodeProfileV2,
} from '../packages/domain/src/seyeon-relationship-semantics-v2.js';
import { seyeonEventFixture } from './support/seyeon-event-fixture-v2.js';

describe('Se-yeon saturated-score relationship differentiation v2', () => {
  it('preserves different causal relationship profiles even when coarse scores are identical', () => {
    const coarseA = { closeness: 100, trust: 100 };
    const coarseB = { closeness: 100, trust: 100 };

    const reliabilityEvents = Array.from({ length: 12 }, (_, index) => {
      const made = seyeonEventFixture({
        id: `a-made-${index}`,
        kind: 'PROMISE_MADE',
        day: index * 8 + 1,
      });
      const kept = seyeonEventFixture({
        id: `a-kept-${index}`,
        kind: 'PROMISE_KEPT',
        day: index * 8 + 2,
        causalPredecessorEventIds: [made.eventId],
      });
      return [made, kept];
    }).flat();

    const reciprocalEvents = Array.from({ length: 12 }, (_, index) => {
      const kinds = [
        'USER_REMEMBERED_SEYEON_DETAIL',
        'SEYEON_ACCEPTED_HELP',
        'SEYEON_REQUESTED_HELP',
        'SEYEON_SELF_DISCLOSED',
        'SEYEON_ADMITTED_WAITING',
      ] as const;
      return seyeonEventFixture({
        id: `b-${index}`,
        kind: kinds[index % kinds.length]!,
        day: index * 8 + 1,
      });
    });

    const profileA = summarizeSeyeonRelationshipEpisodeProfileV2(
      buildSeyeonRelationshipEvidenceEpisodesV2(reliabilityEvents),
    );
    const profileB = summarizeSeyeonRelationshipEpisodeProfileV2(
      buildSeyeonRelationshipEvidenceEpisodesV2(reciprocalEvents),
    );

    expect(coarseA).toEqual(coarseB);
    expect(profileA.familyCounts.commitment).toBe(12);
    expect(profileA.familyCounts.care).toBe(0);
    expect(profileB.familyCounts.commitment).toBe(0);
    expect(profileB.familyCounts.care).toBeGreaterThan(0);
    expect(profileA.outcomeCounts.promise_kept).toBe(12);
    expect(profileB.outcomeCounts.promise_kept ?? 0).toBe(0);
    expect(profileA.recentEpisodeIds).not.toEqual(profileB.recentEpisodeIds);
  });

  it('keeps conflict history distinguishable from a clean relationship even after repair', () => {
    const clean = [
      seyeonEventFixture({
        id: 'clean-recognition',
        kind: 'USER_REMEMBERED_SEYEON_DETAIL',
        day: 1,
      }),
      seyeonEventFixture({
        id: 'clean-care',
        kind: 'SEYEON_ACCEPTED_HELP',
        day: 10,
      }),
    ];

    const conflict = seyeonEventFixture({
      id: 'history-conflict',
      kind: 'CONFLICT_EVENT',
      day: 1,
    });
    const repair = seyeonEventFixture({
      id: 'history-repair',
      kind: 'RECONCILIATION_EVENT',
      day: 10,
      causalPredecessorEventIds: [conflict.eventId],
    });

    const cleanProfile = summarizeSeyeonRelationshipEpisodeProfileV2(
      buildSeyeonRelationshipEvidenceEpisodesV2(clean),
    );
    const repairedProfile = summarizeSeyeonRelationshipEpisodeProfileV2(
      buildSeyeonRelationshipEvidenceEpisodesV2([conflict, repair]),
    );

    expect(cleanProfile.familyCounts.conflict_repair).toBe(0);
    expect(repairedProfile.familyCounts.conflict_repair).toBe(1);
    expect(repairedProfile.outcomeCounts.conflict_repaired).toBe(1);
    expect(repairedProfile.unresolvedEpisodeIds).toEqual([]);
  });
});
