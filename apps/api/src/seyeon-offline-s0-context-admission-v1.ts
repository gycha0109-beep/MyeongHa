import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import type { SeyeonRetrievedMemoryV2 } from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type {
  SeyeonProductionContextSnapshotV1,
} from './seyeon-production-context-v1.js';
import {
  selectSeyeonExactModelPersonalSourcesV1,
  type SeyeonExactModelPersonalSourceSelectionV1,
} from './seyeon-exact-model-personal-source-selection-v1.js';
import {
  runSeyeonOfflineGrantedTurnV1,
  type SeyeonOfflineGrantedTurnResultV1,
} from './seyeon-offline-granted-turn-v1.js';

/**
 * G0 S0 *design candidate* only. Deliberately NOT an authorization token.
 *
 * This proof is built from a synthetic test fixture. Only a future DB Owner
 * implementation can attest to complete source closure, exact original Grant,
 * actually transmitted provider bytes, and authorized schema versions.
 * Never inject this module as a production chat admission gate or use it to
 * bypass the existing zero-only production personal-record interlock.
 */
export const SEYEON_OFFLINE_S0_CONTEXT_ADMISSION_VERSION_V1 =
  'seyeon-offline-s0-context-admission-v1' as const;

type ScopedTurnInputV1 = Parameters<typeof runSeyeonOfflineGrantedTurnV1>[0];

type SnapshotV1 = Pick<SeyeonProductionContextSnapshotV1,
  | 'version'
  | 'recentMessages'
  | 'retrievedMemories'
  | 'personalRecordAdmissions'
  | 'personalRecordProjectionCandidates'
  | 'activeRelationshipEventCount'
  | 'relationshipHistoryRecords'
  | 'historyThroughRevision'
  | 'relationshipRevisionUsedForTurn'>;

export interface SeyeonOfflineS0ContextCandidateV1 {
  /** Must be the canonical server-derived attempt (not an HTTP input). */
  readonly identity: ScopedTurnInputV1['identity'];
  readonly currentUserMessage: Readonly<{
    messageId: string;
    text: string;
  }>;
  /** Original snapshot returned by the production-shaped composer. */
  readonly productionContext: SnapshotV1;
  /** Context after binding the current user turn, before any provider call. */
  readonly finalContext: Readonly<{
    relationship: null;
    recentMessages: readonly Readonly<{
      messageId: string;
      role: 'user' | 'assistant';
      text: string;
    }>[];
    retrievedMemories: readonly SeyeonRetrievedMemoryV2[];
    maxRetrievedMemories?: number;
  }>;
  readonly selection: SeyeonExactModelPersonalSourceSelectionV1;
  /**
   * Fixture-only "allowlist". SRC-25 is OPEN in production; specifying this
   * value does NOT approve a Memory schema or authorize live disclosure.
   */
  readonly syntheticApprovedSchema: Readonly<{
    recordType: string;
    schemaVersion: string;
  }>;
  /**
   * These five ingress channels must be represented explicitly; undefined
   * is UNKNOWN, not ZERO. An empty array here is only synthetic coverage.
   * Real governed preflight may add new information after this check.
   */
  readonly simulatedOtherIngress: Readonly<{
    preflight: readonly unknown[];
    reader: readonly unknown[];
    disclosure: readonly unknown[];
    peer: readonly unknown[];
    external: readonly unknown[];
  }>;
}

export type SeyeonOfflineS0AdmissionResultV1 =
  | Readonly<{
      state: 'eligible_offline_synthetic_only';
      candidateDigest: string;
      permitsProductionProvider: false;
      permitsProductionReveal: false;
    }>
  | Readonly<{ state: 'held'; permitsProductionProvider: false }>;

const HELD = Object.freeze({
  state: 'held' as const, permitsProductionProvider: false as const,
});
const SHA = /^sha256:v1:[0-9a-f]{64}$/u;

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= 8000 && value.trim() === value;
}

function sameJson(a: unknown, b: unknown): boolean {
  try {
    return canonicalJson(a) === canonicalJson(b);
  } catch {
    return false;
  }
}

function allIngressExplicitlyEmpty(
  ingress: SeyeonOfflineS0ContextCandidateV1['simulatedOtherIngress'],
): boolean {
  return ingress !== null && typeof ingress === 'object' &&
    (['preflight', 'reader', 'disclosure', 'peer', 'external'] as const)
      .every((key) =>
        Array.isArray(ingress[key]) && ingress[key].length === 0);
}

/**
 * This rejects any opaque historical Assistant, Relationship, Reader,
 * preflight or other source; it never silently drops such material to
 * pretend that an existing chat had an explicit zero-source history.
 *
 * Even a positive result is non-authoritative. The original DB Grant must
 * still be durably pinned BEFORE model dispatch and rechecked by DB owners.
 */
export function admitSeyeonOfflineS0ContextCandidateV1(
  input: SeyeonOfflineS0ContextCandidateV1,
): SeyeonOfflineS0AdmissionResultV1 {
  try {
    if (!input || !input.identity ||
        input.identity.characterId !== 'seyeon' ||
        !text(input.identity.subjectId) || !text(input.identity.threadId) ||
        !text(input.identity.turnId) || !text(input.identity.attemptId) ||
        !text(input.currentUserMessage?.messageId) ||
        !text(input.currentUserMessage?.text) ||
        !allIngressExplicitlyEmpty(input.simulatedOtherIngress)) {
      return HELD;
    }

    const snapshot = input.productionContext;
    const final = input.finalContext;
    if (!snapshot || snapshot.version !== 'seyeon-production-context-v1' ||
        !final || final.relationship !== null ||
        !Array.isArray(snapshot.recentMessages) ||
        snapshot.recentMessages.length !== 0 ||
        !Array.isArray(snapshot.relationshipHistoryRecords) ||
        snapshot.relationshipHistoryRecords.length !== 0 ||
        snapshot.activeRelationshipEventCount !== 0 ||
        snapshot.historyThroughRevision !== 0 ||
        // null and 0 both mean no prior relationship revision at S0.
        (snapshot.relationshipRevisionUsedForTurn !== null &&
         snapshot.relationshipRevisionUsedForTurn !== 0) ||
        !Array.isArray(final.recentMessages) ||
        final.recentMessages.length !== 1 ||
        !sameJson(final.recentMessages[0], {
          messageId: input.currentUserMessage.messageId,
          role: 'user',
          text: input.currentUserMessage.text,
        }) ||
        !Array.isArray(final.retrievedMemories) ||
        !Array.isArray(snapshot.retrievedMemories) ||
        !sameJson(final.retrievedMemories, snapshot.retrievedMemories) ||
        snapshot.retrievedMemories.length !== 1 ||
        !Array.isArray(snapshot.personalRecordAdmissions) ||
        snapshot.personalRecordAdmissions.length !== 1 ||
        !Array.isArray(snapshot.personalRecordProjectionCandidates) ||
        snapshot.personalRecordProjectionCandidates.length !== 1) {
      return HELD;
    }

    const memory = snapshot.retrievedMemories[0];
    const admission = snapshot.personalRecordAdmissions[0];
    const candidate = snapshot.personalRecordProjectionCandidates[0];
    const expectedSelection = selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories: final.retrievedMemories,
      sourceCandidates: snapshot.personalRecordProjectionCandidates,
      ...(final.maxRetrievedMemories === undefined
        ? {} : { maxRetrievedMemories: final.maxRetrievedMemories }),
    });
    const selected = expectedSelection.selectedSources[0];

    if (!memory || memory.kind !== 'memory' ||
        !admission || admission.reason !== 'ADMITTED' ||
        admission.recordKind !== 'memory' ||
        !candidate || candidate.recordKind !== 'memory' ||
        !selected || selected.recordKind !== 'memory' ||
        !text(input.syntheticApprovedSchema?.recordType) ||
        !text(input.syntheticApprovedSchema?.schemaVersion) ||
        selected.recordType !== input.syntheticApprovedSchema.recordType ||
        selected.schemaVersion !== input.syntheticApprovedSchema.schemaVersion ||
        admission.recordId !== selected.recordId ||
        admission.recordType !== selected.recordType ||
        admission.schemaVersion !== selected.schemaVersion ||
        candidate.recordId !== selected.recordId ||
        candidate.grantId !== selected.grantId ||
        expectedSelection.selectedMemoryCount !== 1 ||
        expectedSelection.selectedPersonalRecordCount !== 1 ||
        !input.selection ||
        input.selection.persistedBeforeModel !== false ||
        input.selection.permitsAtomicCommit !== false ||
        input.selection.permitsHttpReveal !== false ||
        !SHA.test(input.selection.selectedSourcesDigest) ||
        !sameJson(input.selection, expectedSelection)) {
      return HELD;
    }

    // Deliberately a non-keyed test checksum, never a DB permission, pin,
    // signature or current Grant assertion.
    const candidateDigest = 'sha256:v1:' +
      createHash('sha256').update(canonicalJson({
        version: SEYEON_OFFLINE_S0_CONTEXT_ADMISSION_VERSION_V1,
        subjectId: input.identity.subjectId,
        threadId: input.identity.threadId,
        turnId: input.identity.turnId,
        attemptId: input.identity.attemptId,
        currentUserMessageId: input.currentUserMessage.messageId,
        selectedSourcesDigest: expectedSelection.selectedSourcesDigest,
      })).digest('hex');
    return Object.freeze({
      state: 'eligible_offline_synthetic_only' as const,
      candidateDigest,
      permitsProductionProvider: false as const,
      permitsProductionReveal: false as const,
    });
  } catch {
    return HELD;
  }
}

/**
 * A runnable S0 *synthetic* pre-model exercise. Note that the existing offline
 * authority still owns the durable Pin, exact original Grant Commit and
 * current-rights Reveal. The S0 candidate never grants any of those rights.
 */
export async function runSeyeonOfflineS0ScopedTurnV1(
  input: Readonly<ScopedTurnInputV1 & {
    candidate: SeyeonOfflineS0ContextCandidateV1;
  }>,
): Promise<SeyeonOfflineGrantedTurnResultV1> {
  const candidate = input.candidate;
  if (!candidate ||
      !sameJson(candidate.identity, input.identity) ||
      !sameJson(candidate.selection, input.selection) ||
      admitSeyeonOfflineS0ContextCandidateV1(candidate).state !==
        'eligible_offline_synthetic_only') {
    return Object.freeze({ state: 'held' as const });
  }
  return runSeyeonOfflineGrantedTurnV1({
    identity: input.identity,
    selection: input.selection,
    authority: input.authority,
    generateSyntheticText: input.generateSyntheticText,
  });
}
