import type { ChatMessageV1 } from '@myeongha/api-client';
import type { MobileUiLocale } from '../../ui/mobile-ui-copy.js';

export interface MobileChatMessageViewV1 {
  readonly id: string;
  readonly sequenceNo: number;
  readonly role: 'user' | 'character' | 'system';
  readonly label: string;
  readonly body: string;
  readonly redacted: boolean;
  readonly timeLabel: string;
}

/** Fixed client-owned placeholders only; never translate actual message bodies. */
const CHAT_UI_LABELS_V1: Readonly<Record<MobileUiLocale, Readonly<{
  me: string;
  participant: string;
  system: string;
  redacted: string;
  noText: string;
}>>> = Object.freeze({
  'ko-KR': Object.freeze({ me: '나', participant: '대화 상대', system: '안내', redacted: '가려진 메시지', noText: '표시할 수 있는 텍스트가 없는 메시지' }),
  'ja-JP': Object.freeze({ me: '自分', participant: '話し相手', system: '案内', redacted: '非表示のメッセージ', noText: '表示できるテキストがないメッセージ' }),
  'zh-TW': Object.freeze({ me: '我', participant: '對話對象', system: '提示', redacted: '已隱藏的訊息', noText: '沒有可顯示文字的訊息' }),
  'en-US': Object.freeze({ me: 'Me', participant: 'Chat participant', system: 'Notice', redacted: 'Hidden message', noText: 'Message without displayable text' }),
  'zh-CN': Object.freeze({ me: '我', participant: '聊天对象', system: '提示', redacted: '已隐藏的消息', noText: '没有可显示文本的消息' }),
});

/** Render timestamps in the device timezone, under the selected UI language. */
export function formatMobileChatTimeV1(value: string, locale: MobileUiLocale = 'ko-KR'): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: locale === 'en-US',
  }).format(date);
}

export function createMobileChatMessageViewV1(
  message: ChatMessageV1,
  verifiedCharacterDisplayName?: string,
  locale: MobileUiLocale = 'ko-KR',
): MobileChatMessageViewV1 {
  const role = message.senderType;
  const labels = CHAT_UI_LABELS_V1[locale];
  const label =
    role === 'user' ? labels.me :
    role === 'character' ? (verifiedCharacterDisplayName?.trim() || labels.participant) :
    labels.system;

  return Object.freeze({
    id: message.messageId,
    sequenceNo: message.sequenceNo,
    role,
    label,
    body: message.redacted
      ? labels.redacted
      : message.bodyText ?? labels.noText,
    redacted: message.redacted,
    timeLabel: formatMobileChatTimeV1(message.createdAt, locale),
  });
}

/** Pure, presentation-only grouping. No persisted records or message content are changed. */
export const MOBILE_CHAT_GROUP_MAX_GAP_MS_V1 = 3 * 60 * 1000;

export interface MobileChatMessageGroupV1 {
  readonly id: string;
  readonly role: ChatMessageV1['senderType'];
  readonly characterId: string | null;
  readonly label: string;
  readonly timeLabel: string;
  readonly messages: readonly MobileChatMessageViewV1[];
}

export function groupMobileChatMessagesV1(
  messages: readonly ChatMessageV1[],
  verifiedCharacterDisplayName?: string,
  locale: MobileUiLocale = 'ko-KR',
): readonly MobileChatMessageGroupV1[] {
  type MutableGroup = {
    id: string;
    role: ChatMessageV1['senderType'];
    characterId: string | null;
    label: string;
    messages: MobileChatMessageViewV1[];
  };
  const groups: MutableGroup[] = [];
  let previous: ChatMessageV1 | null = null;
  for (const message of messages) {
    const view = createMobileChatMessageViewV1(message, verifiedCharacterDisplayName, locale);
    const last: MutableGroup | undefined = groups[groups.length - 1];
    const currentTime = Date.parse(message.createdAt);
    const previousTime = previous === null ? Number.NaN : Date.parse(previous.createdAt);
    // Only consecutive same-sender messages within a 3-minute gap join.
    // System notices, redacted tombstones, invalid or reversed clocks stay separate.
    const canJoin = last !== undefined && previous !== null &&
      message.senderType !== 'system' &&
      !message.redacted && !previous.redacted &&
      message.senderType === previous.senderType &&
      message.characterId === previous.characterId &&
      Number.isFinite(currentTime) && Number.isFinite(previousTime) &&
      currentTime >= previousTime &&
      currentTime - previousTime <= MOBILE_CHAT_GROUP_MAX_GAP_MS_V1;
    if (canJoin && last !== undefined) {
      last.messages.push(view);
    } else {
      groups.push({
        id: view.id,
        role: view.role,
        characterId: message.characterId,
        label: view.label,
        messages: [view],
      });
    }
    previous = message;
  }
  return Object.freeze(groups.map(group => Object.freeze({
    id: group.id,
    role: group.role,
    characterId: group.characterId,
    label: group.label,
    timeLabel: group.messages[group.messages.length - 1]?.timeLabel ?? '',
    messages: Object.freeze([...group.messages]),
  })));
}
