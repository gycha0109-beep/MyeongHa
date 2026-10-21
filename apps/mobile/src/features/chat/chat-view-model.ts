import type { ChatMessageV1 } from '@myeongha/api-client';

export interface MobileChatMessageViewV1 {
  readonly id: string;
  readonly sequenceNo: number;
  readonly role: 'user' | 'character' | 'system';
  readonly label: '나' | '대화 상대' | '안내';
  readonly body: string;
  readonly redacted: boolean;
  readonly isPaidReaderMarker: boolean;
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
): MobileChatMessageViewV1 {
  const role = message.senderType;
  const isPaidReaderMarker = role === 'character'
    && message.redacted === false
    && message.bodyText === '유료 해설 기록이 있습니다.';
  const label =
    role === 'user' ? '나' :
    role === 'character' ? '대화 상대' :
    '안내';

  return Object.freeze({
    id: message.messageId,
    sequenceNo: message.sequenceNo,
    role,
    label,
    body: message.redacted
      ? '가려진 메시지'
      : isPaidReaderMarker
        ? '유료 사주 해설의 기록입니다. 현재 이용권을 확인한 후 내 기록에서 확인할 수 있습니다.'
        : message.bodyText ?? '표시할 수 있는 텍스트가 없는 메시지',
    redacted: message.redacted,
    isPaidReaderMarker,
    timeLabel: timeLabel(message.createdAt),
  });
}
