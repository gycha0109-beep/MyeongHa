import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import type {
  SeyeonProductionContextSnapshotV1,
} from './seyeon-production-context-v1.js';
import type {
  SeyeonProductionContextReadAuthorityPortV1,
  SeyeonProductionPersonalRecordKindV1,
} from './seyeon-production-context-read-v1.js';

/**
 * SHADOW-ONLY contract for future Commit / Controlled Reveal gates.
 *
 * This read-before-publication check is NOT atomic with a DB commit or response
 * delivery and MUST NOT be wired as a substitute for the same-transaction
 * authorization check + appropriate locking / revocation fencing.
 */
export const SEYEON_PERSONAL_RECORD_PUBLICATION_SHADOW_V1 =
  'seyeon-personal-record-publication-shadow-v1' as const;

export type SeyeonPersonalRecordPublicationPhaseV1 =
  'before_commit' | 'before_reveal';

export type SeyeonPersonalRecordPublicationReasonV1 =
  'NO_PERSONAL_RECORDS' | 'CURRENT_GRANTS_MATCH' |
  'UNVERIFIABLE_PINNED_REFERENCE' | 'CURRENT_AUTHORITY_UNAVAILABLE' |
  'REVOKED_OR_CHANGED_GRANT' | 'AMBIGUOUS_CURRENT_AUTHORITY' |
  'CHANGED_RECORD_CONTENT' | 'UNVERIFIABLE_DERIVED_CONTEXT';

export interface SeyeonPersonalRecordPublicationCheckV1 {
  readonly version: typeof SEYEON_PERSONAL_RECORD_PUBLICATION_SHADOW_V1;
  readonly phase: SeyeonPersonalRecordPublicationPhaseV1;
  readonly disposition: 'eligible_for_further_atomic_check' | 'hold';
  readonly reason: SeyeonPersonalRecordPublicationReasonV1;
  readonly checkedPersonalRecordCount: number;
  readonly authorityIsAtomicWithCommit: false;
  readonly permitsPublication: false;
}

type PinnedRef = Readonly<{
  recordKind: SeyeonProductionPersonalRecordKindV1;
  recordId: string;
  grantId: string;
}>;

const REF = /^(memory|life_fact):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):grant:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u;

function result(
  phase: SeyeonPersonalRecordPublicationPhaseV1,
  count: number,
  reason: SeyeonPersonalRecordPublicationReasonV1,
): SeyeonPersonalRecordPublicationCheckV1 {
  return Object.freeze({
    version: SEYEON_PERSONAL_RECORD_PUBLICATION_SHADOW_V1,
    phase,
    disposition: reason === 'CURRENT_GRANTS_MATCH' || reason === 'NO_PERSONAL_RECORDS'
      ? 'eligible_for_further_atomic_check' as const : 'hold' as const,
    reason,
    checkedPersonalRecordCount: count,
    authorityIsAtomicWithCommit: false as const,
    permitsPublication: false as const,
  });
}

function sourceRefKey(ref: PinnedRef): string {
  return [ref.recordKind, ref.recordId, ref.grantId].join(':');
}

const SHA = /^sha256:v1:[a-f0-9]{64}$/u;

function digest(value: unknown): string {
  return 'sha256:v1:' + createHash('sha256')
    .update(canonicalJson(value)).digest('hex');
}

/**
 * Only the server-composed, admitted model-input sources may be pinned.
 * Neither model output nor caller-supplied text can mint a grant reference.
 */
export async function evaluateSeyeonPersonalRecordPublicationShadowV1(input: {
  readonly resolvedSubjectId: string;
  readonly phase: SeyeonPersonalRecordPublicationPhaseV1;
  readonly serverComposedContext: SeyeonProductionContextSnapshotV1;
  readonly currentAuthority: Pick<
    SeyeonProductionContextReadAuthorityPortV1, 'readPersonalRecords'
  >;
}): Promise<SeyeonPersonalRecordPublicationCheckV1> {
  const snapshot = input.serverComposedContext;
  if (snapshot === null || typeof snapshot !== 'object' ||
      !Array.isArray(snapshot.retrievedMemories) ||
      !Array.isArray(snapshot.personalRecordAdmissions) ||
      !Array.isArray(snapshot.recentMessages) ||
      (snapshot.personalRecordProjectionCandidates !== undefined &&
       !Array.isArray(snapshot.personalRecordProjectionCandidates))) {
    return result(input.phase, 0, 'UNVERIFIABLE_PINNED_REFERENCE');
  }
  const memories = snapshot.retrievedMemories;
  if (memories.some(m => m === null || typeof m !== 'object') ||
      snapshot.personalRecordAdmissions.some(a =>
        a === null || typeof a !== 'object' ||
        (a.reason !== 'ADMITTED' && a.reason !== 'UNSUPPORTED_SCHEMA'))) {
    return result(input.phase, 0, 'UNVERIFIABLE_PINNED_REFERENCE');
  }
  const referenced = memories.filter(
    (item) => item.kind === 'memory' || item.kind === 'life_fact',
  );
  const candidates = snapshot.personalRecordProjectionCandidates ?? [];
  const admitted = snapshot.personalRecordAdmissions.filter(a => a.reason === 'ADMITTED');

  if (referenced.length === 0 && (admitted.length !== 0 || candidates.length !== 0)) {
    return result(input.phase, 0, 'UNVERIFIABLE_PINNED_REFERENCE');
  }
  if (referenced.length !== candidates.length) {
    return result(input.phase, referenced.length, 'UNVERIFIABLE_PINNED_REFERENCE');
  }

  const untrackedDerived = snapshot.recentMessages.length !== 0 ||
    memories.some(m => m.kind === 'relationship_event') ||
    snapshot.relationshipHistoryRecords?.length !== 0;
  if (untrackedDerived) {
    return result(input.phase, referenced.length, 'UNVERIFIABLE_DERIVED_CONTEXT');
  }
  if (referenced.length === 0) {
    return result(input.phase, 0, 'NO_PERSONAL_RECORDS');
  }

  const pinned: PinnedRef[] = [];
  const sources = new Map<string, (typeof candidates)[number]>();
  const seen = new Set<string>();
  for (const item of referenced) {
    const parsed = REF.exec(item.sourceRef);
    if (!parsed || parsed[1] !== item.kind ||
        item.memoryId !== item.kind + ':' + parsed[2]) {
      return result(input.phase, referenced.length, 'UNVERIFIABLE_PINNED_REFERENCE');
    }
    const ref = Object.freeze({
      recordKind: parsed[1] as SeyeonProductionPersonalRecordKindV1,
      recordId: parsed[2]!,
      grantId: parsed[3]!,
    });
    const key = sourceRefKey(ref);
    const candidate = candidates.find(c => c !== null && typeof c === 'object' &&
      c.recordKind === ref.recordKind && c.recordId === ref.recordId &&
      c.grantId === ref.grantId);
    if (seen.has(key) || !candidate ||
        candidate.projectedMemoryId !== item.memoryId ||
        !SHA.test(candidate.projectedMemoryDigest) ||
        !SHA.test(candidate.rawRecordDigest) ||
        candidate.permitsAtomicCommit !== false ||
        candidate.permitsHttpReveal !== false ||
        !admitted.some(a => a.recordKind === ref.recordKind &&
          a.recordId === ref.recordId &&
          a.recordType === candidate.recordType &&
          a.schemaVersion === candidate.schemaVersion)) {
      return result(input.phase, referenced.length, 'UNVERIFIABLE_PINNED_REFERENCE');
    }
    try {
      if (digest(item) !== candidate.projectedMemoryDigest) {
        return result(input.phase, referenced.length, 'UNVERIFIABLE_PINNED_REFERENCE');
      }
    } catch {
      return result(input.phase, referenced.length, 'UNVERIFIABLE_PINNED_REFERENCE');
    }
    seen.add(key);
    sources.set(key, candidate);
    pinned.push(ref);
  }

  let current;
  try {
    current = await input.currentAuthority.readPersonalRecords({
      subjectId: input.resolvedSubjectId,
      characterId: 'seyeon',
    });
  } catch {
    return result(input.phase, pinned.length, 'CURRENT_AUTHORITY_UNAVAILABLE');
  }
  if (!Array.isArray(current)) {
    return result(input.phase, pinned.length, 'AMBIGUOUS_CURRENT_AUTHORITY');
  }

  const currentKeys = new Map<string, (typeof current)[number]>();
  const recordKeys = new Set<string>();
  for (const row of current) {
    if (row === null || typeof row !== 'object' ||
        (row.recordKind !== 'life_fact' && row.recordKind !== 'memory') ||
        typeof row.recordId !== 'string' || typeof row.grantId !== 'string') {
      return result(input.phase, pinned.length, 'AMBIGUOUS_CURRENT_AUTHORITY');
    }
    const key = sourceRefKey(row);
    const recordKey = [row.recordKind, row.recordId].join(':');
    if (currentKeys.has(key) || recordKeys.has(recordKey)) {
      return result(input.phase, pinned.length, 'AMBIGUOUS_CURRENT_AUTHORITY');
    }
    currentKeys.set(key, row);
    recordKeys.add(recordKey);
  }
  for (const ref of pinned) {
    const key = sourceRefKey(ref);
    const row = currentKeys.get(key);
    if (!row) {
      return result(input.phase, pinned.length, 'REVOKED_OR_CHANGED_GRANT');
    }
    const candidate = sources.get(key)!;
    if (row.recordType !== candidate.recordType ||
        row.schemaVersion !== candidate.schemaVersion) {
      return result(input.phase, pinned.length, 'CHANGED_RECORD_CONTENT');
    }
    try {
      if (digest({
        kind: row.recordKind,
        recordId: row.recordId,
        grantId: row.grantId,
        recordType: row.recordType,
        schemaVersion: row.schemaVersion,
        payload: row.payload,
      }) !== candidate.rawRecordDigest) {
        return result(input.phase, pinned.length, 'CHANGED_RECORD_CONTENT');
      }
    } catch {
      return result(input.phase, pinned.length, 'CHANGED_RECORD_CONTENT');
    }
  }
  return result(input.phase, pinned.length, 'CURRENT_GRANTS_MATCH');
}
