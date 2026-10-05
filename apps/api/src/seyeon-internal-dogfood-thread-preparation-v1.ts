import {
  openMemberSingleCharacterThreadV1,
  type OpenMemberSingleCharacterThreadInputV1,
  type OpenMemberSingleCharacterThreadResultV1,
} from './chat-open-http.js';
import type {
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type {
  SeyeonInternalDogfoodEvidenceInspectorV1,
  SeyeonInternalDogfoodEvidenceSnapshotV1,
} from './seyeon-internal-dogfood-evidence-v1.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

export const SEYEON_INTERNAL_DOGFOOD_THREAD_PREPARATION_VERSION_V1 =
  'seyeon-internal-dogfood-thread-preparation-v1' as const;

export type SeyeonInternalDogfoodThreadPreparationStatusV1 =
  | 'READY_CREATED'
  | 'READY_REUSED_EMPTY'
  | 'NOT_RUN_PREREQUISITE';

type OpenThreadV1 = (
  input: OpenMemberSingleCharacterThreadInputV1,
) => Promise<OpenMemberSingleCharacterThreadResultV1>;

export interface PrepareSeyeonInternalDogfoodThreadInputV1 {
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly evidenceInspector: SeyeonInternalDogfoodEvidenceInspectorV1;
  readonly createUuid: () => string;
  readonly openThread?: OpenThreadV1;
}

export interface SeyeonInternalDogfoodThreadPreparationResultV1 {
  readonly version:
    typeof SEYEON_INTERNAL_DOGFOOD_THREAD_PREPARATION_VERSION_V1;
  readonly status: SeyeonInternalDogfoodThreadPreparationStatusV1;
  readonly reasons: readonly string[];
  readonly threadId: string | null;
  readonly created: boolean | null;
  readonly preflight: SeyeonInternalDogfoodEvidenceSnapshotV1 | null;
}

function notRun(
  reasons: readonly string[],
  threadId: string | null = null,
  created: boolean | null = null,
  preflight: SeyeonInternalDogfoodEvidenceSnapshotV1 | null = null,
): SeyeonInternalDogfoodThreadPreparationResultV1 {
  return Object.freeze({
    version: SEYEON_INTERNAL_DOGFOOD_THREAD_PREPARATION_VERSION_V1,
    status: 'NOT_RUN_PREREQUISITE' as const,
    reasons: Object.freeze([...reasons]),
    threadId,
    created,
    preflight,
  });
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : null;
}

function contentPrerequisiteReason(error: unknown): string | null {
  const constraint = postgresConstraint(error);
  if (constraint === 'member_character_thread_active_default_required') {
    return 'Production active default Character content release is unavailable.';
  }
  if (constraint === 'member_character_thread_active_bundle_required') {
    return 'Production active default Character content bundle is unavailable.';
  }
  if (constraint === 'member_character_thread_character_published') {
    return 'Se-yeon is not published in the active Production Character content bundle.';
  }
  if (constraint === 'member_character_thread_character_available') {
    return 'Se-yeon is not currently available in the active Production Character content bundle.';
  }
  return null;
}

export async function prepareSeyeonInternalDogfoodThreadV1(
  input: PrepareSeyeonInternalDogfoodThreadInputV1,
): Promise<SeyeonInternalDogfoodThreadPreparationResultV1> {
  if (input.verifiedEvidence.kind !== 'member') {
    return notRun([
      'First-meeting live campaign requires verified Member identity.',
    ]);
  }

  const openThread =
    input.openThread ?? openMemberSingleCharacterThreadV1;

  let opened: OpenMemberSingleCharacterThreadResultV1;
  try {
    opened = await openThread({
      verifiedEvidence: input.verifiedEvidence,
      characterId: 'seyeon',
      pool: input.pool,
      createUuid: input.createUuid,
    });
  } catch (error) {
    const reason = contentPrerequisiteReason(error);
    if (reason !== null) {
      return notRun([reason]);
    }
    throw error;
  }

  if ('forbiddenGuest' in opened) {
    return notRun([
      'Member thread-open authority rejected the verified identity.',
    ]);
  }

  const preflight = await input.evidenceInspector.inspect({
    verifiedEvidence: input.verifiedEvidence,
    threadId: opened.threadId,
  });
  const reasons: string[] = [];

  if (
    preflight.thread.participantCharacterIds.length !== 1 ||
    preflight.thread.participantCharacterIds[0] !== 'seyeon'
  ) {
    reasons.push(
      'Prepared thread is not an authoritative single-character Se-yeon thread.',
    );
  }
  if (preflight.stream.messageCount !== 0) {
    reasons.push(
      'Prepared Se-yeon thread already contains authoritative Chat messages.',
    );
  }
  if (
    preflight.relationship.relationship !== null ||
    preflight.relationship.activeEventIds.length !== 0
  ) {
    reasons.push(
      'Prepared Member already has authoritative Se-yeon relationship history.',
    );
  }

  if (reasons.length > 0) {
    return notRun(
      reasons,
      opened.threadId,
      opened.created,
      preflight,
    );
  }

  return Object.freeze({
    version: SEYEON_INTERNAL_DOGFOOD_THREAD_PREPARATION_VERSION_V1,
    status:
      opened.created
        ? 'READY_CREATED' as const
        : 'READY_REUSED_EMPTY' as const,
    reasons: Object.freeze([]),
    threadId: opened.threadId,
    created: opened.created,
    preflight,
  });
}
