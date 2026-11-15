// Watchtower-Track: character-memory
// Offline-only, source-verified verbatim excerpt compaction for canonical turns.
// Never a generated semantic summary, durable Memory, or permission grant.
import type {
  CharacterContextScopeV1,
} from './character-dynamic-context-composer-v1.js';
import type {
  CharacterWorkingMemoryRecentMessageV1,
} from './character-working-memory-projection-v1.js';

export const CHARACTER_OFFLINE_EXCERPT_EPISODE_VERSION_V1 =
  'character-offline-extractive-episode-v1' as const;

export interface CharacterOfflineCanonicalTurnAuthorityV1 {
  /** Must compare the exact canonical source row under the pinned Subject/thread. */
  readonly verifyCanonicalTurn: (input: Readonly<{
    scope: CharacterContextScopeV1;
    turn: CharacterWorkingMemoryRecentMessageV1;
  }>) => boolean | Promise<boolean>;
}

export type CharacterOfflineEvidenceExcerptCompactionInputV1 = Readonly<{
  scope: CharacterContextScopeV1;
  canonicalTurns: readonly CharacterWorkingMemoryRecentMessageV1[];
  selectedMessageIds: readonly string[];
  /** Pinned source-owned unresolved/correction/commitment IDs must survive. */
  protectedMessageIds: readonly string[];
  /** Byte ceiling is caller-supplied offline policy, NOT a model token budget. */
  maximumEpisodeBytes: number;
  authority: CharacterOfflineCanonicalTurnAuthorityV1;
}>;

export type CharacterOfflineEvidenceExcerptCompactionResultV1 = Readonly<{
  schemaVersion: typeof CHARACTER_OFFLINE_EXCERPT_EPISODE_VERSION_V1;
  executionMode: 'offline_extractive_only';
  disposition: 'compacted' | 'not_beneficial';
  /** Private server-only read index. Never publish or send to telemetry. */
  privateEpisode: null | Readonly<{
    scope: CharacterContextScopeV1;
    generationProvenance: 'verbatim_canonical_turns_only';
    sourceMessageIds: readonly string[];
    retainedMessageIds: readonly string[];
    protectedMessageIds: readonly string[];
    sourceTimeRange: Readonly<{ first: string; last: string }>;
    verbatimExcerptBody: string;
  }>;
  /** Content-free diagnostics safe for aggregate reporting. */
  trace: Readonly<{
    canonicalTurnCount: number;
    retainedTurnCount: number;
    protectedTurnCount: number;
    sourceVerifiedCount: number;
    canonicalSerializedBytes: number;
    excerptSerializedBytes: number;
  }>;
}>;

export class CharacterOfflineEvidenceExcerptHeldV1 extends Error {
  override readonly name = 'CharacterOfflineEvidenceExcerptHeldV1';
  readonly code = 'OFFLINE_EPISODE_SOURCE_HELD' as const;
  constructor() {
    super('Canonical scoped turn evidence is required for offline excerpt compaction.');
  }
}
function held(): never {
  throw new CharacterOfflineEvidenceExcerptHeldV1();
}
function validId(value: unknown, maximum = 256): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= maximum && /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/.test(value);
}
function uniqueIds(ids: readonly string[], ceiling: number): Set<string> {
  if (!Array.isArray(ids) || ids.length > ceiling ||
      ids.some(id => !validId(id)) ||
      new Set(ids).size !== ids.length) held();
  return new Set(ids);
}

/**
 * Reuses only already-authorized, immutable source turns. Selects exact full
 * utterances in canonical order, never paraphrases or truncates a quote.
 * If full source-backed excerpts do not reduce bytes, returns no episode.
 *
 * Caller must rerun this after revocation/deletion, not persist the output as
 * an alternative retention store. A separate authority is needed before any
 * future inclusion in a model request.
 */
export async function compactCharacterCanonicalTurnExcerptsOfflineV1(
  input: CharacterOfflineEvidenceExcerptCompactionInputV1,
): Promise<CharacterOfflineEvidenceExcerptCompactionResultV1> {
  const { scope, canonicalTurns } = input;
  if (!validId(scope?.subjectId) || !validId(scope?.threadId) ||
      !validId(scope?.characterId, 128) ||
      !Array.isArray(canonicalTurns) ||
      canonicalTurns.length < 2 || canonicalTurns.length > 256 ||
      !Number.isSafeInteger(input.maximumEpisodeBytes) ||
      input.maximumEpisodeBytes < 1 || input.maximumEpisodeBytes > 256_000 ||
      typeof input.authority?.verifyCanonicalTurn !== 'function') held();
  const sourceMessageIds = uniqueIds(
    canonicalTurns.map(turn => turn.messageId), 256,
  );
  const selected = uniqueIds(input.selectedMessageIds, 256);
  const protectedIds = uniqueIds(input.protectedMessageIds, 256);
  if (selected.size < 1 ||
      [...selected].some(id => !sourceMessageIds.has(id)) ||
      [...protectedIds].some(id => !selected.has(id))) held();

  const pinnedScope = Object.freeze({ ...scope });
  let lastSequence = 0;
  let lastTime = -Infinity;
  for (const turn of canonicalTurns) {
    const at = Date.parse(turn.createdAt);
    if (!Number.isSafeInteger(turn.sequenceNo) ||
        turn.sequenceNo <= lastSequence ||
        !Number.isFinite(at) || at < lastTime ||
        typeof turn.text !== 'string' || turn.text.length === 0 ||
        turn.text.length > 8000 ||
        (turn.role !== 'user' && turn.role !== 'assistant') ||
        (turn.role === 'user' && turn.speakerCharacterId !== null) ||
        (turn.role === 'assistant' && turn.speakerCharacterId !== scope.characterId)) {
      held();
    }
    lastSequence = turn.sequenceNo;
    lastTime = at;
    let verified = false;
    try {
      verified = (await input.authority.verifyCanonicalTurn({
        scope: pinnedScope, turn,
      })) === true;
    } catch {
      held();
    }
    if (!verified) held();
  }

  const excerpts = canonicalTurns.filter(turn => selected.has(turn.messageId));
  const excerptBody = JSON.stringify({
    schemaVersion: CHARACTER_OFFLINE_EXCERPT_EPISODE_VERSION_V1,
    derivation: 'verbatim_no_paraphrase_or_semantic_inference',
    turns: excerpts.map(turn => ({
      messageId: turn.messageId,
      sequenceNo: turn.sequenceNo,
      role: turn.role,
      speakerCharacterId: turn.speakerCharacterId,
      createdAt: turn.createdAt,
      text: turn.text,
    })),
  });
  const encode = new TextEncoder();
  const canonicalBytes = encode.encode(JSON.stringify(canonicalTurns)).byteLength;
  const excerptBytes = encode.encode(excerptBody).byteLength;
  const trace = Object.freeze({
    canonicalTurnCount: canonicalTurns.length,
    retainedTurnCount: excerpts.length,
    protectedTurnCount: protectedIds.size,
    sourceVerifiedCount: canonicalTurns.length,
    canonicalSerializedBytes: canonicalBytes,
    excerptSerializedBytes: excerptBytes,
  });
  const beneficial = excerptBytes < canonicalBytes &&
    excerptBytes <= input.maximumEpisodeBytes;
  return Object.freeze({
    schemaVersion: CHARACTER_OFFLINE_EXCERPT_EPISODE_VERSION_V1,
    executionMode: 'offline_extractive_only' as const,
    disposition: beneficial ? 'compacted' as const : 'not_beneficial' as const,
    privateEpisode: beneficial ? Object.freeze({
      scope: pinnedScope,
      generationProvenance: 'verbatim_canonical_turns_only' as const,
      sourceMessageIds: Object.freeze(canonicalTurns.map(turn => turn.messageId)),
      retainedMessageIds: Object.freeze(excerpts.map(turn => turn.messageId)),
      protectedMessageIds: Object.freeze([...protectedIds]),
      sourceTimeRange: Object.freeze({
        first: canonicalTurns[0]!.createdAt,
        last: canonicalTurns[canonicalTurns.length - 1]!.createdAt,
      }),
      verbatimExcerptBody: excerptBody,
    }) : null,
    trace,
  });
}

/** Verify a previously produced private episode against still-authorized
 * canonical turns immediately before any offline reuse. Stored excerpts are
 * never sufficient authority, even when their original bytes match.
 */
export async function revalidateCharacterCanonicalTurnEpisodeOfflineV1(input: Readonly<{
  expectedScope: CharacterContextScopeV1;
  privateEpisode: NonNullable<CharacterOfflineEvidenceExcerptCompactionResultV1['privateEpisode']>;
  canonicalTurns: readonly CharacterWorkingMemoryRecentMessageV1[];
  authority: CharacterOfflineCanonicalTurnAuthorityV1;
}>): Promise<NonNullable<CharacterOfflineEvidenceExcerptCompactionResultV1['privateEpisode']>> {
  const { expectedScope, privateEpisode, canonicalTurns, authority } = input;
  const scoped = privateEpisode?.scope;
  if (
    privateEpisode?.generationProvenance !== 'verbatim_canonical_turns_only' ||
    scoped?.subjectId !== expectedScope?.subjectId ||
    scoped?.threadId !== expectedScope?.threadId ||
    scoped?.characterId !== expectedScope?.characterId ||
    !Array.isArray(privateEpisode.sourceMessageIds) ||
    !Array.isArray(privateEpisode.retainedMessageIds) ||
    !Array.isArray(privateEpisode.protectedMessageIds) ||
    typeof privateEpisode.verbatimExcerptBody !== 'string' ||
    privateEpisode.verbatimExcerptBody.length === 0 ||
    typeof privateEpisode.sourceTimeRange?.first !== 'string' ||
    typeof privateEpisode.sourceTimeRange?.last !== 'string'
  ) held();
  const serializedBytes = new TextEncoder().encode(
    privateEpisode.verbatimExcerptBody,
  ).byteLength;
  if (serializedBytes < 1 || serializedBytes > 256_000) held();

  // Reconstruct from current source authority, never from the supplied
  // previously compacted body. A revoked, deleted, reordered or altered turn
  // must fail rather than silently return stale/private episode contents.
  const reconstructed = await compactCharacterCanonicalTurnExcerptsOfflineV1({
    scope: expectedScope,
    canonicalTurns,
    selectedMessageIds: privateEpisode.retainedMessageIds,
    protectedMessageIds: privateEpisode.protectedMessageIds,
    maximumEpisodeBytes: serializedBytes,
    authority,
  });
  const refreshed = reconstructed.privateEpisode;
  const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
    left.length === right.length &&
    left.every((id, index) => id === right[index]);
  if (
    refreshed === null ||
    !sameIds(privateEpisode.sourceMessageIds, refreshed.sourceMessageIds) ||
    !sameIds(privateEpisode.retainedMessageIds, refreshed.retainedMessageIds) ||
    !sameIds(privateEpisode.protectedMessageIds, refreshed.protectedMessageIds) ||
    refreshed.sourceTimeRange.first !== privateEpisode.sourceTimeRange.first ||
    refreshed.sourceTimeRange.last !== privateEpisode.sourceTimeRange.last ||
    refreshed.verbatimExcerptBody !== privateEpisode.verbatimExcerptBody
  ) held();
  return refreshed;
}
