import {
  MOBILE_READER_INTERPRETATION_PUBLIC_V1,
  type MobileReaderPresentationIdV1,
  isMobileReaderPreviewSelectableV1,
} from './mobile-reader-presentation.js';

/**
 * UI projection only. These names are not API response statuses or permission grants.
 * Unchecked server axes must never be inferred from a visible Reader or preview.
 */
export type MobileReaderServerEvidenceV1<T extends string> =
  | Readonly<{ kind: 'not_checked' }>
  | Readonly<{ kind: 'server_verified'; value: T }>;

export interface MobileReaderAccessViewStateV1 {
  readonly readerId: MobileReaderPresentationIdV1;
  readonly previewPresentation: 'preview_available' | 'concept_pending';
  readonly productEligibility: MobileReaderServerEvidenceV1<
    'product_eligible' | 'unsupported_for_product'
  >;
  readonly purchaseAccess: MobileReaderServerEvidenceV1<
    'access_required' | 'access_granted'
  >;
  readonly releaseApproval: MobileReaderServerEvidenceV1<
    'approved' | 'approval_pending' | 'temporarily_unavailable'
  >;
  readonly officialReadingAccess: MobileReaderServerEvidenceV1<
    'allowed' | 'denied'
  >;
  readonly interpretationRoute: 'public_route_off' | 'server_admission_required';
}

const NOT_CHECKED = Object.freeze({ kind: 'not_checked' as const });

/**
 * Local presentation readiness is the only currently known axis.
 * Product, purchase, publication and Reading access remain unknown until
 * their individual server-owned contracts exist. This model never authorizes
 * the Interpretation API or a paid action.
 */
export function createMobileReaderAccessViewStateV1(
  readerId: MobileReaderPresentationIdV1,
): MobileReaderAccessViewStateV1 {
  return Object.freeze({
    readerId,
    previewPresentation: isMobileReaderPreviewSelectableV1(readerId)
      ? 'preview_available' as const
      : 'concept_pending' as const,
    productEligibility: NOT_CHECKED,
    purchaseAccess: NOT_CHECKED,
    releaseApproval: NOT_CHECKED,
    officialReadingAccess: NOT_CHECKED,
    interpretationRoute: MOBILE_READER_INTERPRETATION_PUBLIC_V1
      ? 'server_admission_required' as const
      : 'public_route_off' as const,
  });
}
