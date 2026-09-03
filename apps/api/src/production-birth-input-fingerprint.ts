import { createHmac } from 'node:crypto';
import type {
  BirthInputFingerprintPortV1,
  BirthInputV1,
} from './birth-profile-create-command.js';

export const PRODUCTION_BIRTH_INPUT_FINGERPRINT_BINDING_V1 = Object.freeze({
  scheme: 'hmac-sha256',
  keyVersion: 'k1',
  domain: 'myeongha.birth-input.v1',
  secretEnvName: 'MYEONGHA_BIRTH_INPUT_HMAC_K1_SECRET',
  minimumSecretBytes: 32,
} as const);

export function canonicalizeProductionBirthInputV1(input: BirthInputV1): string {
  return JSON.stringify([
    input.calendarType,
    input.birthDate,
    input.birthTime,
    input.timeKnown,
    input.isLeapMonth,
    input.sex,
  ]);
}

export function requireProductionBirthInputHmacK1SecretV1(value: unknown): string {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') <
      PRODUCTION_BIRTH_INPUT_FINGERPRINT_BINDING_V1.minimumSecretBytes
  ) {
    throw new Error('Production Birth input HMAC k1 secret is missing or too short.');
  }
  return value;
}

export function fingerprintProductionBirthInputV1(input: {
  readonly birthInput: BirthInputV1;
  readonly secret: string;
}): string {
  const secret = requireProductionBirthInputHmacK1SecretV1(input.secret);
  const canonicalInput = canonicalizeProductionBirthInputV1(input.birthInput);
  const binding = PRODUCTION_BIRTH_INPUT_FINGERPRINT_BINDING_V1;

  const digest = createHmac('sha256', secret)
    .update(binding.domain, 'utf8')
    .update('\0', 'utf8')
    .update(canonicalInput, 'utf8')
    .digest('hex');

  return `${binding.scheme}:${binding.keyVersion}:${digest}`;
}

export function createProductionBirthInputFingerprintPortV1(
  secret: string,
): BirthInputFingerprintPortV1 {
  const trustedSecret = requireProductionBirthInputHmacK1SecretV1(secret);

  return Object.freeze({
    fingerprintBirthInput(birthInput: BirthInputV1): string {
      return fingerprintProductionBirthInputV1({
        birthInput,
        secret: trustedSecret,
      });
    },
  });
}
