import type { MobileChatThreadSnapshotV1 } from './mobile-chat-read-repository.js';

/** The server deliberately denies Se-yeon history Reveal until current-rights proof is available. */
export function isSeyeonHistoryRevealHoldV1(
  snapshot: Pick<MobileChatThreadSnapshotV1, 'status' | 'errorCode'>,
): boolean {
  return snapshot.status === 'error'
    && snapshot.errorCode === 'SEYEON_HISTORY_REVEAL_HOLD';
}
