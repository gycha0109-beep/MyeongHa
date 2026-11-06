export const READER_CONTEXT_GRANTED_MEMORY_READ_AUTHORITY_BINDING_V1 =
  'public.qry_reader_context_granted_memory_items_v2' as const;

export interface ReaderGrantedMemoryAuthorityRowV1 {
  readonly memoryItemId: string;
  readonly memoryType: string;
  readonly schemaVersion: string;
  readonly content: unknown;
  readonly createdByCharacterId: string | null;
  readonly createdAt: string;
  readonly grantId: string;
  readonly granteeCharacterId: string;
  readonly grantReason: 'user_choice' | 'merge_import';
  readonly grantedAt: string;
  readonly sourceKind: 'user_approved' | 'merge_import';
  readonly sourceTurnId: string | null;
  readonly sourceMessageId: string | null;
  readonly sourceMergeActionId: string | null;
}

export type ReaderContextMemoryReadAuthorityFailureCodeV1 =
  | 'INVALID_INPUT'
  | 'SUBJECT_INELIGIBLE'
  | 'SUBJECT_CONTEXT_MISMATCH';

export class ReaderContextMemoryReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: ReaderContextMemoryReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ReaderContextMemoryReadAuthorityPortErrorV1';
  }
}

/**
 * Read-only Character-scoped Memory source.
 *
 * Implementations return only current, non-revoked Memory Items with an active
 * explicit grant to the requested Character, plus provenance stored on that
 * same authoritative row. This port does not validate positive Memory schemas,
 * create records, or change grants.
 */
export interface ReaderContextMemoryReadAuthorityPortV1 {
  readGrantedMemories(input: {
    readonly subjectId: string;
    readonly characterId: string;
  }): Promise<readonly ReaderGrantedMemoryAuthorityRowV1[]>;
}
