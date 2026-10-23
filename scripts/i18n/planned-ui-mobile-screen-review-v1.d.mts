/**
 * Type surface for the ESM-only, source-backed mobile UI review script.
 * The runtime module stays read-only and release-ineligible.
 */
export interface ReviewedMobileScreenV1 {
  readonly screen: string;
  readonly path?: string;
  readonly keys: readonly string[];
}

export interface ReviewedMobileScreenAuditV1 {
  readonly screen: string;
  readonly sourceMissingKeys: readonly string[];
  readonly unstagedKeys: readonly string[];
  readonly renderedStateReviewComplete: false;
  readonly readyForRelease: false;
}

export interface ReviewedMobileScreenSummaryV1 {
  readonly screens: readonly ReviewedMobileScreenAuditV1[];
  readonly selectedLiteralsAligned: boolean;
  readonly pageRouteClassificationComplete: false;
  readonly privateDynamicDataInspected: false;
  readonly readyForRelease: false;
}

export const REVIEWED_MOBILE_SCREEN_STATIC_UI_KEYS_V1:
  readonly Readonly<Required<ReviewedMobileScreenV1>>[];

export function auditReviewedMobileScreenSourceV1(
  screen: ReviewedMobileScreenV1,
  source: string,
  stagedKeys: Iterable<string>,
): ReviewedMobileScreenAuditV1;

export function auditCurrentReviewedMobileScreensV1(
  repoRoot: string,
): Promise<ReviewedMobileScreenSummaryV1>;
