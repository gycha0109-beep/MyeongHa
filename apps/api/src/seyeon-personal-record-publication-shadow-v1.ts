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
  'REVOKED_OR_CHANGED_GRANT' | 'AMBIGUOUS_CURRENT_AUTHORITY';

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
  const referenced = input.serverComposedContext.retrievedMemories.filter(
    (item) => item.kind === 'memory' || item.kind === 'life_fact',
  );
  if (referenced.length === 0) {
    // This does not authorize publication of other context such as relationship
    // memories, nor a future Reader flow with a different source registry.
    return result(input.phase, 0, 'NO_PERSONAL_RECORDS');
  }

  const pinned: PinnedRef[] = [];
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
    if (seen.has(key)) {
      return result(input.phase, referenced.length, 'UNVERIFIABLE_PINNED_REFERENCE');
    }
    seen.add(key);
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

  const currentKeys = new Set<string>();
  for (const row of current) {
    if (row.recordKind !== 'life_fact' && row.recordKind !== 'memory') {
      return result(input.phase, pinned.length, 'AMBIGUOUS_CURRENT_AUTHORITY');
    }
    const key = sourceRefKey(row);
    if (currentKeys.has(key)) {
      return result(input.phase, pinned.length, 'AMBIGUOUS_CURRENT_AUTHORITY');
    }
    currentKeys.add(key);
  }
  if (pinned.some((ref) => !currentKeys.has(sourceRefKey(ref)))) {
    return result(input.phase, pinned.length, 'REVOKED_OR_CHANGED_GRANT');
  }
  return result(input.phase, pinned.length, 'CURRENT_GRANTS_MATCH');
}
