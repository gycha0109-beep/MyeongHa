import {
  evaluateProductionRelationshipHistoryV1,
  type ProductionRelationshipProjectionV1,
} from './relationship-policy-evaluator-v1.js';
import {
  validateProductionRelationshipEventV1,
  type ProductionRelationshipEventV1,
} from './relationship-event-registry-v1.js';

export type ProductionRelationshipHistoryRecordV1 =
  | Readonly<{
      readonly action: 'record';
      readonly ledgerEntryId: string;
      readonly dedupeKey: string;
      readonly recordedAt: string;
      readonly event: ProductionRelationshipEventV1;
    }>
  | Readonly<{
      readonly action: 'correct';
      readonly ledgerEntryId: string;
      readonly dedupeKey: string;
      readonly recordedAt: string;
      readonly targetEventId: string;
      readonly replacementEvent: ProductionRelationshipEventV1;
      readonly reason: string;
    }>
  | Readonly<{
      readonly action: 'retract';
      readonly ledgerEntryId: string;
      readonly dedupeKey: string;
      readonly recordedAt: string;
      readonly targetEventId: string;
      readonly reason: string;
    }>;

export interface ProductionRelationshipReplayResultV1 {
  readonly physicalRevision: number;
  readonly activeEvents: readonly ProductionRelationshipEventV1[];
  readonly projection: ProductionRelationshipProjectionV1;
  readonly correctionAliases: Readonly<Record<string, string>>;
  readonly retractedEventIds: readonly string[];
}

export class ProductionRelationshipReplayErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionRelationshipReplayErrorV1';
  }
}

function boundedText(value: string, path: string, maxLength = 512): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new ProductionRelationshipReplayErrorV1(
      path + ' must be non-empty text within ' + maxLength + ' characters.',
    );
  }
  return normalized;
}

function validateInstant(value: string, path: string): string {
  const normalized = boundedText(value, path, 64);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new ProductionRelationshipReplayErrorV1(
      path + ' must be an ISO-compatible instant.',
    );
  }
  return new Date(Date.parse(normalized)).toISOString();
}

function resolveAlias(
  eventId: string,
  aliases: ReadonlyMap<string, string>,
): string {
  const visited = new Set<string>();
  let current = eventId;
  while (aliases.has(current)) {
    if (visited.has(current)) {
      throw new ProductionRelationshipReplayErrorV1(
        'Correction lineage contains a cycle.',
      );
    }
    visited.add(current);
    current = aliases.get(current)!;
  }
  return current;
}

export function replayProductionRelationshipHistoryV1(
  records: readonly ProductionRelationshipHistoryRecordV1[],
): ProductionRelationshipReplayResultV1 {
  const seenCommandDedupeKeys = new Set<string>();
  const knownEventIds = new Set<string>();
  const active = new Map<string, ProductionRelationshipEventV1>();
  const logicalOrder: string[] = [];
  const aliases = new Map<string, string>();
  const retracted = new Set<string>();
  let physicalRevision = 0;

  for (const rawRecord of records) {
    const ledgerEntryId = boundedText(
      rawRecord.ledgerEntryId,
      'ledgerEntryId',
      256,
    );
    void ledgerEntryId;
    const dedupeKey = boundedText(rawRecord.dedupeKey, 'dedupeKey', 256);
    validateInstant(rawRecord.recordedAt, 'recordedAt');

    if (seenCommandDedupeKeys.has(dedupeKey)) {
      continue;
    }
    seenCommandDedupeKeys.add(dedupeKey);
    physicalRevision += 1;

    if (rawRecord.action === 'record') {
      const event = validateProductionRelationshipEventV1(rawRecord.event);
      if (knownEventIds.has(event.eventId)) {
        throw new ProductionRelationshipReplayErrorV1(
          'record eventId must be globally unique in relationship history.',
        );
      }
      knownEventIds.add(event.eventId);
      active.set(event.eventId, event);
      logicalOrder.push(event.eventId);
      continue;
    }

    const targetEventId = boundedText(
      rawRecord.targetEventId,
      'targetEventId',
      256,
    );
    if (!active.has(targetEventId)) {
      throw new ProductionRelationshipReplayErrorV1(
        rawRecord.action + ' target must be an active Event.',
      );
    }

    if (rawRecord.action === 'retract') {
      boundedText(rawRecord.reason, 'reason', 1200);
      active.delete(targetEventId);
      retracted.add(targetEventId);
      const index = logicalOrder.indexOf(targetEventId);
      if (index >= 0) logicalOrder.splice(index, 1);
      continue;
    }

    boundedText(rawRecord.reason, 'reason', 1200);
    const replacement = validateProductionRelationshipEventV1(
      rawRecord.replacementEvent,
    );
    if (knownEventIds.has(replacement.eventId)) {
      throw new ProductionRelationshipReplayErrorV1(
        'replacement eventId must be new and globally unique.',
      );
    }

    const target = active.get(targetEventId)!;
    if (
      replacement.subjectId !== target.subjectId ||
      replacement.characterId !== target.characterId
    ) {
      throw new ProductionRelationshipReplayErrorV1(
        'Correction replacement must remain inside the same subject-character relationship.',
      );
    }

    knownEventIds.add(replacement.eventId);
    active.delete(targetEventId);
    active.set(replacement.eventId, replacement);
    aliases.set(targetEventId, replacement.eventId);

    const index = logicalOrder.indexOf(targetEventId);
    if (index < 0) {
      throw new ProductionRelationshipReplayErrorV1(
        'Correction target is missing from logical history order.',
      );
    }
    logicalOrder[index] = replacement.eventId;
  }

  const activeEvents = logicalOrder.map((eventId) => {
    const event = active.get(eventId);
    if (event === undefined) {
      throw new ProductionRelationshipReplayErrorV1(
        'Logical history references an inactive Event.',
      );
    }

    const causalPredecessorEventIds = event.causalPredecessorEventIds.map(
      (predecessorId) => {
        const resolved = resolveAlias(predecessorId, aliases);
        if (!active.has(resolved)) {
          throw new ProductionRelationshipReplayErrorV1(
            'Active Event has a causal predecessor removed by retraction without an authorized replacement.',
          );
        }
        return resolved;
      },
    );

    return Object.freeze({
      ...event,
      causalPredecessorEventIds: Object.freeze(causalPredecessorEventIds),
    });
  });

  const projection = evaluateProductionRelationshipHistoryV1(activeEvents, {
    physicalRevision,
  });

  return Object.freeze({
    physicalRevision,
    activeEvents: Object.freeze(activeEvents),
    projection,
    correctionAliases: Object.freeze(Object.fromEntries(aliases)),
    retractedEventIds: Object.freeze([...retracted]),
  });
}
