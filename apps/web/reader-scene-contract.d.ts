export const READER_SCENE_SCHEMA_VERSION_V1:
  'myeongha-reader-interpretation-preview-http-v1';

export class ReaderSceneContractErrorV1 extends Error {
  readonly code: 'WEB_READER_SCENE_MALFORMED_RESPONSE';
}

export interface ReaderSceneSegmentV1 {
  readonly kind: string;
  readonly text: string;
}

export interface ReaderSceneInterpretationV1 {
  readonly schemaVersion: typeof READER_SCENE_SCHEMA_VERSION_V1;
  readonly lifecycle: 'preview';
  readonly mode: 'reader_interpretation';
  readonly officialReadingId: string;
  readonly readerCharacterId: string;
  readonly domain: string;
  readonly interpretationHash: string;
  readonly utterance: Readonly<{
    characterId: string;
    requestedDomain: string;
    segments: readonly ReaderSceneSegmentV1[];
  }>;
}

export interface ReaderSceneProtectedFallbackV1 {
  readonly schemaVersion: typeof READER_SCENE_SCHEMA_VERSION_V1;
  readonly lifecycle: 'preview';
  readonly mode: 'protected_fallback';
  readonly officialReadingId: string;
  readonly readerCharacterId: string;
  readonly domain: string;
  readonly interpretationHash: string;
  readonly fallbackReason:
    | 'renderer_protected_fallback'
    | 'semantic_guard_failed';
}

export type ReaderSceneV1 =
  | ReaderSceneInterpretationV1
  | ReaderSceneProtectedFallbackV1;

export interface ReaderPresentationV1 {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly intro: string;
  readonly generic: boolean;
}

export type ReaderSceneViewModelV1 =
  | Readonly<{
      state: 'ready';
      readerCharacterId: string;
      presentation: ReaderPresentationV1;
      presentationHint: string | null;
      presentationHintMismatch: boolean;
      officialReadingId: string;
      domain: string;
      interpretationHash: string;
      segments: readonly ReaderSceneSegmentV1[];
    }>
  | Readonly<{
      state: 'protected_fallback';
      readerCharacterId: string;
      presentation: ReaderPresentationV1;
      presentationHint: string | null;
      presentationHintMismatch: boolean;
      officialReadingId: string;
      domain: string;
      interpretationHash: string;
      fallbackReason:
        | 'renderer_protected_fallback'
        | 'semantic_guard_failed';
      segments: readonly [];
    }>;

export function parseReaderSceneEnvelopeV1(payload: unknown): ReaderSceneV1;

export function projectReaderSceneViewModelV1(
  scene: ReaderSceneV1,
  options?: Readonly<{
    presentationHint?: string | null;
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
): ReaderSceneViewModelV1;
