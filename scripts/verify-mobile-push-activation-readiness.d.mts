export interface MobilePushActivationEnvironmentV1 {
  readonly EXPO_PUBLIC_EAS_PROJECT_ID?: string | undefined;
  readonly MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET?: string | undefined;
  readonly MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET?: string | undefined;
}

export interface MobilePushActivationReadinessReportV1 {
  readonly ready: boolean;
  readonly blockers: readonly string[];
  readonly violations: readonly string[];
}

export const MOBILE_PUSH_ACTIVATION_BINDINGS_V1: Readonly<{
  easProjectIdEnv: 'EXPO_PUBLIC_EAS_PROJECT_ID';
  encryptionSecretEnv: 'MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET';
  fingerprintSecretEnv: 'MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET';
  providerService: 'Expo Push Notifications';
  productionAppId: 'com.myeongha.app';
  minimumSecretBytes: 32;
}>;

export function evaluateMobilePushActivationReadinessV1(
  appJson: unknown,
  mobilePackage: unknown,
  runtimeEnvironment?: MobilePushActivationEnvironmentV1,
): MobilePushActivationReadinessReportV1;

export function readMobilePushActivationReadinessV1(
  rootDir: string,
  runtimeEnvironment?: MobilePushActivationEnvironmentV1,
): Promise<MobilePushActivationReadinessReportV1>;
