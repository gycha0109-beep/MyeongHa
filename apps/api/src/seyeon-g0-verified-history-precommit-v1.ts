import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import {
  selectSeyeonRuntimeRecentMessagesV2,
  type SeyeonRecentMessageV2,
} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  SEYEON_PRODUCTION_CONTEXT_VERSION_V1,
  type SeyeonProductionContextSnapshotV1,
} from './seyeon-production-context-v1.js';
import {
  SEYEON_EXACT_MODEL_PERSONAL_SOURCE_SELECTION_VERSION_V1,
  type SeyeonExactModelPersonalSourceSelectionV1,
} from './seyeon-exact-model-personal-source-selection-v1.js';
import { SeyeonPersonalRecordPrecommitHoldV1 } from './seyeon-personal-record-precommit-hold-v1.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const hash = (value: unknown): string => 'sha256:v1:' +
  createHash('sha256').update(canonicalJson(value)).digest('hex');
const hold = (): never => { throw new SeyeonPersonalRecordPrecommitHoldV1(); };

export const SEYEON_G0_VERIFIED_HISTORY_PRECOMMIT_V1 = Object.freeze({
  version: 'seyeon-g0-verified-history-precommit-v1' as const,
  permitsProviderBeforeOwnerDbPin: false as const,
  permitsPositivePersonalRecords: false as const,
  permitsHttpReveal: false as const,
});

/**
 * Non-authorizing, pre-DB candidate validation for a ZERO-personal-record
 * follow-up. Old User/Assistant message bytes are not authority merely because
 * an owner-scoped context reader returned them.
 *
 * The caller MUST execute cmd_mark_seyeon_chat_context_ready_pinned_v1
 * successfully before even invoking governed Preflight/any model. That
 * SECURITY DEFINER command independently re-reads original Subject/Thread/
 * User/Assistant, validates committed + current-source lineage, matches exact
 * tail/text digests, and atomically pins the immutable 12-field model census
 * against this Attempt. A failed pin always aborts the model.
 *
 * No positive Memory/Grant, derived relationship event, unknown row, or
 * revision can use this route. Existing strict zero-history HOLD is unchanged.
 */
export function assertSeyeonG0HistoricalMessagesRequireOwnerDbPinV1(input: Readonly<{
  productionContext: SeyeonProductionContextSnapshotV1;
  selectedModelSources: SeyeonExactModelPersonalSourceSelectionV1;
  modelRecentMessages: readonly SeyeonRecentMessageV2[];
  maxRecentMessages?: number;
  currentUserMessageId: string;
}>): typeof SEYEON_G0_VERIFIED_HISTORY_PRECOMMIT_V1 {
  const c = input.productionContext;
  const s = input.selectedModelSources;
  if (c === null || typeof c !== 'object' ||
      c.version !== SEYEON_PRODUCTION_CONTEXT_VERSION_V1 ||
      !Array.isArray(c.recentMessages) || c.recentMessages.length === 0 ||
      !Array.isArray(c.retrievedMemories) || c.retrievedMemories.length !== 0 ||
      !Array.isArray(c.relationshipHistoryRecords) ||
      c.relationshipHistoryRecords.length !== 0 ||
      c.activeRelationshipEventCount !== 0 ||
      c.historyThroughRevision !== 0 ||
      (c.relationshipRevisionUsedForTurn ?? 0) !== 0 ||
      !Array.isArray(c.personalRecordAdmissions) ||
      c.personalRecordAdmissions.some(a =>
        a === null || typeof a !== 'object' || a.reason !== 'UNSUPPORTED_SCHEMA') ||
      !Array.isArray(c.personalRecordProjectionCandidates) ||
      c.personalRecordProjectionCandidates.length !== 0 ||
      !UUID.test(input.currentUserMessageId) ||
      !s || s.version !== SEYEON_EXACT_MODEL_PERSONAL_SOURCE_SELECTION_VERSION_V1 ||
      s.selectedPersonalRecordCount !== 0 || s.selectedMemoryCount !== 0 ||
      !Array.isArray(s.selectedSources) || s.selectedSources.length !== 0 ||
      s.selectedSourcesDigest !== hash([]) ||
      !Array.isArray(s.selectedUnpinnedDerivedSources) ||
      s.selectedUnpinnedDerivedSources.length !== 0 ||
      !Array.isArray(s.selectedUnpinnedRecentSources) ||
      s.selectedUnpinnedRecentSources.length === 0 ||
      s.persistedBeforeModel !== false ||
      s.permitsAtomicCommit !== false || s.permitsHttpReveal !== false) return hold();

  let selectedRecent: readonly SeyeonRecentMessageV2[];
  try {
    selectedRecent = selectSeyeonRuntimeRecentMessagesV2({
      recentMessages: input.modelRecentMessages,
      ...(input.maxRecentMessages === undefined ? {} : {
        maxRecentMessages: input.maxRecentMessages,
      }),
    });
  } catch { return hold(); }

  const current = selectedRecent.at(-1);
  const currentProof = s.selectedCurrentUserSource;
  const historical = selectedRecent.slice(0, -1);
  if (!current || current.messageId !== input.currentUserMessageId ||
      current.role !== 'user' || !currentProof ||
      currentProof.messageId !== current.messageId ||
      currentProof.role !== 'user' ||
      currentProof.persistedBeforeModel !== false ||
      currentProof.selectedModelMessageDigest !== hash(current) ||
      historical.length !== s.selectedUnpinnedRecentSources.length ||
      historical.length > c.recentMessages.length ||
      historical.length < 1) return hold();

  const contextTail = c.recentMessages.slice(-historical.length);
  const ids = new Set<string>([current.messageId]);
  for (let i = 0; i < historical.length; i++) {
    const m = historical[i];
    const original = contextTail[i];
    const proof = s.selectedUnpinnedRecentSources[i];
    if (!m || !original || !proof ||
        m.messageId !== original.messageId ||
        m.role !== original.role || m.text !== original.text ||
        !UUID.test(m.messageId) || ids.has(m.messageId) ||
        proof.messageId !== m.messageId || proof.role !== m.role ||
        proof.persistedBeforeModel !== false ||
        proof.selectedModelMessageDigest !== hash(m)) return hold();
    ids.add(m.messageId);
  }

  if (s.selectedModelSourceCensusDigest !== hash({
    originalPersonalSources: [],
    currentUserSource: currentProof,
    unpinnedRecentSources: s.selectedUnpinnedRecentSources,
    unpinnedDerivedSources: [],
  })) return hold();

  // This is a mandate to invoke the ORIGINAL DB pin, not a source Grant.
  return SEYEON_G0_VERIFIED_HISTORY_PRECOMMIT_V1;
}
