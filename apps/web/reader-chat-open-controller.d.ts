import type { ChatOpenClientV1 } from './chat-open-client.js';
import type { ReaderSceneViewModelV1 } from './reader-scene-contract.js';

export type ReaderChatOpenControllerStateV1 =
  | Readonly<{ state: 'idle'; canRetry: false }>
  | Readonly<{
      state: 'opening';
      canRetry: false;
      readerCharacterId: string;
      officialReadingId: string;
      generation: number;
    }>
  | Readonly<{
      state: 'opened';
      canRetry: false;
      readerCharacterId: string;
      officialReadingId: string;
      threadId: string;
      created: boolean;
      destination: string;
    }>
  | Readonly<{
      state:
        | 'auth_required'
        | 'member_required'
        | 'character_unavailable'
        | 'retryable_error'
        | 'unavailable';
      canRetry: boolean;
      code: string;
    }>;

export interface ReaderChatOpenControllerV1 {
  open(scene: ReaderSceneViewModelV1): Promise<ReaderChatOpenControllerStateV1>;
  retry(): Promise<ReaderChatOpenControllerStateV1>;
  reset(): ReaderChatOpenControllerStateV1;
  getState(): ReaderChatOpenControllerStateV1;
}

export function createReaderChatOpenControllerV1(
  options: Readonly<{
    client: Pick<ChatOpenClientV1, 'openForServerCharacter'>;
    onState: (state: ReaderChatOpenControllerStateV1) => void;
    onNavigate?: (destination: string) => void;
  }>,
): ReaderChatOpenControllerV1;
