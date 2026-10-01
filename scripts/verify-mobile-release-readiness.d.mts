export interface MobileReleaseReadinessReportV1 {
  readonly ready: boolean;
  readonly blockers: readonly string[];
  readonly violations: readonly string[];
}

export function evaluateMobileReleaseReadinessV1(
  appJson: unknown,
  mobilePackage: unknown,
): MobileReleaseReadinessReportV1;

export function readMobileReleaseReadinessV1(
  rootDir: string,
): Promise<MobileReleaseReadinessReportV1>;
