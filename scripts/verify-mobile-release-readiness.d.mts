export const MOBILE_RELEASE_PRODUCTION_API_ORIGIN_V1: 'https://myeongha.vercel.app';

export interface MobileReleaseEnvironmentV1 {
  readonly EXPO_PUBLIC_MYEONGHA_API_ORIGIN?: string | undefined;
}

export interface MobileReleaseReadinessReportV1 {
  readonly ready: boolean;
  readonly blockers: readonly string[];
  readonly violations: readonly string[];
}

export function resolveMobileReleaseApiOriginV1(
  configured?: string,
): string;

export function evaluateMobileReleaseReadinessV1(
  appJson: unknown,
  mobilePackage: unknown,
  runtimeEnvironment?: MobileReleaseEnvironmentV1,
): MobileReleaseReadinessReportV1;

export function readMobileReleaseReadinessV1(
  rootDir: string,
  runtimeEnvironment?: MobileReleaseEnvironmentV1,
): Promise<MobileReleaseReadinessReportV1>;
