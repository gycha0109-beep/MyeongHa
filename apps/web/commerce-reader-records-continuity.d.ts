export declare const COMMERCE_READER_RECORD_CONTINUITY_V1: 'commerce-reader-record-continuity-v1';
export declare const COMMERCE_READER_PURCHASE_RECORD_ENTRY_V1: 'verified-reader-purchase';
export interface CommerceReaderRecordsEntryV1 {
  readonly contractVersion: 'commerce-reader-product-continuity-v1';
  readonly officialReadingId: string;
  readonly readerCharacterId: string;
  readonly receiptBinding: 'issued' | 'historical_replay';
  readonly purchaseRole: 'initial_reading' | 'additional_reader_interpretation';
  readonly summary: 'requires_authorized_saju_source_and_reader_delivery';
  readonly readerFollowup: 'requires_fresh_exact_grant_and_existing_thread';
  readonly recordDetail: 'requires_current_subject_owned_read';
  readonly checkoutEnabled: false;
  readonly paidContentRevealed: false;
}
export declare function buildVerifiedReaderRecordsEntryUrlV1(
  continuation: CommerceReaderRecordsEntryV1,
  path?: string,
): string;
export declare function parseVerifiedReaderRecordsEntryV1(search: string | URLSearchParams):
  | Readonly<{state: 'none' | 'invalid'}>
  | Readonly<{state: 'ready'; readingId: string; readerCharacterId: string}>;
export type CurrentReaderRecordsContinuityV1 =
  | Readonly<{state: 'existing_thread_candidate'; readingId: string; readerCharacterId: string; threadId: string}>
  | Readonly<{state: 'not_available'; readingId: string; readerCharacterId: string}>;
export declare function parseCurrentReaderRecordContinuityV1(
  envelope: unknown, expected: {readonly readingId: string; readonly readerCharacterId: string},
): CurrentReaderRecordsContinuityV1;
