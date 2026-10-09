import type { OfficialReadingRecordV1 } from '@myeongha/api-client';

import {
  createMobileReaderAccessViewStateV1,
  type MobileReaderAccessViewStateV1,
} from './mobile-reader-access-view-model.js';
import type { MobileReaderPresentationIdV1 } from './mobile-reader-presentation.js';

/**
 * Mobile-only presentation states. Not server statuses, API contracts,
 * admission proofs or new permissions.
 */
export type MobileOfficialReadingReaderEntryStatusV1 =
  | 'public_route_off'
  | 'server_verification_required'
  | 'product_unsupported'
  | 'purchase_access_required'
  | 'release_approval_pending'
  | 'release_temporarily_unavailable'
  | 'official_reading_access_denied'
  | 'retryable_verification_failure'
  | 'protected_verification_failure'
  | 'server_admission_required';

export type MobileReaderVerificationFailureV1 =
  | 'retryable_failure'
  | 'protected_failure';

export interface MobileOfficialReadingReaderEntryViewStateV1 {
  readonly officialReadingId: string;
  readonly readerId: MobileReaderPresentationIdV1;
  readonly status: MobileOfficialReadingReaderEntryStatusV1;
  readonly statusMessage: string;
  readonly canStartInterpretation: false;
}

const STATUS_MESSAGES: Readonly<Record<MobileOfficialReadingReaderEntryStatusV1, string>> =
  Object.freeze({
    public_route_off: '공식 Reader 해설은 아직 공개되지 않았습니다.',
    server_verification_required: '상품·구매·공개 승인·공식 Reading 접근을 서버에서 확인해야 합니다.',
    product_unsupported: '이 상품은 해당 Reader 해설 대상이 아닙니다.',
    purchase_access_required: '해설 구매 접근권이 확인되지 않았습니다.',
    release_approval_pending: '해당 Reader 해설의 공개 승인을 기다리고 있습니다.',
    release_temporarily_unavailable: '해당 Reader 해설은 현재 이용할 수 없습니다.',
    official_reading_access_denied: '이 공식 Reading에 대한 해설 접근이 허용되지 않았습니다.',
    retryable_verification_failure: '서버 확인 중 일시적인 문제가 발생했습니다. 해설 진입은 차단됩니다.',
    protected_verification_failure: '권한 또는 응답을 안전하게 확인할 수 없어 해설 진입을 차단했습니다.',
    server_admission_required: '개별 확인 후에도 실제 해설 진입에는 별도 서버 승인이 필요합니다.',
  });

/**
 * A verified archive record supplies provenance for display only.
 * A Reader's identity, the record's readerCharacterIds and a known
 * presentation slot do not authorize interpretation or create a Thread.
 */
export function projectMobileOfficialReadingReaderEntryV1(
  record: Pick<OfficialReadingRecordV1, 'readingId'>,
  readerId: MobileReaderPresentationIdV1,
  options: Readonly<{
    access?: MobileReaderAccessViewStateV1;
    verificationFailure?: MobileReaderVerificationFailureV1;
  }> = {},
): MobileOfficialReadingReaderEntryViewStateV1 {
  const access = options.access ?? createMobileReaderAccessViewStateV1(readerId);
  if (access.readerId !== readerId) {
    throw new TypeError('Reader entry projection requires matching Reader identity.');
  }

  let status: MobileOfficialReadingReaderEntryStatusV1;
  if (access.interpretationRoute === 'public_route_off') {
    status = 'public_route_off';
  } else if (options.verificationFailure === 'protected_failure') {
    status = 'protected_verification_failure';
  } else if (options.verificationFailure === 'retryable_failure') {
    status = 'retryable_verification_failure';
  } else if (
    access.productEligibility.kind === 'server_verified' &&
    access.productEligibility.value === 'unsupported_for_product'
  ) {
    status = 'product_unsupported';
  } else if (
    access.officialReadingAccess.kind === 'server_verified' &&
    access.officialReadingAccess.value === 'denied'
  ) {
    status = 'official_reading_access_denied';
  } else if (
    access.releaseApproval.kind === 'server_verified' &&
    access.releaseApproval.value === 'temporarily_unavailable'
  ) {
    status = 'release_temporarily_unavailable';
  } else if (
    access.releaseApproval.kind === 'server_verified' &&
    access.releaseApproval.value === 'approval_pending'
  ) {
    status = 'release_approval_pending';
  } else if (
    access.purchaseAccess.kind === 'server_verified' &&
    access.purchaseAccess.value === 'access_required'
  ) {
    status = 'purchase_access_required';
  } else if (
    access.productEligibility.kind !== 'server_verified' ||
    access.purchaseAccess.kind !== 'server_verified' ||
    access.releaseApproval.kind !== 'server_verified' ||
    access.officialReadingAccess.kind !== 'server_verified'
  ) {
    status = 'server_verification_required';
  } else {
    // Even positive per-axis evidence is not the final server admission ticket.
    status = 'server_admission_required';
  }

  return Object.freeze({
    officialReadingId: record.readingId,
    readerId,
    status,
    statusMessage: STATUS_MESSAGES[status],
    canStartInterpretation: false as const,
  });
}
