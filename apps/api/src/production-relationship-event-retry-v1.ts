import { randomUUID } from 'node:crypto';

import type { ProductionRelationshipEventV1 } from '../../../packages/domain/src/index.js';
import {
  ProductionRelationshipApplyErrorV1,
  applyProductionRelationshipEventV1,
  type ApplyProductionRelationshipEventResultV1,
  type ProductionRelationshipApplyIdPortV1,
} from './production-relationship-event-apply-command-v1.js';
import {
  createPostgresProductionRelationshipApplyPortV1,
} from './postgres-production-relationship-event-apply-v1.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

export const PRODUCTION_RELATIONSHIP_APPLY_MAX_ATTEMPTS_V1 = 3 as const;

export interface ExecuteProductionRelationshipEventWithRetryInputV1 {
  readonly pool: PostgresSubjectPoolV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly expectedRevision: number;
  readonly event: ProductionRelationshipEventV1;
  readonly maxAttempts?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

function idPort(): ProductionRelationshipApplyIdPortV1 {
  return Object.freeze({
    nextStateId: () => randomUUID(),
    nextHistoryEntryId: () => randomUUID(),
    nextProvenanceRefId: () => randomUUID(),
  });
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function backoffMs(attemptNumber: number): number {
  return attemptNumber <= 1 ? 25 : 75;
}

function isRetryableStale(error: unknown): boolean {
  return (
    error instanceof ProductionRelationshipApplyErrorV1 &&
    error.code === 'STALE_RELATIONSHIP_REVISION'
  );
}

export async function executeProductionRelationshipEventWithRetryV1(
  input: ExecuteProductionRelationshipEventWithRetryInputV1,
): Promise<ApplyProductionRelationshipEventResultV1> {
  const maxAttempts = input.maxAttempts ?? PRODUCTION_RELATIONSHIP_APPLY_MAX_ATTEMPTS_V1;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new RangeError('Production relationship retry attempts must be within 1..3.');
  }

  const sleep = input.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await executePostgresSubjectTransactionV1({
        pool: input.pool,
        verifiedEvidence: input.verifiedEvidence,
        execute: async ({ resolvedSubject, client }) => {
          const port = createPostgresProductionRelationshipApplyPortV1(client);
          let expectedRevision = input.expectedRevision;

          if (attempt > 1) {
            const refreshed = await port.lockAndLoad({
              subjectId: resolvedSubject.subjectId,
              stateId: randomUUID(),
              characterId: input.event.characterId,
              sourceKind: input.event.source.sourceKind,
              sourceRef: input.event.source.sourceRef,
              sourceMessageRefs: input.event.source.sourceMessageRefs,
              eventOccurredAt: input.event.occurredAt,
            });
            expectedRevision = refreshed.revision;
          }

          return applyProductionRelationshipEventV1({
            resolvedSubjectId: resolvedSubject.subjectId,
            expectedRevision,
            event: input.event,
            idPort: idPort(),
            contextPort: port,
            commitPort: port,
          });
        },
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableStale(error) || attempt >= maxAttempts) throw error;
      await sleep(backoffMs(attempt));
    }
  }

  throw lastError;
}
