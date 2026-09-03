import {
  PRODUCTION_BIRTH_INPUT_FINGERPRINT_BINDING_V1,
  requireProductionBirthInputHmacK1SecretV1,
} from './production-birth-input-fingerprint.js';

export interface ProductionBirthProfileCreateRuntimeConfigV1 {
  readonly birthInputHmacK1Secret: string;
}

export function parseProductionBirthProfileCreateRuntimeConfigV1(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ProductionBirthProfileCreateRuntimeConfigV1 {
  const secret = requireProductionBirthInputHmacK1SecretV1(
    env[PRODUCTION_BIRTH_INPUT_FINGERPRINT_BINDING_V1.secretEnvName],
  );

  return Object.freeze({
    birthInputHmacK1Secret: secret,
  });
}
