export const CHAT_OPEN_ENDPOINT_V1: '/api/chat';

export type ChatOpenClientErrorCodeV1 =
  | 'CHAT_OPEN_REQUEST_INVALID'
  | 'CHAT_OPEN_SESSION_REQUIRED'
  | 'CHAT_OPEN_MEMBER_REQUIRED'
  | 'CHAT_OPEN_CHARACTER_UNAVAILABLE'
  | 'CHAT_OPEN_CONTENT_UNAVAILABLE'
  | 'CHAT_OPEN_CONTENT_INCOMPATIBLE'
  | 'CHAT_OPEN_REQUEST_FAILED'
  | 'CHAT_OPEN_MALFORMED_RESPONSE'
  | 'CHAT_OPEN_TRANSPORT_UNAVAILABLE';

export class ChatOpenClientErrorV1 extends Error {
  readonly code: ChatOpenClientErrorCodeV1;
  readonly retryable: boolean;
  constructor(
    code: ChatOpenClientErrorCodeV1,
    message: string,
    retryable?: boolean,
    cause?: unknown,
  );
}

export interface ChatOpenResultV1 {
  readonly threadId: string;
  readonly characterId: string;
  readonly created: boolean;
}

export interface ChatOpenClientV1 {
  readonly endpoint: string;
  openForCanonicalCharacter(input: Readonly<{
    characterId: string;
  }>): Promise<Readonly<ChatOpenResultV1>>;
  openForServerCharacter(input: Readonly<{
    readerCharacterId: string;
  }>): Promise<Readonly<ChatOpenResultV1>>;
}

export function buildChatThreadUrlV1(threadId: string, path?: string): string;

export function createChatOpenClientV1(
  options?: Readonly<{
    fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    resolveBearer?: () =>
      | Readonly<{ kind: 'member' | 'guest'; token: string }>
      | null
      | Promise<Readonly<{ kind: 'member' | 'guest'; token: string }> | null>;
    endpoint?: string;
    invalidateMember?: (token: string) => void;
    invalidateGuest?: (token: string) => void;
  }>,
): ChatOpenClientV1;
