import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import {
  selectSeyeonRuntimeRetrievedMemoriesV2,
  type SeyeonRetrievedMemoryV2,
} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type {
  SeyeonPersonalRecordProjectionCandidateV1,
} from './seyeon-production-context-v1.js';

export const SEYEON_EXACT_MODEL_PERSONAL_SOURCE_SELECTION_VERSION_V1 =
  'seyeon-exact-model-personal-source-selection-v1' as const;

export class SeyeonExactModelPersonalSourceSelectionHoldV1 extends Error {
  readonly code = 'PERSONAL_SOURCE_SELECTION_UNVERIFIABLE' as const;
  constructor() {
    super('Se-yeon model personal source selection is not verifiable.');
    this.name = 'SeyeonExactModelPersonalSourceSelectionHoldV1';
  }
}

export interface SeyeonExactSelectedPersonalSourceV1 {
  readonly recordKind: 'memory' | 'life_fact';
  readonly recordId: string;
  readonly grantId: string;
  readonly recordType: string;
  readonly schemaVersion: string;
  readonly rawRecordDigest: string;
  readonly projectedMemoryDigest: string;
}

export interface SeyeonExactModelPersonalSourceSelectionV1 {
  readonly version: typeof SEYEON_EXACT_MODEL_PERSONAL_SOURCE_SELECTION_VERSION_V1;
  readonly selectedMemoryCount: number;
  readonly selectedPersonalRecordCount: number;
  readonly selectedSources: readonly SeyeonExactSelectedPersonalSourceV1[];
  readonly selectedSourcesDigest: string;
  /** A computed model input set is NOT an immutable Postgres pin. */
  readonly persistedBeforeModel: false;
  readonly permitsAtomicCommit: false;
  readonly permitsHttpReveal: false;
}

const SHA = /^sha256:v1:[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;

function hash(value: unknown): string {
  return 'sha256:v1:' + createHash('sha256')
    .update(canonicalJson(value)).digest('hex');
}

function validCandidate(c: SeyeonPersonalRecordProjectionCandidateV1): boolean {
  return (c.recordKind === 'memory' || c.recordKind === 'life_fact') &&
    UUID.test(c.recordId) && UUID.test(c.grantId) &&
    typeof c.recordType === 'string' && c.recordType.trim() === c.recordType &&
    c.recordType.length > 0 && c.recordType.length <= 256 &&
    typeof c.schemaVersion === 'string' && c.schemaVersion.trim() === c.schemaVersion &&
    c.schemaVersion.length > 0 && c.schemaVersion.length <= 256 &&
    c.projectedMemoryId === c.recordKind + ':' + c.recordId &&
    SHA.test(c.rawRecordDigest) && SHA.test(c.projectedMemoryDigest) &&
    c.permitsAtomicCommit === false && c.permitsHttpReveal === false;
}

/**
 * Derives exactly the personal records surviving the same normalizer, sort,
 * and max cap as the final runtime model Context. Must be invoked by the
 * server before any Provider call. DB-owner G1-B must persist this set
 * immutably BEFORE allowing a positively projected record into a model.
 *
 * Source candidates are server-projected evidence only. No client/model
 * input may mint a candidate, and this function grants NO privileges.
 */
export function selectSeyeonExactModelPersonalSourcesV1(input: {
  readonly retrievedMemories: readonly SeyeonRetrievedMemoryV2[];
  readonly maxRetrievedMemories?: number;
  readonly sourceCandidates: readonly SeyeonPersonalRecordProjectionCandidateV1[];
}): SeyeonExactModelPersonalSourceSelectionV1 {
  if (!Array.isArray(input.retrievedMemories) ||
      !Array.isArray(input.sourceCandidates)) {
    throw new SeyeonExactModelPersonalSourceSelectionHoldV1();
  }

  let selected: readonly SeyeonRetrievedMemoryV2[];
  try {
    selected = selectSeyeonRuntimeRetrievedMemoriesV2({
      retrievedMemories: input.retrievedMemories,
      ...(input.maxRetrievedMemories === undefined ? {} : {
        maxRetrievedMemories: input.maxRetrievedMemories,
      }),
    });
  } catch {
    throw new SeyeonExactModelPersonalSourceSelectionHoldV1();
  }

  const byId = new Map<string, SeyeonPersonalRecordProjectionCandidateV1>();
  for (const c of input.sourceCandidates) {
    if (c === null || typeof c !== 'object' || !validCandidate(c) ||
        byId.has(c.projectedMemoryId)) {
      throw new SeyeonExactModelPersonalSourceSelectionHoldV1();
    }
    byId.set(c.projectedMemoryId, c);
  }

  // Snapshot must include each candidate's actual server-projected memory.
  // Unreferenced/forged source candidates cannot be promoted to authority.
  const personalInput = new Map<string, SeyeonRetrievedMemoryV2>();
  for (const m of input.retrievedMemories) {
    if (m.kind === 'memory' || m.kind === 'life_fact') {
      if (personalInput.has(m.memoryId)) {
        throw new SeyeonExactModelPersonalSourceSelectionHoldV1();
      }
      personalInput.set(m.memoryId, m);
    }
  }
  if (byId.size !== personalInput.size) {
    throw new SeyeonExactModelPersonalSourceSelectionHoldV1();
  }
  for (const [id, c] of byId) {
    const m = personalInput.get(id);
    if (m === undefined || m.kind !== c.recordKind ||
        m.sourceRef !== c.recordKind + ':' + c.recordId + ':grant:' + c.grantId ||
        hash(m) !== c.projectedMemoryDigest) {
      throw new SeyeonExactModelPersonalSourceSelectionHoldV1();
    }
  }

  const selectedSources: SeyeonExactSelectedPersonalSourceV1[] = [];
  for (const m of selected) {
    if (m.kind === 'relationship_event') continue;
    const c = byId.get(m.memoryId);
    if (!c || hash(m) !== c.projectedMemoryDigest) {
      throw new SeyeonExactModelPersonalSourceSelectionHoldV1();
    }
    selectedSources.push(Object.freeze({
      recordKind: c.recordKind,
      recordId: c.recordId,
      grantId: c.grantId,
      recordType: c.recordType,
      schemaVersion: c.schemaVersion,
      rawRecordDigest: c.rawRecordDigest,
      projectedMemoryDigest: c.projectedMemoryDigest,
    }));
  }

  return Object.freeze({
    version: SEYEON_EXACT_MODEL_PERSONAL_SOURCE_SELECTION_VERSION_V1,
    selectedMemoryCount: selected.length,
    selectedPersonalRecordCount: selectedSources.length,
    selectedSources: Object.freeze(selectedSources),
    selectedSourcesDigest: hash(selectedSources),
    persistedBeforeModel: false as const,
    permitsAtomicCommit: false as const,
    permitsHttpReveal: false as const,
  });
}
