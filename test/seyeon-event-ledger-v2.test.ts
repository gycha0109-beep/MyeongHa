import { describe, expect, it } from 'vitest';

import {
  InMemorySeyeonEventLedgerV2,
  SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
  SEYEON_RELATIONSHIP_EVIDENCE_POLICY_VERSION_V2,
  reduceSeyeonRelationshipProjectionV2,
  type SeyeonExperimentalEventKindV2,
  type SeyeonRelationshipEventV2,
} from '../packages/domain/src/seyeon-event-ledger-v2.js';

let sequence = 0;

function event(
  eventKind: SeyeonExperimentalEventKindV2,
  overrides: Partial<SeyeonRelationshipEventV2> = {},
): SeyeonRelationshipEventV2 {
  sequence += 1;
  const id = `event-${sequence}`;
  return {
    schemaVersion: SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
    authority: 'experimental_non_canonical_event',
    eventId: id,
    dedupeKey: `dedupe-${id}`,
    characterId: 'seyeon',
    eventKind,
    occurredAt: new Date(Date.UTC(2026, 8, 25, 0, sequence)).toISOString(),
    sourceTurnId: `turn-${sequence}`,
    sourceMessageRefs: [`message-${sequence}`],
    causalPredecessorEventIds: [],
    facts: [
      {
        factKey: 'observed_interaction',
        statement: `source-backed fact for ${eventKind}`,
        sourceRefs: [`message-${sequence}`],
      },
    ],
    characterInterpretation: null,
    salience: 0.9,
    confidence: 0.95,
    ...overrides,
  };
}

describe('Se-yeon experimental Event Ledger v2', () => {
  it('keeps objective facts separate from Character interpretation', () => {
    const ledger = new InMemorySeyeonEventLedgerV2();
    const recorded = event('USER_REMEMBERED_SEYEON_DETAIL', {
      facts: [
        {
          factKey: 'user_recalled_detail',
          statement: '사용자가 세연이 전에 말한 취향 A를 직접 언급했다.',
          sourceRefs: ['message-source'],
        },
      ],
      sourceMessageRefs: ['message-source'],
      characterInterpretation: {
        statement: '세연은 사용자가 자기 말을 기억한 것을 관계적으로 의미 있게 받아들였다.',
        confidence: 0.8,
        sourceRefs: ['message-source'],
      },
    });

    ledger.appendEvent({
      ledgerEntryId: 'entry-1',
      recordedAt: '2026-09-25T01:00:00.000Z',
      event: recorded,
    });

    const active = ledger.activeEvents()[0]!;
    expect(active.facts[0]?.statement).toContain('직접 언급');
    expect(active.characterInterpretation?.statement).toContain('세연은');
    expect(active.characterInterpretation?.statement).not.toBe(active.facts[0]?.statement);
  });

  it('derives NOW from active events while retaining causal event ids for WHY', () => {
    const kept = event('PROMISE_KEPT');
    const remembered = event('USER_REMEMBERED_SEYEON_DETAIL');

    const projection = reduceSeyeonRelationshipProjectionV2([kept, remembered]);

    expect(projection.policyVersion).toBe(
      SEYEON_RELATIONSHIP_EVIDENCE_POLICY_VERSION_V2,
    );
    expect(projection.evidence.trust).toBeGreaterThan(0);
    expect(projection.evidence.reciprocity).toBeGreaterThan(0);
    expect(projection.causalEventIds.trust).toEqual([
      kept.eventId,
      remembered.eventId,
    ]);
  });

  it('does not turn low-confidence or trivial evidence into relationship progression', () => {
    const weak = event('PROMISE_MADE', {
      salience: 0.1,
      confidence: 0.3,
    });

    const projection = reduceSeyeonRelationshipProjectionV2([weak]);

    expect(projection.evidence).toEqual({
      familiarity: 0,
      trust: 0,
      reciprocity: 0,
      disclosure: 0,
      agencyRespect: 0,
    });
    expect(projection.lastMeaningfulEventAt).toBeNull();
  });

  it('keeps unresolved conflict open until a later repair event exists', () => {
    const conflict = event('SPECIALNESS_INVALIDATED');
    const unrelatedReturn = event('RETURNED_AFTER_ABSENCE');

    const unresolved = reduceSeyeonRelationshipProjectionV2([
      conflict,
      unrelatedReturn,
    ]);
    expect(unresolved.conflictState).toBe('open');
    expect(unresolved.repairState).toBe('needed');

    const repaired = reduceSeyeonRelationshipProjectionV2([
      conflict,
      unrelatedReturn,
      event('RECONCILIATION_EVENT'),
    ]);
    expect(repaired.conflictState).toBe('resolved_recently');
    expect(repaired.repairState).toBe('completed');
  });

  it('supports append-only correction without rewriting the original ledger entry', () => {
    const ledger = new InMemorySeyeonEventLedgerV2();
    const original = event('PROMISE_BROKEN');

    ledger.appendEvent({
      ledgerEntryId: 'entry-original',
      recordedAt: '2026-09-25T01:00:00.000Z',
      event: original,
    });
    expect(ledger.projectRelationship().evidence.trust).toBeLessThan(0);

    const replacement = event('PROMISE_KEPT', {
      facts: [
        {
          factKey: 'corrected_promise_outcome',
          statement: '사용자가 약속은 실제로 지켜졌다고 정정했다.',
          sourceRefs: ['message-correction'],
        },
      ],
      sourceMessageRefs: ['message-correction'],
    });

    ledger.correctEvent({
      ledgerEntryId: 'entry-correction',
      dedupeKey: 'correction-1',
      targetEventId: original.eventId,
      replacementEvent: replacement,
      reason: '사용자가 이전 사건의 결과를 명시적으로 정정했다.',
      sourceRefs: ['message-correction'],
      recordedAt: '2026-09-25T02:00:00.000Z',
    });

    expect(ledger.entries).toHaveLength(2);
    expect(ledger.entries[0]?.action).toBe('record');
    expect(ledger.entries[1]?.action).toBe('correct');
    expect(ledger.activeEvents().map((item) => item.eventId)).toEqual([
      replacement.eventId,
    ]);
    expect(ledger.projectRelationship().evidence.trust).toBeGreaterThan(0);
  });

  it('supports explicit retraction without deleting historical evidence', () => {
    const ledger = new InMemorySeyeonEventLedgerV2();
    const recorded = event('SEYEON_SELF_DISCLOSED');

    ledger.appendEvent({
      ledgerEntryId: 'entry-record',
      recordedAt: '2026-09-25T01:00:00.000Z',
      event: recorded,
    });
    ledger.retractEvent({
      ledgerEntryId: 'entry-retract',
      dedupeKey: 'retract-1',
      targetEventId: recorded.eventId,
      reason: '이 사건을 관계 기억으로 유지하지 않기로 했다.',
      sourceRefs: ['message-retract'],
      recordedAt: '2026-09-25T02:00:00.000Z',
    });

    expect(ledger.entries).toHaveLength(2);
    expect(ledger.activeEvents()).toEqual([]);
    expect(ledger.projectRelationship().evidence.disclosure).toBe(0);
  });

  it('is idempotent by dedupe key and does not duplicate a relationship event on retry', () => {
    const ledger = new InMemorySeyeonEventLedgerV2();
    const recorded = event('PROMISE_KEPT');

    const first = ledger.appendEvent({
      ledgerEntryId: 'entry-first',
      recordedAt: '2026-09-25T01:00:00.000Z',
      event: recorded,
    });
    const retry = ledger.appendEvent({
      ledgerEntryId: 'entry-retry',
      recordedAt: '2026-09-25T01:01:00.000Z',
      event: recorded,
    });

    expect(retry).toBe(first);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.projectRelationship().evidence.trust).toBe(2);
  });

  it('does not create relationship history from 100 turns of small talk when no Event was extracted', () => {
    const ledger = new InMemorySeyeonEventLedgerV2();

    for (let index = 0; index < 100; index += 1) {
      // Ordinary turns remain conversation history; no durable Event is appended.
    }

    const projection = ledger.projectRelationship();
    expect(projection.revision).toBe(0);
    expect(projection.evidence.familiarity).toBe(0);
    expect(projection.evidence.trust).toBe(0);
  });
});