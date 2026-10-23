import type { ChatMessageV1 } from '@myeongha/api-client';

export interface MobileChatMessageViewV1 {
  readonly id: string;
  readonly sequenceNo: number;
  readonly role: 'user' | 'character' | 'system';
  readonly label: string;
  readonly body: string;
  readonly redacted: boolean;
  readonly timeLabel: string;
}

function timeLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function createMobileChatMessageViewV1(
  message: ChatMessageV1,
  verifiedCharacterDisplayName?: string,
): MobileChatMessageViewV1 {
  const role = message.senderType;
  const label =
    role === 'user' ? '나' :
    role === 'character' ? (verifiedCharacterDisplayName?.trim() || '대화 상대') :
    '안내';

  return Object.freeze({
    id: message.messageId,
    sequenceNo: message.sequenceNo,
    role,
    label,
    body: message.redacted
      ? '가려진 메시지'
      : message.bodyText ?? '표시할 수 있는 텍스트가 없는 메시지',
    redacted: message.redacted,
    timeLabel: timeLabel(message.createdAt),
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
    const view = createMobileChatMessageViewV1(message, verifiedCharacterDisplayName);
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
