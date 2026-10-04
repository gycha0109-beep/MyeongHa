import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  InMemorySeyeonEventLedgerV2,
  canonicalJson,
  type SeyeonDialogueEnvelopeV2,
  type SeyeonTurnInterpretationV2,
} from '../packages/domain/src/index.js';
import {
  processSeyeonPostTurnAnalysisV1,
  validateSeyeonPostTurnAnalysisSnapshotV1,
  type SeyeonPostTurnAnalysisOutboxPortV1,
  type SeyeonPostTurnAnalysisSnapshotV1,
} from '../apps/api/src/seyeon-post-turn-analysis-worker-v1.js';
import type {
  SeyeonStructuredProviderPortV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import type {
  SeyeonProductionRelationshipSyncOutboxPortV1,
} from '../apps/api/src/seyeon-production-relationship-outbox-v1.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const TURN_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const ASSISTANT_ID = '55555555-5555-4555-8555-555555555555';
const ANALYSIS_OUTBOX_ID = '66666666-6666-4666-8666-666666666666';
const EXPERIMENTAL_EVENT_ID = '77777777-7777-4777-8777-777777777777';
const PRODUCTION_EVENT_ID = '88888888-8888-4888-8888-888888888888';
const RELATIONSHIP_OUTBOX_ID = '99999999-9999-4999-8999-999999999999';
const COMMITTED_AT = '2026-10-04T02:00:00.000Z';

const interpretation: SeyeonTurnInterpretationV2 = Object.freeze({
  schemaVersion: 'seyeon-turn-interpretation-v2',
  userMove: 'offered_help',
  notice: Object.freeze({
    summary: '사용자가 세연에게 도움을 제안했다.',
    evidenceRefs: Object.freeze([USER_ID]),
  }),
  immediateWant: Object.freeze({
    key: 'care_without_credit',
    summary: '도움을 자연스럽게 받아들인다.',
  }),
  tension: Object.freeze({
    key: 'none_material',
    summary: '도움을 받는 데 익숙하지 않다.',
  }),
  chosenAction: Object.freeze({
    key: 'accept_care',
    rationale: '관계 맥락상 도움을 받아들이기로 한다.',
  }),
  expressionState: 'caring',
  reveal: Object.freeze({
    level: 'familiar',
    triggerRef: USER_ID,
    supportingHistoryRefs: Object.freeze([]),
  }),
  memoryRefsUsed: Object.freeze([]),
});

const envelope: SeyeonDialogueEnvelopeV2 = Object.freeze({
  schemaVersion: 'seyeon-dialogue-envelope-v2',
  utterance: '그럼 이번에는 조금 도움받아 볼게요.',
  expressionState: 'caring'
  revealLevel: 'familiar',
  memoryRefsMentioned: Object.freeze([]),
  privateSourceRefsMentioned: Object.freeze([]),
  disclosureSliceIds: Object.freeze([]),
  interpretationSchemaVersion: 'seyeon-turn-interpretation-v2',
  semanticReviewHash: 'sha256:v1:worker-test',
});

function snapshot(
  mode: SeyeonPostTurnAnalysisSnapshotV1['mode'] = 'WRITE_DARK',
): SeyeonPostTurnAnalysisSnapshotV1 {
  return Object.freeze({
    schemaVersion: 'seyeon-post-turn-analysis-snapshot-v1',
    mode,
    turnId: TURN_ID,
    userMessageId: USER_ID,
    assistantMessageId: ASSISTANT_ID,
    preparedAt: '2026-10-04T01:59:59.000Z',
    productionAuthorityRef: 'seyeon-prod:post-turn-worker-test',
    interpretation,
    envelope,
    eventAuthorityEvidence: Object.freeze({
      integrityDecisions: Object.freeze([]),
      riskCausality: null,
    }),
    priorEvents: Object.freeze([]),
    relationshipBefore:
      new InMemorySeyeonEventLedgerV2().projectRelationship(),
    productionCausalBindings: Object.freeze([]),
    identity: Object.freeze({
      experimentalEventId: EXPERIMENTAL_EVENT_ID,
      experimentalEventDedupeKey: 'seyeon-post-turn:care-accepted',
      productionEventId: PRODUCTION_EVENT_ID,
      relationshipSyncOutboxEventId: RELATIONSHIP_OUTBOX_ID,
    }),
  });
}

function hash(value: SeyeonPostTurnAnalysisSnapshotV1): string {
  return (
    'sha256:v1:' +
    createHash('sha256').update(canonicalJson(value)).digest('hex')
  );
}

function analysisPort(
  input: {
    snapshot: SeyeonPostTurnAnalysisSnapshotV1;
    order?: string[];
  },
): SeyeonPostTurnAnalysisOutboxPortV1 {
  return {
    claim(request) {
      input.order?.push('claim');
      expect(request.outboxEventId).toBe(ANALYSIS_OUTBOX_ID);
      return Object.freeze([
        Object.freeze({
          outboxEventId: ANALYSIS_OUTBOX_ID,
          turnId: TURN_ID,
          attemptId: ATTEMPT_ID,
          userMessageId: USER_ID,
          userText: '필요하면 제가 도와드릴게요.',
          assistantMessageId: ASSISTANT_ID,
          assistantText: envelope.utterance,
          committedAt: COMMITTED_AT,
          snapshotJsonb: input.snapshot,
          snapshotHash: hash(input.snapshot),
          status: 'processing',
          lockOwner: 'post-turn-worker-1',
          leaseExpiresAt: '2026-10-04T02:10:00.000Z',
          reclaimed: false,
        }),
      ]);
    },
    complete(request) {
      input.order?.push('complete');
      expect(request.outboxEventId).toBe(ANALYSIS_OUTBOX_ID);
      return Object.freeze([
        Object.freeze({
          outboxEventId: ANALYSIS_OUTBOX_ID,
          status: 'processed',
          processedAt: '2026-10-04T02:00:05.000Z',
          replayed: false,
        }),
      ]);
    },
  };
}

function noneProvider(): SeyeonStructuredProviderPortV2 {
  return {
    providerKey: 'test-extractor',
    modelKey: 'test-model',
    generate() {
      return {
        schemaVersion: 'seyeon-event-extraction-candidate-exp-v2',
        decision: 'none',
        reason: '새 durable relationship Event가 아니다.',
      };
    },
  };
}

function acceptedHelpProvider(): SeyeonStructuredProviderPortV2 {
  return {
    providerKey: 'test-extractor',
    modelKey: 'test-model',
    generate() {
      return {
        schemaVersion: 'seyeon-event-extraction-candidate-exp-v2',
        decision: 'event',
        reason: '세연이 현재 답변에서 실제로 도움을 받아들였다.',
        eventKind: 'SEYEON_ACCEPTED_HELP',
        sourceMessageRefs: [ASSISTANT_ID],
        causalPredecessorEventIds: [],
        facts: [
          {
            factKey: 'provider-proposal',
            statement: '세연이 도움을 받아들였다.',
            sourceRefs: [ASSISTANT_ID],
          },
        ],
        characterInterpretation: null,
        salience: 0.9,
        confidence: 0.95,
        dedupeBasis: 'provider-basis-is-not-authority',
      };
    },
  };
}

function baseInput(
  outboxPort: SeyeonPostTurnAnalysisOutboxPortV1,
  extractorProvider: SeyeonStructuredProviderPortV2,
) {
  return {
    subjectId: SUBJECT_ID,
    outboxEventId: ANALYSIS_OUTBOX_ID,
    lockOwner: 'post-turn-worker-1',
    leaseExpiresAt: '2026-10-04T02:10:00.000Z',
    outboxPort,
    extractorProvider,
  } as const;
}

describe('Se-yeon durable post-turn analysis worker V1', () => {
  it('rejects a tampered immutable snapshot hash', () => {
    const value = snapshot();
    expect(() =>
      validateSeyeonPostTurnAnalysisSnapshotV1(
        value,
        'sha256:v1:not-the-snapshot-hash',
      ),
    ).toThrow(/snapshot hash/i);
  });

  it('completes the dedicated job when extractor returns none', async () => {
    const order: string[] = [];
    const value = snapshot();
    const result = await processSeyeonPostTurnAnalysisV1(
      baseInput(
        analysisPort({ snapshot: value, order }),
        noneProvider(),
      ),
    );

    expect(result.decision).toBe('none');
    expect(order).toEqual(['claim', 'complete']);
  });

  it('enqueues the admitted Production relationship Event before completing the analysis job', async () => {
    const order: string[] = [];
    const value = snapshot();
    const relationshipPort: SeyeonProductionRelationshipSyncOutboxPortV1 = {
      enqueue(input) {
        order.push('relationship-enqueue');
        expect(input.outboxEventId).toBe(RELATIONSHIP_OUTBOX_ID);
        expect(input.turnId).toBe(TURN_ID);
        expect(input.productionEvent.eventId).toBe(PRODUCTION_EVENT_ID);
        expect(input.productionEvent.authority).toBe(
          'authorized_relationship_event_v1',
        );
        expect(input.productionEvent.eventKind).toBe(
          'CARE_ACCEPTED_BY_CHARACTER',
        );
        expect(input.productionEvent.source.sourceMessageRefs).toContain(
          ASSISTANT_ID,
        );
        return Object.freeze([
          Object.freeze({
            outboxEventId: RELATIONSHIP_OUTBOX_ID,
            status: 'pending',
            replayed: false,
          }),
        ]);
      },
      claim() {
        throw new Error('relationship apply worker is a separate phase');
      },
      complete() {
        throw new Error('relationship apply worker is a separate phase');
      },
    };

    const result = await processSeyeonPostTurnAnalysisV1({
      ...baseInput(
        analysisPort({ snapshot: value, order }),
        acceptedHelpProvider(),
      ),
      relationshipSyncOutboxPort: relationshipPort,
    });

    expect(result).toEqual(
      expect.objectContaining({
        decision: 'enqueued',
        productionEventId: PRODUCTION_EVENT_ID,
        relationshipSyncOutboxEventId: RELATIONSHIP_OUTBOX_ID,
        relationshipSyncReplayed: false,
      }),
    );
    expect(order).toEqual([
      'claim',
      'relationship-enqueue',
      'complete',
    ]);
  });

  it('does not complete the analysis job if relationship enqueue fails', async () => {
    const order: string[] = [];
    const value = snapshot();
    const relationshipPort: SeyeonProductionRelationshipSyncOutboxPortV1 = {
      enqueue() {
        order.push('relationship-enqueue');
        throw new Error('temporary relationship outbox failure');
      },
      claim() {
        throw new Error('not used');
      },
      complete() {
        throw new Error('not used');
      },
    };

    await expect(
      processSeyeonPostTurnAnalysisV1({
        ...baseInput(
          analysisPort({ snapshot: value, order }),
          acceptedHelpProvider(),
        ),
        relationshipSyncOutboxPort: relationshipPort,
      }),
    ).rejects.toThrow(/temporary relationship outbox failure/);

    expect(order).toEqual(['claim', 'relationship-enqueue']);
  });
});
