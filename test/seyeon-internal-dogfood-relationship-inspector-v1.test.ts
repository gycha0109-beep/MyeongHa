import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  replayProductionRelationshipHistoryV1,
  type ProductionRelationshipEventKindV1,
  type ProductionRelationshipEventV1,
  type ProductionRelationshipHistoryRecordV1,
} from '../packages/domain/src/index.js';
import {
  inspectSeyeonInternalDogfoodRelationshipV1,
} from '../apps/api/src/seyeon-internal-dogfood-relationship-inspector-v1.js';

const START = Date.parse('2026-01-01T00:00:00.000Z');
const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';

function payloadFor(
  kind: ProductionRelationshipEventKindV1,
  key: string,
): Readonly<Record<string, string>> {
  switch (kind) {
    case 'COMMITMENT_MADE':
    case 'COMMITMENT_KEPT':
    case 'COMMITMENT_BROKEN':
      return Object.freeze({ commitmentKey: key });
    case 'CHARACTER_DETAIL_REMEMBERED':
      return Object.freeze({ detailKey: key });
    case 'CARE_ACCEPTED_BY_CHARACTER':
    case 'CARE_REQUESTED_BY_CHARACTER':
      return Object.freeze({ careKey: key });
    case 'CHARACTER_SELF_DISCLOSURE':
    case 'CHARACTER_VULNERABILITY_REVEALED':
      return Object.freeze({ topicKey: key });
    case 'RELATIONAL_EXPECTATION_INVALIDATED':
      return Object.freeze({ expectationKey: key });
    case 'CONFLICT_OPENED':
      return Object.freeze({ conflictKey: key });
    case 'RECONCILIATION':
      return Object.freeze({ resolutionKey: key });
    case 'RETURN_AFTER_ABSENCE':
      return Object.freeze({ observationKey: key });
  }
}

function event(input: {
  readonly id: string;
  readonly kind: ProductionRelationshipEventKindV1;
  readonly day: number;
  readonly predecessorIds?: readonly string[];
}): ProductionRelationshipEventV1 {
  const sourceRef = 'source:' + input.id;
  return Object.freeze({
    schemaVersion: 'relationship-event-v1',
    authority: 'authorized_relationship_event_v1',
    eventId: input.id,
    dedupeKey: 'dedupe:' + input.id,
    subjectId: SUBJECT_ID,
    characterId: 'seyeon',
    eventKind: input.kind,
    eventSchemaVersion: '1',
    characterBehaviorKey:
      input.kind === 'RETURN_AFTER_ABSENCE'
        ? null
        : 'seyeon.' + input.id,
    occurredAt: new Date(
      START + (input.day - 1) * 24 * 60 * 60 * 1000,
    ).toISOString(),
    source: Object.freeze({
      sourceKind:
        input.kind === 'RETURN_AFTER_ABSENCE'
          ? ('server_observation' as const)
          : ('conversation_turn' as const),
      sourceRef,
      sourceMessageRefs:
        input.kind === 'RETURN_AFTER_ABSENCE'
          ? Object.freeze([])
          : Object.freeze(['message:' + input.id]),
      authorityRefs: Object.freeze(['authority:' + input.id]),
    }),
    causalPredecessorEventIds: Object.freeze([
      ...(input.predecessorIds ?? []),
    ]),
    facts: Object.freeze([
      Object.freeze({
        factKey: 'fact:' + input.id,
        statement: 'Authority-backed relationship fixture ' + input.id,
        sourceRefs: Object.freeze([sourceRef]),
      }),
    ]),
    characterInterpretation: null,
    payload: payloadFor(input.kind, 'semantic:' + input.id),
  });
}

function establishedS3(): ProductionRelationshipEventV1[] {
  const events: ProductionRelationshipEventV1[] = [];
  for (let week = 0; week < 20; week += 1) {
    events.push(
      event({
        id: 'care-' + week,
        kind: 'CARE_ACCEPTED_BY_CHARACTER',
        day: week * 7 + 1,
      }),
      event({
        id: 'recognition-' + week,
        kind: 'CHARACTER_DETAIL_REMEMBERED',
        day: week * 7 + 2,
      }),
    );
  }
  return events;
}

function records(
  events: readonly ProductionRelationshipEventV1[],
): readonly ProductionRelationshipHistoryRecordV1[] {
  return Object.freeze(
    events.map((value) =>
      Object.freeze({
        action: 'record' as const,
        ledgerEntryId: 'entry:' + value.eventId,
        dedupeKey: 'entry:' + value.dedupeKey,
        recordedAt: value.occurredAt,
        event: value,
      }),
    ),
  );
}

async function inspect(
  history: readonly ProductionRelationshipHistoryRecordV1[],
) {
  const replay = replayProductionRelationshipHistoryV1(history);
  return await inspectSeyeonInternalDogfoodRelationshipV1({
    subjectId: SUBJECT_ID,
    relationshipReadPort: {
      readCurrent: () => [
        {
          stateId: 'state-1',
          subjectId: SUBJECT_ID,
          characterId: 'seyeon',
          closeness: replay.projection.scores.closeness,
          trust: replay.projection.scores.trust,
          friction: replay.projection.scores.friction,
          attainedStage: replay.projection.attainedStage,
          currentCandidateStage:
            replay.projection.currentCandidateStage,
          currentCondition: replay.projection.currentCondition,
          policyVersion: replay.projection.policyVersion,
          policyContentHash: replay.projection.policyContentHash,
          policyStateSchemaVersion:
            'relationship-policy-state-v1',
          policyStateJsonb: {
            behaviorAccess: replay.projection.behaviorAccess,
          },
          revision: replay.physicalRevision,
          lastInteractionAt: null,
          updatedAt: '2026-10-04T00:00:00.000Z',
        },
      ],
    },
    contextReadPort: {
      readPersonalRecords: () => [],
      readRecentMessages: () => [],
      readRelationshipHistory: () => history,
    },
  });
}

describe('Se-yeon relationship dogfood inspection V1', () => {
  it('reads an established S3 OPEN_CONFLICT state from authoritative history', async () => {
    const conflict = event({
      id: 'conflict',
      kind: 'CONFLICT_OPENED',
      day: 150,
    });
    const inspection = await inspect(records([
      ...establishedS3(),
      conflict,
    ]));

    expect(inspection.relationship).toMatchObject({
      attainedStage: 'S3_OPENED',
      currentCondition: 'OPEN_CONFLICT',
      behaviorAccess: 'RESTRICTED_BY_CONFLICT',
      frictionBand: 'high',
    });
    expect(inspection.activeEventKinds).toContain('CONFLICT_OPENED');
  });

  it('reads RESOLVED_RECENTLY after an authoritative reconciliation without resetting attained depth', async () => {
    const conflict = event({
      id: 'conflict',
      kind: 'CONFLICT_OPENED',
      day: 150,
    });
    const repair = event({
      id: 'repair',
      kind: 'RECONCILIATION',
      day: 151,
      predecessorIds: [conflict.eventId],
    });
    const inspection = await inspect(records([
      ...establishedS3(),
      conflict,
      repair,
    ]));

    expect(inspection.relationship).toMatchObject({
      attainedStage: 'S3_OPENED',
      currentCondition: 'RESOLVED_RECENTLY',
      behaviorAccess: 'CAUTIOUS_AFTER_REPAIR',
      frictionBand: 'medium',
    });
    expect(inspection.activeEventKinds).toEqual(
      expect.arrayContaining(['CONFLICT_OPENED', 'RECONCILIATION']),
    );
  });

  it('keeps RETURN_AFTER_ABSENCE non-progressive while preserving it in active history', async () => {
    const established = establishedS3();
    const before = replayProductionRelationshipHistoryV1(
      records(established),
    );
    const returned = event({
      id: 'returned',
      kind: 'RETURN_AFTER_ABSENCE',
      day: 180,
    });
    const inspection = await inspect(records([
      ...established,
      returned,
    ]));

    expect(inspection.relationship).toMatchObject({
      attainedStage: 'S3_OPENED',
      currentCondition: 'STABLE',
      behaviorAccess: 'STAGE_ALIGNED',
    });
    expect(inspection.relationship?.revision).toBe(
      before.physicalRevision + 1,
    );
    expect(inspection.activeEventKinds).toContain(
      'RETURN_AFTER_ABSENCE',
    );
    expect(PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.eventRegistry)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          eventKind: 'RETURN_AFTER_ABSENCE',
          progressionEligible: false,
        }),
      ]));
  });
});
