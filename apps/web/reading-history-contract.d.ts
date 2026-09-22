export interface ReadingHistoryBrowserItemV1 {
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly sajuDomain: string;
  readonly readingContractVersion: string;
  readonly productResponseState: string;
  readonly createdAt: string;
  readonly completedAt: string;
}

export interface ReadingHistoryBrowserPayloadV1 {
  readonly readings: readonly ReadingHistoryBrowserItemV1[];
}

export class ReadingHistoryContractErrorV1 extends TypeError {}

export function parseReadingHistoryPayloadV1(
  payload: unknown,
): ReadingHistoryBrowserPayloadV1;
