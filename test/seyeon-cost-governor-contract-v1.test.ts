import { describe, expect, it } from 'vitest';
import {
  emptySeyeonCostGovernorSnapshotV1,
  holdUnknownSeyeonCostUsageV1,
  inspectSeyeonCostBudgetV1,
  markSeyeonCostDispatchedV1,
  reconcileHeldSeyeonCostReservationV1,
  releaseUnsentSeyeonCostReservationV1,
  reserveSeyeonCostCandidateV1,
  settleSeyeonCostReservationV1,
  type SeyeonCostReservationIdentityV1,
} from '../apps/api/src/seyeon-cost-governor-contract-v1.js';

const subjectA = '11111111-1111-4111-8111-111111111111';
const subjectB = '22222222-2222-4222-8222-222222222222';
const turn = '33333333-3333-4333-8333-333333333333';
const attempt = '44444444-4444-4444-8444-444444444444';
const bucket = '2026-10-09';

function identity(
  key: string,
  ceilingMicroUsd: number,
  subjectId = subjectA,
  utcDate = bucket,
): SeyeonCostReservationIdentityV1 {
  return {
    reservationKey: key,
    bucketUtcDate: utcDate,
    subjectId, turnId: turn, attemptId: attempt,
    stage: 'dialogue_render',
    modelKey: 'synthetic-test-model',
    rateCardVersion: 'synthetic-test-prices',
    ceilingMicroUsd,
  };
}

const policy = {
  bucketUtcDate: bucket,
  globalLimitMicroUsd: 1000,
  subjectLimitMicroUsd: 700,
};

describe('Seyeon Cost Governor state contract v1 (offline; no DB or model)', () => {
  it('starts with no budget consumed and reserves a bounded amount', () => {
    const empty = emptySeyeonCostGovernorSnapshotV1();
    const result = reserveSeyeonCostCandidateV1({
      snapshot: empty, identity: identity('turn:1:render:1', 500), policy,
    });
    expect(result).toMatchObject({
      disposition: 'ADMITTED',
      reservation: { state: 'RESERVED', actualEstimatedMicroUsd: null },
    });
    expect(inspectSeyeonCostBudgetV1(result.snapshot, {
      bucketUtcDate: bucket, subjectId: subjectA,
    })).toEqual({ globalOccupiedMicroUsd: 500, subjectOccupiedMicroUsd: 500 });
    expect(empty.reservations).toHaveLength(0);
  });

  it('blocks duplicates even if identical, and detects idempotency identity collisions', () => {
    const first = reserveSeyeonCostCandidateV1({
      snapshot: emptySeyeonCostGovernorSnapshotV1(),
      identity: identity('turn:dup:render:1', 300), policy,
    });
    const replay = reserveSeyeonCostCandidateV1({
      snapshot: first.snapshot, identity: identity('turn:dup:render:1', 300), policy,
    });
    expect(replay.disposition).toBe('DUPLICATE');
    expect(replay.snapshot.reservations).toHaveLength(1);
    expect(() => reserveSeyeonCostCandidateV1({
      snapshot: first.snapshot, identity: identity('turn:dup:render:1', 400), policy,
    })).toThrow('conflicts with another request');
  });

  it('caps both Subject and global spent-plus-reserved independently', () => {
    const a = reserveSeyeonCostCandidateV1({
      snapshot: emptySeyeonCostGovernorSnapshotV1(),
      identity: identity('A', 600), policy,
    });
    const denySubject = reserveSeyeonCostCandidateV1({
      snapshot: a.snapshot, identity: identity('A2', 200), policy,
    });
    expect(denySubject.disposition).toBe('DENIED_SUBJECT');
    expect(denySubject.snapshot).toBe(a.snapshot);
    const b = reserveSeyeonCostCandidateV1({
      snapshot: a.snapshot, identity: identity('B', 350, subjectB), policy,
    });
    expect(b.disposition).toBe('ADMITTED');
    const denyGlobal = reserveSeyeonCostCandidateV1({
      snapshot: b.snapshot, identity: identity('B2', 100, subjectB), policy,
    });
    expect(denyGlobal.disposition).toBe('DENIED_GLOBAL');
  });

  it('holds unknown billed usage after dispatch, never automatically refunds on timeout', () => {
    const admitted = reserveSeyeonCostCandidateV1({
      snapshot: emptySeyeonCostGovernorSnapshotV1(),
      identity: identity('timeout', 600), policy,
    });
    const dispatched = markSeyeonCostDispatchedV1(admitted.snapshot, 'timeout');
    const held = holdUnknownSeyeonCostUsageV1(dispatched, 'timeout');
    expect(held.reservations[0]?.state).toBe('HELD_UNKNOWN_USAGE');
    expect(inspectSeyeonCostBudgetV1(held, {
      bucketUtcDate: bucket, subjectId: subjectA,
    }).subjectOccupiedMicroUsd).toBe(600);
    expect(reserveSeyeonCostCandidateV1({
      snapshot: held, identity: identity('after-timeout', 101), policy,
    }).disposition).toBe('DENIED_SUBJECT');
    expect(() => releaseUnsentSeyeonCostReservationV1(held, 'timeout'))
      .toThrow('Cannot release a dispatched');
    expect(() => markSeyeonCostDispatchedV1(dispatched, 'timeout'))
      .toThrow('must not be replayed');
  });

  it('releases reservation only when the model request was not sent', () => {
    const admitted = reserveSeyeonCostCandidateV1({
      snapshot: emptySeyeonCostGovernorSnapshotV1(),
      identity: identity('never-sent', 650), policy,
    });
    const released = releaseUnsentSeyeonCostReservationV1(admitted.snapshot, 'never-sent');
    expect(released.reservations[0]?.state).toBe('RELEASED_UNSENT');
    expect(inspectSeyeonCostBudgetV1(released, {
      bucketUtcDate: bucket, subjectId: subjectA,
    }).globalOccupiedMicroUsd).toBe(0);
    expect(reserveSeyeonCostCandidateV1({
      snapshot: released, identity: identity('never-sent', 650), policy,
    }).disposition).toBe('DUPLICATE');
    expect(() => markSeyeonCostDispatchedV1(released, 'never-sent'))
      .toThrow('must not be replayed');
  });

  it('settles actual usage and frees only the proven unused reservation amount', () => {
    const admitted = reserveSeyeonCostCandidateV1({
      snapshot: emptySeyeonCostGovernorSnapshotV1(),
      identity: identity('settle', 600), policy,
    });
    const dispatched = markSeyeonCostDispatchedV1(admitted.snapshot, 'settle');
    const settled = settleSeyeonCostReservationV1(dispatched, 'settle', 125);
    expect(settled.reservations[0]).toMatchObject({
      state: 'SETTLED', actualEstimatedMicroUsd: 125,
    });
    expect(inspectSeyeonCostBudgetV1(settled, {
      bucketUtcDate: bucket, subjectId: subjectA,
    }).subjectOccupiedMicroUsd).toBe(125);
    expect(settleSeyeonCostReservationV1(settled, 'settle', 125).reservations[0])
      .toEqual(settled.reservations[0]);
    expect(() => settleSeyeonCostReservationV1(settled, 'settle', 126))
      .toThrow('Conflicting');
    expect(reserveSeyeonCostCandidateV1({
      snapshot: settled, identity: identity('later', 575), policy,
    }).disposition).toBe('ADMITTED');
  });

  it('marks actual cost greater than reserved as an over-ceiling incident without hiding the charge', () => {
    const a = reserveSeyeonCostCandidateV1({
      snapshot: emptySeyeonCostGovernorSnapshotV1(),
      identity: identity('over', 300), policy,
    });
    const actual = settleSeyeonCostReservationV1(
      markSeyeonCostDispatchedV1(a.snapshot, 'over'),
      'over', 1100,
    );
    expect(actual.reservations[0]?.state).toBe('OVER_CEILING');
    expect(inspectSeyeonCostBudgetV1(actual, {
      bucketUtcDate: bucket, subjectId: subjectA,
    })).toEqual({ globalOccupiedMicroUsd: 1100, subjectOccupiedMicroUsd: 1100 });
    expect(reserveSeyeonCostCandidateV1({
      snapshot: actual, identity: identity('later', 1), policy,
    }).disposition).toBe('DENIED_GLOBAL');
  });

  it('requires auditable evidence to reconcile a held unknown-usage request', () => {
    const a = reserveSeyeonCostCandidateV1({
      snapshot: emptySeyeonCostGovernorSnapshotV1(),
      identity: identity('held', 600), policy,
    });
    const held = holdUnknownSeyeonCostUsageV1(
      markSeyeonCostDispatchedV1(a.snapshot, 'held'), 'held',
    );
    expect(() => settleSeyeonCostReservationV1(held, 'held', 0))
      .toThrow('not dispatched');
    expect(() => reconcileHeldSeyeonCostReservationV1(held, 'held', {
      evidenceId: '', verifiedActualEstimatedMicroUsd: 0,
    })).toThrow('reconciliation evidence');
    const resolved = reconcileHeldSeyeonCostReservationV1(held, 'held', {
      evidenceId: 'audit-case-001', verifiedActualEstimatedMicroUsd: 0,
    });
    expect(resolved.reservations[0]?.state).toBe('SETTLED');
    expect(resolved.reservations[0]?.reconciliationEvidenceId).toBe('audit-case-001');
    expect(reconcileHeldSeyeonCostReservationV1(resolved, 'held', {
      evidenceId: 'audit-case-001', verifiedActualEstimatedMicroUsd: 0,
    }).reservations[0]).toEqual(resolved.reservations[0]);
    expect(() => reconcileHeldSeyeonCostReservationV1(resolved, 'held', {
      evidenceId: 'different-case', verifiedActualEstimatedMicroUsd: 0,
    })).toThrow('Conflicting');
  });

  it('isolates UTC budget buckets but never reuses the same reservation key', () => {
    const today = reserveSeyeonCostCandidateV1({
      snapshot: emptySeyeonCostGovernorSnapshotV1(),
      identity: identity('same-key', 650), policy,
    });
    const tomorrow = reserveSeyeonCostCandidateV1({
      snapshot: today.snapshot,
      identity: identity('next-day', 650, subjectA, '2026-10-10'),
      policy: { ...policy, bucketUtcDate: '2026-10-10' },
    });
    expect(tomorrow.disposition).toBe('ADMITTED');
    expect(inspectSeyeonCostBudgetV1(tomorrow.snapshot, {
      bucketUtcDate: '2026-10-10', subjectId: subjectA,
    }).subjectOccupiedMicroUsd).toBe(650);
    expect(() => reserveSeyeonCostCandidateV1({
      snapshot: tomorrow.snapshot,
      identity: identity('same-key', 650, subjectA, '2026-10-10'),
      policy: { ...policy, bucketUtcDate: '2026-10-10' },
    })).toThrow('conflicts with another request');
  });

  it('fails closed on invalid identity, impossible budgets, and illegal state transitions', () => {
    expect(() => reserveSeyeonCostCandidateV1({
      snapshot: emptySeyeonCostGovernorSnapshotV1(),
      identity: { ...identity('x', 50), subjectId: 'not-a-uuid' },
      policy,
    })).toThrow('Invalid Cost Governor Subject');
    expect(() => reserveSeyeonCostCandidateV1({
      snapshot: emptySeyeonCostGovernorSnapshotV1(),
      identity: identity('x', -1), policy,
    })).toThrow('reservation ceiling');
    expect(() => reserveSeyeonCostCandidateV1({
      snapshot: emptySeyeonCostGovernorSnapshotV1(),
      identity: identity('x', 1), policy: { ...policy, globalLimitMicroUsd: 0 },
    })).toThrow('global budget');
    expect(() => settleSeyeonCostReservationV1(
      emptySeyeonCostGovernorSnapshotV1(), 'no-key', 0,
    )).toThrow('does not exist');
  });
});
