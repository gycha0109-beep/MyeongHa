import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import {
  admitSeyeonOfflineS0ContextCandidateV1,
  type SeyeonOfflineS0ContextCandidateV1,
} from './seyeon-offline-s0-context-admission-v1.js';

/**
 * Offline contract experiment linking a real disposable-DB SourceSet/Edge
 * observation to the *same* selected Memory consumed by a native R2 request.
 *
 * Evidence is caller-supplied and not cryptographically authenticated. Even a
 * positive result is NOT a Provider gate, access Grant or Production DB
 * contract. Only DB Owner can enforce current-Grant+content checks atomically.
 */
export interface SeyeonOfflineR2DbSourceObservationV1 {
  readonly attemptId: string;
  readonly subjectId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly sourceCount: number;
  readonly selectedSourcesDigest: string;
  readonly edgeOrdinal: number;
  readonly recordKind: 'memory';
  readonly recordId: string;
  readonly originalGrantId: string;
  readonly recordType: string;
  readonly schemaVersion: string;
  readonly originalGrantedAt: string;
  readonly pinnedPayloadDigest: string;
  readonly currentPayloadDigest: string;
  readonly exactOriginalGrantActive: boolean;
}

const PG_SHA = /^sha256:pg-jsonb:v1:[a-f0-9]{64}$/u;
const APP_SHA = /^sha256:v1:[a-f0-9]{64}$/u;
const HELD = Object.freeze({
  state: 'held' as const, permitsProductionProvider: false as const,
  permitsProductionReveal: false as const,
});

export function observeSeyeonOfflineR2DbSourceBindingV1(input: Readonly<{
  candidate: SeyeonOfflineS0ContextCandidateV1;
  observation: SeyeonOfflineR2DbSourceObservationV1;
}>):
  | Readonly<{
      state: 'db_source_shape_observed_offline_only';
      observationDigest: string;
      permitsProductionProvider: false;
      permitsProductionReveal: false;
    }>
  | typeof HELD {
  try {
    const { candidate, observation: o } = input;
    if (admitSeyeonOfflineS0ContextCandidateV1(candidate).state !==
        'eligible_offline_synthetic_only' || !o ||
        o.subjectId !== candidate.identity.subjectId ||
        o.threadId !== candidate.identity.threadId ||
        o.turnId !== candidate.identity.turnId ||
        o.attemptId !== candidate.identity.attemptId ||
        o.sourceCount !== 1 || o.edgeOrdinal !== 0 ||
        o.recordKind !== 'memory' ||
        o.selectedSourcesDigest !== candidate.selection.selectedSourcesDigest ||
        !APP_SHA.test(o.selectedSourcesDigest) ||
        !PG_SHA.test(o.pinnedPayloadDigest) ||
        o.currentPayloadDigest !== o.pinnedPayloadDigest ||
        o.exactOriginalGrantActive !== true ||
        typeof o.originalGrantedAt !== 'string' ||
        !Number.isFinite(Date.parse(o.originalGrantedAt))) return HELD;

    const selected = candidate.selection.selectedSources[0];
    const memory = candidate.finalContext.retrievedMemories[0];
    if (!selected || !memory ||
        selected.recordKind !== o.recordKind ||
        selected.recordId !== o.recordId ||
        selected.grantId !== o.originalGrantId ||
        selected.recordType !== o.recordType ||
        selected.schemaVersion !== o.schemaVersion ||
        memory.sourceRef !== 'memory:' + o.recordId + ':grant:' + o.originalGrantId ||
        memory.memoryId !== 'memory:' + o.recordId) return HELD;

    return Object.freeze({
      state: 'db_source_shape_observed_offline_only' as const,
      observationDigest: 'sha256:v1:' + createHash('sha256')
        .update(canonicalJson({
          version: 'seyeon-offline-r2-db-source-binding-v1',
          identity: candidate.identity,
          selectedSourcesDigest: candidate.selection.selectedSourcesDigest,
          dbPayloadCodec: 'sha256:pg-jsonb:v1',
          observation: o,
        })).digest('hex'),
      permitsProductionProvider: false as const,
      permitsProductionReveal: false as const,
    });
  } catch {
    return HELD;
  }
}
