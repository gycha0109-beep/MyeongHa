export const PERSISTED_READING_HANDOFF_SOURCE_V1: 'records';

export interface PersistedReadingHandoffInputV1 {
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly sajuDomain: string;
}

export interface PersistedReadingHandoffReadyV1
  extends PersistedReadingHandoffInputV1 {
  readonly state: 'ready';
  readonly source: typeof PERSISTED_READING_HANDOFF_SOURCE_V1;
}

export type PersistedReadingHandoffParseResultV1 =
  | Readonly<{ state: 'none' }>
  | Readonly<{ state: 'invalid' }>
  | Readonly<PersistedReadingHandoffReadyV1>;

export function createPersistedReadingHandoffV1(
  input: PersistedReadingHandoffInputV1,
): Readonly<{
  source: typeof PERSISTED_READING_HANDOFF_SOURCE_V1;
  readingId: string;
  readingSessionId: string;
  sajuDomain: string;
}>;

export function buildPersistedReadingHandoffUrlV1(
  input: PersistedReadingHandoffInputV1,
  path?: string,
): string;

export function parsePersistedReadingHandoffV1(
  search?: URLSearchParams | string | null,
): PersistedReadingHandoffParseResultV1;
