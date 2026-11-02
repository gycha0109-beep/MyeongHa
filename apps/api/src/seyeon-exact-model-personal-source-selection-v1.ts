import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import {
  selectSeyeonRuntimeRetrievedMemoriesV2,
  selectSeyeonRuntimeRecentMessagesV2,
  type SeyeonRetrievedMemoryV2,
  type SeyeonRecentMessageV2,
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
  readonly rawRecordPgDigest?: string;
  readonly projectorVersion?: string;
}

/**
 * Source-census evidence for a relationship-derived model memory.
 * An event's sourceRef is NOT an original Memory/Grant authorization.
 */
export interface SeyeonSelectedUnpinnedDerivedSourceV1 {
  readonly kind: 'relationship_event';
  readonly memoryId: string;
  readonly sourceRef: string;
  readonly selectedModelMemoryDigest: string;
  readonly originalGrantVerified: false;
}

export interface SeyeonSelectedModelRecentMessageSourceV1 {
  readonly messageId: string;
  readonly role: 'user' | 'assistant';
  readonly selectedModelMessageDigest: string;
  /** A source census is NOT the DB-owner G1 immutable attempt Pin. */
  readonly persistedBeforeModel: false;
}

export interface SeyeonExactModelPersonalSourceSelectionV1 {
  readonly version: typeof SEYEON_EXACT_MODEL_PERSONAL_SOURCE_SELECTION_VERSION_V1;
  readonly selectedMemoryCount: number;
  readonly selectedPersonalRecordCount: number;
  readonly selectedSources: readonly SeyeonExactSelectedPersonalSourceV1[];
  readonly selectedSourcesDigest: string;
  /** Exact DB-original current User input selected into the model, if supplied. */
  readonly selectedCurrentUserSource: SeyeonSelectedModelRecentMessageSourceV1 | null;
  /** Final-model historical User/Assistant text still requiring a durable G1 Pin. */
  readonly selectedUnpinnedRecentSources: readonly SeyeonSelectedModelRecentMessageSourceV1[];
  /** Selection-time manifest of actual model-selected derived sources. */
  readonly selectedUnpinnedDerivedSources: readonly SeyeonSelectedUnpinnedDerivedSourceV1[];
  /** Whole selected-model source census, not a DB Pin or an active Grant. */
  readonly selectedModelSourceCensusDigest: string;
  /** A computed model input set is NOT an immutable Postgres pin. */
  readonly persistedBeforeModel: false;
  readonly permitsAtomicCommit: false;
  readonly permitsHttpReveal: false;
}

const SHA = /^sha256:v1:[a-f0-9]{64}$/u;
const PG_SHA = /^sha256:pg-jsonb:v1:[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;

function hash(value: unknown): string {
  return 'sha256:v1:' + createHash('sha256')
    .update(canonicalJson(value)).digest('hex');
}

function validCandidate(c: SeyeonPersonalRecordProjectionCandidateV1): boolean {
  // Unknown lineage fields must never disappear when selected sources are
  // canonicalized for G1. Reject rather than silently strip future claims.
  const requiredKeys = [
    'recordKind', 'recordId', 'grantId', 'recordType', 'schemaVersion',
    'projectedMemoryId', 'rawRecordDigest', 'projectedMemoryDigest',
    'permitsAtomicCommit', 'permitsHttpReveal',
  ];
  const permittedKeys = [
    ...requiredKeys, 'rawRecordPgDigest', 'projectorVersion',
  ];
  const candidateKeys = Object.keys(c);
  if (requiredKeys.some(key => !Object.prototype.hasOwnProperty.call(c, key)) ||
      candidateKeys.some(key => !permittedKeys.includes(key))) return false;
  return (c.recordKind === 'memory' || c.recordKind === 'life_fact') &&
    UUID.test(c.recordId) && UUID.test(c.grantId) &&
    typeof c.recordType === 'string' && c.recordType.trim() === c.recordType &&
    c.recordType.length > 0 && c.recordType.length <= 256 &&
    typeof c.schemaVersion === 'string' && c.schemaVersion.trim() === c.schemaVersion &&
    c.schemaVersion.length > 0 && c.schemaVersion.length <= 256 &&
    c.projectedMemoryId === c.recordKind + ':' + c.recordId &&
    SHA.test(c.rawRecordDigest) && SHA.test(c.projectedMemoryDigest) &&
    (c.rawRecordPgDigest === undefined || PG_SHA.test(c.rawRecordPgDigest)) &&
    (c.projectorVersion === undefined ||
      (c.projectorVersion.length > 0 && c.projectorVersion.length <= 100 &&
       c.projectorVersion === c.projectorVersion.trim())) &&
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
  /** Server-owned first-Memory constraint; never a client/model capability. */
  /** Exact server policy: 0 for first zero-source, 1 for Positive S0. */
  readonly requiredPersonalRecordCount?: 0 | 1;
  readonly sourceCandidates: readonly SeyeonPersonalRecordProjectionCandidateV1[];
  readonly recentMessages?: readonly SeyeonRecentMessageV2[];
  readonly maxRecentMessages?: number;
  /** Actual DB-received User message ID; only the execution runner supplies it. */
  readonly currentUserMessageId?: string;
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

  let selectedRecent: readonly SeyeonRecentMessageV2[];
  try {
    if ((input.recentMessages !== undefined && !Array.isArray(input.recentMessages)) ||
        (input.currentUserMessageId !== undefined &&
          (!UUID.test(input.currentUserMessageId) || !Array.isArray(input.recentMessages)))) {
      throw new SeyeonExactModelPersonalSourceSelectionHoldV1();
    }
    selectedRecent = selectSeyeonRuntimeRecentMessagesV2({
      recentMessages: input.recentMessages ?? [],
      ...(input.maxRecentMessages === undefined ? {} : {
        maxRecentMessages: input.maxRecentMessages,
      }),
    });
  } catch {
    throw new SeyeonExactModelPersonalSourceSelectionHoldV1();
  }
  const selectedUnpinnedRecentSources: SeyeonSelectedModelRecentMessageSourceV1[] = [];
  let selectedCurrentUserSource: SeyeonSelectedModelRecentMessageSourceV1 | null = null;
  const seenRecent = new Set<string>();
  for (const m of selectedRecent) {
    if (!UUID.test(m.messageId) || seenRecent.has(m.messageId)) {
      throw new SeyeonExactModelPersonalSourceSelectionHoldV1();
    }
    seenRecent.add(m.messageId);
    const source = Object.freeze({
      messageId: m.messageId,
      role: m.role,
      selectedModelMessageDigest: hash(m),
      persistedBeforeModel: false as const,
    });
    if (m.messageId === input.currentUserMessageId) {
      if (m.role !== 'user' || selectedCurrentUserSource !== null) {
        throw new SeyeonExactModelPersonalSourceSelectionHoldV1();
      }
      selectedCurrentUserSource = source;
    } else {
      selectedUnpinnedRecentSources.push(source);
    }
  }
  if (input.currentUserMessageId !== undefined && selectedCurrentUserSource === null) {
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
  const selectedUnpinnedDerivedSources: SeyeonSelectedUnpinnedDerivedSourceV1[] = [];
  for (const m of selected) {
    if (m.kind === 'relationship_event') {
      // A sourceRef to an Event has no exact original Grant/Record lineage.
      // Record its actual selected projection; do not fabricate permission.
      if (typeof m.memoryId !== 'string' ||
          typeof m.sourceRef !== 'string' ||
          m.memoryId.length === 0 || m.sourceRef.length === 0) {
        throw new SeyeonExactModelPersonalSourceSelectionHoldV1();
      }
      selectedUnpinnedDerivedSources.push(Object.freeze({
        kind: 'relationship_event' as const,
        memoryId: m.memoryId,
        sourceRef: m.sourceRef,
        selectedModelMemoryDigest: hash(m),
        originalGrantVerified: false as const,
      }));
      continue;
    }
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
      ...(c.rawRecordPgDigest === undefined ? {} : {rawRecordPgDigest: c.rawRecordPgDigest}),
      ...(c.projectorVersion === undefined ? {} : {projectorVersion: c.projectorVersion}),
    }));
  }

  if(input.requiredPersonalRecordCount!==undefined&&
     (selectedSources.length!==input.requiredPersonalRecordCount)){
    throw new SeyeonExactModelPersonalSourceSelectionHoldV1();
  }

  return Object.freeze({
    version: SEYEON_EXACT_MODEL_PERSONAL_SOURCE_SELECTION_VERSION_V1,
    selectedMemoryCount: selected.length,
    selectedPersonalRecordCount: selectedSources.length,
    selectedSources: Object.freeze(selectedSources),
    selectedSourcesDigest: hash(selectedSources),
    selectedCurrentUserSource,
    selectedUnpinnedRecentSources: Object.freeze(selectedUnpinnedRecentSources),
    selectedUnpinnedDerivedSources: Object.freeze(selectedUnpinnedDerivedSources),
    selectedModelSourceCensusDigest: hash({
      originalPersonalSources: selectedSources,
      currentUserSource: selectedCurrentUserSource,
      unpinnedRecentSources: selectedUnpinnedRecentSources,
      unpinnedDerivedSources: selectedUnpinnedDerivedSources,
    }),
    persistedBeforeModel: false as const,
    permitsAtomicCommit: false as const,
    permitsHttpReveal: false as const,
  });
}
