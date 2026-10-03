export interface MobileAndroidPhysicalSmokeReadinessReportV1 {
  readonly ready: boolean;
  readonly violations: readonly string[];
}

export const MOBILE_ANDROID_PHYSICAL_SMOKE_V1: Readonly<{
  easProjectId: '5c20243c-60a8-44f3-9d8c-ca06ccc8bebe';
  androidPackage: 'com.myeongha.app';
  profile: 'physical-smoke';
  environment: 'production';
  gradleCommand: ':app:assembleDebug';
  withoutCredentials: true;
}>;

export function evaluateMobileAndroidPhysicalSmokeReadinessV1(
  appJson: unknown,
  easJson: unknown,
): MobileAndroidPhysicalSmokeReadinessReportV1;

export function readMobileAndroidPhysicalSmokeReadinessV1(
  rootDir: string,
): Promise<MobileAndroidPhysicalSmokeReadinessReportV1>;
