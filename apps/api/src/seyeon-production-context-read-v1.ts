import type {
  ProductionRelationshipHistoryRecordV1,
} from '../../../packages/domain/src/relationship-policy-reference-replay-v1.js';

type Awaitable<T> = T | Promise<T>;

export const SEYEON_PRODUCTION_CONTEXT_READ_VERSION_V1 =
  'seyeon-production-context-read-v1' as const;

export type SeyeonProductionPersonalRecordKindV1 =
  | 'life_fact'
  | 'memory';

export interface SeyeonProductionPersonalRecordAuthorityRowV1 {
  readonly recordKind: SeyeonProductionPersonalRecordKindV1;
  readonly recordId: string;
  readonly recordType: string;
  readonly schemaVersion: string;
  readonly payload: unknown;
  readonly grantId: string;
  readonly grantReason: string;
  readonly grantedAt: string;
}

export interface SeyeonProductionRecentMessageAuthorityRowV1 {
  readonly messageId: string;
  readonly sequenceNo: number;
  readonly senderType: string;
  readonly characterId: string | null;
  readonly text: string;
  readonly createdAt: string;
}

export interface SeyeonProductionContextReadAuthorityPortV1 {
  readPersonalRecords(input: {
    readonly subjectId: string;
    readonly characterId: 'seyeon';
  }): Awaitable<readonly SeyeonProductionPersonalRecordAuthorityRowV1[]>;

  readRelationshipHistory(input: {
    readonly subjectId: string;
    readonly characterId: 'seyeon';
    readonly throughRevision: number;
  }): Awaitable<readonly ProductionRelationshipHistoryRecordV1[]>;

  readRecentMessages(input: {
    readonly subjectId: string;
    readonly threadId: string;
    readonly limit: number;
  }): Awaitable<readonly SeyeonProductionRecentMessageAuthorityRowV1[]>;
}

export type SeyeonProductionContextReadFailureCodeV1 =
  | 'INVALID_INPUT'
  | 'SUBJECT_INELIGIBLE'
  | 'CHARACTER_UNAVAILABLE'
  | 'THREAD_UNAVAILABLE'
  | 'RELATIONSHIP_REVISION_MISMATCH';

export class SeyeonProductionContextReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: SeyeonProductionContextReadFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'SeyeonProductionContextReadAuthorityPortErrorV1';
  }
}
