import { describe, expect, it } from 'vitest';

import {
  InMemorySeyeonEventLedgerV2,
  projectSeyeonRelationshipPolicyShadowV3,
} from '../packages/domain/src/index.js';
import { seyeonEventFixture } from './support/seyeon-event-fixture-v2.js';
import { bindAuthorizedEventFixturesV3 } from './support/seyeon-relationship-policy-convergence-v3.js';

function projectActive(ledger: InMemorySeyeonEventLedgerV2) {
  return projectSeyeonRelationshipPolicyShadowV3({
    evidence: bindAuthorizedEventFixturesV3(ledger.activeEvents()),
    currentCandidateStage: 'S1_FAMILIAR',
  });
}

describe('Se-yeon relationship correction replay convergence v3', () => {
  it('deterministically rebuilds causal relationship evidence from corrected and retracted active history', () => {
    const ledger = new InMemorySeyeonEventLedgerV2();
    const recognition = seyeonEventFixture({
      id: 'replay-recognition',
      kind: 'USER_REMEMBERED_SEYEON_DETAIL',
      day: 1,
    });
    const care = seyeonEventFixture({
      id: 'replay-care',
      kind: 'SEYEON_ACCEPTED_HELP',
      day: 10,
    });

    ledger.appendEvent({
      ledgerEntryId: 'entry-recognition',
      recordedAt: recognition.occurredAt,
      event: recognition,
    });
    ledger.appendEvent({
      ledgerEntryId: 'entry-care',
      recordedAt: care.occurredAt,
      event: care,
    });

    const before = projectActive(ledger);
    expect(before.profile.familyCounts.recognition).toBe(1);
    expect(before.profile.familyCounts.care).toBe(1);

    const corrected = seyeonEventFixture({
      id: 'replay-disclosure-corrected',
      kind: 'SEYEON_SELF_DISCLOSED',
      day: 1,
    });
    ledger.correctEvent({
      ledgerEntryId: 'entry-correction',
      dedupeKey: 'correction-replay-recognition',
      targetEventId: recognition.eventId,
      replacementEvent: corrected,
      reason: 'Authority-backed correction for deterministic replay test.',
      sourceRefs: ['correction-authority-ref'],
      recordedAt: '2026-01-20T00:00:00.000Z',
    });

    const afterCorrection = projectActive(ledger);
    expect(afterCorrection.profile.familyCounts.recognition).toBe(0);
    expect(afterCorrection.profile.familyCounts.disclosure).toBe(1);
    expect(afterCorrection.profile.familyCounts.care).toBe(1);

    ledger.retractEvent({
      ledgerEntryId: 'entry-retraction',
      dedupeKey: 'retraction-replay-care',
      targetEventId: care.eventId,
      reason: 'Authority-backed retraction for deterministic replay test.',
      sourceRefs: ['retraction-authority-ref'],
      recordedAt: '2026-01-21T00:00:00.000Z',
    });

    const afterRetractionA = projectActive(ledger);
    const afterRetractionB = projectActive(ledger);

    expect(afterRetractionA.profile.familyCounts.disclosure).toBe(1);
    expect(afterRetractionA.profile.familyCounts.care).toBe(0);
    expect(afterRetractionA.admittedEventIds).toEqual([
      'replay-disclosure-corrected',
    ]);
    expect(afterRetractionB).toEqual(afterRetractionA);
  });
});
