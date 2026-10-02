import {
  PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1,
} from './device-installation-token-protection.js';
import type { ProductionUserDataRuntimeEnvV1 } from './production-user-data-runtime-config.js';

export interface ProductionDeviceInstallationRuntimeConfigV1 {
  readonly pushTokenEncryptionK1Secret: string;
  readonly pushTokenFingerprintK1Secret: string;
}

function requireSecret(
  env: ProductionUserDataRuntimeEnvV1,
  name: string,
): string {
  const value = env[name];
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') <
      PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.minimumSecretBytes
  ) {
    throw new Error(
      `Required production Device Installation secret is missing or too short: ${name}.`,
    );
  }
  return value;
}

export function parseProductionDeviceInstallationRuntimeConfigV1(
  env: ProductionUserDataRuntimeEnvV1,
): ProductionDeviceInstallationRuntimeConfigV1 {
  return Object.freeze({
    pushTokenEncryptionK1Secret: requireSecret(
      env,
      PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.encryptionEnvName,
    ),
    pushTokenFingerprintK1Secret: requireSecret(
      env,
      PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.fingerprintEnvName,
    ),
  });
}
