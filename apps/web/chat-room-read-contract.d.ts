export interface ChatRoomReadMessageV1 {
  readonly messageId: string;
  readonly sequenceNo: number;
  readonly senderType: string;
  readonly characterId: string | null;
  readonly bodyText: string | null;
  readonly createdAt: string;
  readonly redacted: boolean;
  readonly redactedAt: string | null;
}

export interface ChatRoomReadPayloadV1 {
  readonly threadId: string;
  readonly characterId: string;
  readonly afterSequenceNo: number;
  readonly lastSequenceNo: number;
  readonly messages: readonly ChatRoomReadMessageV1[];
}

export function parseChatThreadIdV1(value: unknown): string | null;


export type ChatThreadRouteV1 =
  | Readonly<{ state: 'none'; threadId: null }>
  | Readonly<{ state: 'invalid'; threadId: null }>
  | Readonly<{ state: 'ready'; threadId: string }>;

export function parseChatThreadRouteV1(
  search: URLSearchParams | string | null | undefined,
): ChatThreadRouteV1;

export function parseChatRoomReadPayloadV1(
  payload: unknown,
  options: Readonly<{
    expectedThreadId: unknown;
    expectedAfterSequenceNo?: number;
  }>,
): ChatRoomReadPayloadV1;
