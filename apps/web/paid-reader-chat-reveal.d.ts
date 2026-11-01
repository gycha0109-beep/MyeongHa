/** Private S6/S7 browser-only card; public Reader release remains OFF. */
export function clearProtectedReaderChatRevealV1(): void;

/**
 * Mount a protected reveal control on the existing safe ordinary-Chat marker.
 * Neither paid answer plaintext nor an acknowledgement token enters Chat state.
 */
export function appendProtectedReaderChatRevealV1(
  card: HTMLElement,
  input: Readonly<{ threadId: string; safeMessageId: string }>,
): void;
