import type { MobileUiLocale } from '../../ui/mobile-ui-copy.js';
import type { MobileChatThreadSnapshotV1 } from './mobile-chat-read-repository.js';

/**
 * A transient continuation read can preserve server-verified messages while
 * being incomplete. Never treat it as successful end-of-history.
 */
export function isMobileChatContinuationReadFailureV1(
  snapshot: Pick<MobileChatThreadSnapshotV1, 'status' | 'hasMore'> &
    Readonly<{ messages: readonly unknown[] }>,
): boolean {
  return snapshot.status === 'error' && snapshot.hasMore && snapshot.messages.length > 0;
}

const CONTINUATION_ERROR_COPY_V1: Readonly<Record<MobileUiLocale, string>> = Object.freeze({
  'ko-KR': '추가 대화 기록을 불러오지 못했습니다. 이미 표시한 메시지는 유지됩니다.',
  'ja-JP': '追加の会話履歴を読み込めませんでした。すでに表示したメッセージは保持されます。',
  'zh-TW': '無法載入更多對話紀錄。已顯示的訊息會保留。',
  'en-US': 'Could not load more chat history. Messages already displayed are preserved.',
  'zh-CN': '无法加载更多对话记录。已显示的消息会保留。',
});

export function mobileChatContinuationErrorCopyV1(locale: MobileUiLocale): string {
  return CONTINUATION_ERROR_COPY_V1[locale];
}
