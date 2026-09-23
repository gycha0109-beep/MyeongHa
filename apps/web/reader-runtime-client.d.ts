import type { ReaderSceneV1 } from './reader-scene-contract.js';

export const READER_RUNTIME_ENDPOINT_V1:
  '/api/me/readings/reader-interpretation/preview';

export type ReaderRuntimeClientErrorCodeV1 =
  | 'READER_REQUEST_INVALID'
  | 'READER_SESSION_REQUIRED'
  | 'READER_ACCESS_DENIED'
  | 'READER_AUTHORITY_CONFLICT'
  | 'READER_CONTEXT_UNAVAILABLE'
  | 'READER_SERVICE_UNAVAILABLE'
  | 'READER_REQUEST_FAILED'
  | 'READER_MALFORMED_RESPONSE'
  | 'READER_REQUEST_ABORTED'
  | 'READER_FEATURE_UNAVAILABLE'
  | 'READER_TRANSPORT_UNAVAILABLE';

export class ReaderRuntimeClientErrorV1 extends Error {
  readonly code: ReaderRuntimeClientErrorCodeV1;
  readonly retryable: boolean;
  constructor(
    code: ReaderRuntimeClientErrorCodeV1,
    message: string,
    retryable?: boolean,
    cause?: unknown,
  );
}

export type ReaderRuntimeBearerV1 = Readonly<{
  kind: 'member' | 'guest';
  token: string;
}>;

export interface ReaderRuntimeReadInputV1 {
  readonly threadId: string;
  readonly officialReadingId: string;
  readonly signal?: AbortSignal;
  readonly [key: string]: unknown;
}

export interface ReaderRuntimeClientV1 {
  readonly enabled: boolean;
  readonly endpoint: string;
  readReaderScene(input: ReaderRuntimeReadInputV1): Promise<ReaderSceneV1>;
}

export function createReaderRuntimeClientV1(
  options?: Readonly<{
    enabled?: boolean;
    fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    resolveBearer?: () =>
      | ReaderRuntimeBearerV1
      | null
      | Promise<ReaderRuntimeBearerV1 | null>;
    endpoint?: string;
    invalidateMember?: (token: string) => void;
    invalidateGuest?: (token: string) => void;
  }>,
): ReaderRuntimeClientV1;
