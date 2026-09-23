import type { SajuDomainV1 } from './saju-domain-contract.js';

export interface OfficialReadingRecordBrowserPayloadV1 {
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly sajuDomain: SajuDomainV1;
  readonly readingContractVersion: string;
  readonly productResponseState: string;
  readonly readerCharacterIds: readonly string[];
  readonly completedAt: string;
  readonly reading: Readonly<Record<string, unknown>>;
}

export class OfficialReadingRecordContractErrorV1 extends TypeError {}

export function parseOfficialReadingRecordPayloadV1(
  payload: unknown,
): OfficialReadingRecordBrowserPayloadV1;
