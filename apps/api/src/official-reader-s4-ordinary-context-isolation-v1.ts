/**
 * S4 ordinary AI context boundary for S5's safe paid-answer Chat marker.
 *
 * Chat UI retains this exact SYSTEM message as the paid-answer record. The
 * paid answer itself never enters ordinary Chat; it is private ciphertext
 * read only through S6. A marker is not a personal statement, Memory source,
 * prompt, retrieval hit, summary candidate, notification or Search document.
 *
 * The guard is intentionally based on the exact server-authored safe marker,
 * not lexical guesses about a user's ordinary messages mentioning Saju.
 * Users' independent prose must remain available under ordinary Chat policy.
 *
 * This is a second, application-level fence for pre-migration environments.
 * SQL 2180 filters BEFORE the LLM context limit; SQL 2190 rejects derived
 * Memory/Life Fact/Outbox source writes. No external model call is made here.
 */

export const OFFICIAL_READER_S5_SAFE_CHAT_MARKER_TEXT_V1 =
  '유료 해설 기록이 있습니다.' as const;

export const OFFICIAL_READER_S5_SAFE_CHAT_MARKER_CONTENT_HASH_V1 =
  'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63' as const;

export interface OrdinaryReaderContextMessageCandidateV1 {
  readonly senderType: unknown;
  readonly text: unknown;
}

/** Ordinary AI input must ignore S5's system marker, not ordinary user text. */
export function isOfficialReaderS5SafeMarkerForOrdinaryContextV1(
  input: OrdinaryReaderContextMessageCandidateV1,
): boolean {
  return input.senderType === 'system'
    && input.text === OFFICIAL_READER_S5_SAFE_CHAT_MARKER_TEXT_V1;
}

/**
 * A non-mutating defense-in-depth projection before prompting the Reader
 * or Se-yeon and before generating any downstream summary/Memory proposal.
 * The official Chat stream does NOT call this filter because the customer
 * is entitled to see the safe record marker independently of paid content.
 */
export function excludeOfficialReaderS5SafeMarkersFromOrdinaryContextV1<
  T extends OrdinaryReaderContextMessageCandidateV1,
>(messages: readonly T[]): readonly T[] {
  return Object.freeze(
    messages.filter(
      item => !isOfficialReaderS5SafeMarkerForOrdinaryContextV1(item),
    ),
  );
}
