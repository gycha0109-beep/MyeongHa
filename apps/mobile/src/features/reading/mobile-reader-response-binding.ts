import {
  MyeongHaApiClientErrorV1,
  type OfficialReadingRecordV1,
  type ReaderInterpretationPreviewResultV1,
} from '@myeongha/api-client';

import type { MobileReaderPresentationIdV1 } from './mobile-reader-presentation.js';
import type { MobileReaderVerificationFailureV1 } from './mobile-official-reading-reader-entry-view-model.js';

export interface MobileReaderResponseBindingV1 {
  readonly officialReading: Pick<OfficialReadingRecordV1, 'readingId' | 'sajuDomain'>;
  readonly expectedReaderId: MobileReaderPresentationIdV1;
}

function rejectMismatch(): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'CLIENT_READER_SCENE_BINDING_MISMATCH',
    'Reader response does not match the server-owned Official Reading and pinned Reader context.',
  );
}

/**
 * Defense in depth after the shared API client validates its wire schema.
 * This is response identity matching, never a purchase grant, release approval
 * or permission to call an unpublished endpoint.
 */
export function assertMobileReaderResponseBindingV1(
  binding: MobileReaderResponseBindingV1,
  result: ReaderInterpretationPreviewResultV1,
): void {
  if (
    result.lifecycle !== 'preview' ||
    result.officialReadingId !== binding.officialReading.readingId ||
    result.readerCharacterId !== binding.expectedReaderId ||
    result.domain !== binding.officialReading.sajuDomain
  ) {
    return rejectMismatch();
  }
  if (result.mode === 'reader_interpretation') {
    if (
      result.utterance.characterId !== binding.expectedReaderId ||
      result.utterance.requestedDomain !== binding.officialReading.sajuDomain
    ) {
      return rejectMismatch();
    }
  } else if (result.mode !== 'protected_fallback') {
    return rejectMismatch();
  }
}

/**
 * HTTP denial/invalid responses never become client-synthesized commerce
 * or Product eligibility decisions. Retriability is presentation only.
 */
export function classifyMobileReaderVerificationFailureV1(
  error: unknown,
): MobileReaderVerificationFailureV1 {
  if (
    error instanceof MyeongHaApiClientErrorV1 &&
    (error.kind === 'network' || error.retryable)
  ) {
    return 'retryable_failure';
  }
  return 'protected_failure';
}
