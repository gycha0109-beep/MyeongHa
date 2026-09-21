export interface ReaderGrantedLifeFactAuthorityRowV1 {
  readonly factId: string;
  readonly factType: string;
  readonly schemaVersion: string;
  readonly value: unknown;
  readonly grantId: string;
  readonly granteeCharacterId: string;
}

export interface ReaderRelationshipEventAuthorityRowV1 {
  readonly eventType: string;
  readonly eventSchemaVersion: string;
  readonly stateRevisionAfter: number;
  readonly policyVersion: string;
  readonly appliedAt: string;
}

export interface ReaderRecentMessageAuthorityRowV1 {
  readonly messageId: string;
  readonly sequenceNo: number;
  readonly senderType: string;
  readonly characterId: string | null;
  readonly text: string;
  readonly createdAt: string;
}

export interface ReaderContextNonMemoryReadAuthorityPortV1 {
  readGrantedLifeFacts(input: {
    readonly subjectId: string;
    readonly characterId: string;
  }): Promise<readonly ReaderGrantedLifeFactAuthorityRowV1[]>;

  readRelationshipEvents(input: {
    readonly subjectId: string;
    readonly characterId: string;
    readonly beforeRevision: number;
    readonly limit: number;
  }): Promise<readonly ReaderRelationshipEventAuthorityRowV1[]>;

  readRecentMessages(input: {
    readonly subjectId: string;
    readonly threadId: string;
    readonly limit: number;
  }): Promise<readonly ReaderRecentMessageAuthorityRowV1[]>;
}

export type ReaderContextNonMemoryReadAuthorityErrorCodeV1 =
  | 'INVALID_INPUT'
  | 'SUBJECT_INELIGIBLE'
  | 'THREAD_UNAVAILABLE';

export class ReaderContextNonMemoryReadAuthorityPortErrorV1 extends Error {
  readonly name = 'ReaderContextNonMemoryReadAuthorityPortErrorV1';

  constructor(
    readonly code: ReaderContextNonMemoryReadAuthorityErrorCodeV1,
    message: string,
  ) {
    super(message);
  }
}
