import type { ReaderRuntimeClientV1 } from './reader-runtime-client.js';
import type { ReaderSceneViewModelV1 } from './reader-scene-contract.js';
import type { PersistedReadingHandoffParseResultV1 } from './reading-history-handoff.js';

export interface ReaderSceneControllerInputV1 {
  readonly threadId: string;
  readonly officialReadingId: string;
  readonly presentationHint?: string | null;
}

export type ReaderSceneControllerStateV1 =
  | Readonly<{ state: 'idle'; canRetry: false }>
  | Readonly<{ state: 'loading'; canRetry: false; generation: number }>
  | ReaderSceneViewModelV1
  | Readonly<{
      state:
        | 'feature_unavailable'
        | 'auth_required'
        | 'access_denied'
        | 'retryable_error'
        | 'unavailable'
        | 'aborted';
      canRetry: boolean;
      code: string;
    }>;

export interface ReaderSceneControllerPersistedInputV1 {
  readonly threadId: unknown;
  readonly persistedReadingHandoff: PersistedReadingHandoffParseResultV1;
  readonly presentationHint?: string | null;
}

export interface ReaderSceneControllerV1 {
  load(input: ReaderSceneControllerInputV1): Promise<ReaderSceneControllerStateV1>;
  loadPersistedReading(
    input: ReaderSceneControllerPersistedInputV1,
  ): Promise<ReaderSceneControllerStateV1>;
  retry(): Promise<ReaderSceneControllerStateV1>;
  cancel(): ReaderSceneControllerStateV1;
  getState(): ReaderSceneControllerStateV1;
}

export function createReaderSceneControllerV1(
  options: Readonly<{
    client: Pick<ReaderRuntimeClientV1, 'readReaderScene'>;
    onState: (state: ReaderSceneControllerStateV1) => void;
    resolvePresentation?: (
      readerCharacterId: string,
    ) =>
      | Readonly<{
          name?: string;
          title?: string;
          intro?: string;
        }>
      | null
      | undefined;
  }>,
): ReaderSceneControllerV1;
