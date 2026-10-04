import {
  createCipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import type {
  DeviceInstallationTokenProtectionPortV1,
  ProtectedPushTokenV1,
} from './device-installation-register-command.js';

export const PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1 = Object.freeze({
  encryptionScheme: 'aes-256-gcm',
  fingerprintScheme: 'hmac-sha256',
  keyId: 'k1',
  encryptionDomain: 'myeongha.push-token.encryption.v1',
  fingerprintDomain: 'myeongha.push-token.fingerprint.v1',
  encryptionEnvName: 'MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET',
  fingerprintEnvName: 'MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET',
  minimumSecretBytes: 32,
} as const);

function requireSecret(name: string, value: unknown): string {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') <
      PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.minimumSecretBytes
  ) {
    throw new Error(`${name} is missing or shorter than the production minimum.`);
  }
  return value;
}

function deriveEncryptionKey(secret: string): Buffer {
  return createHmac('sha256', secret)
    .update(
      PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.encryptionDomain,
      'utf8',
    )
    .digest();
}

export function protectProductionExpoPushTokenV1(input: {
  readonly rawToken: string;
  readonly encryptionSecret: string;
  readonly fingerprintSecret: string;
}): ProtectedPushTokenV1 {
  const encryptionSecret = requireSecret(
    PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.encryptionEnvName,
    input.encryptionSecret,
  );
  const fingerprintSecret = requireSecret(
    PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.fingerprintEnvName,
    input.fingerprintSecret,
  );

  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    deriveEncryptionKey(encryptionSecret),
    iv,
  );
  cipher.setAAD(
    Buffer.from(
      PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.encryptionDomain,
      'utf8',
    ),
  );
  const ciphertext = Buffer.concat([
    cipher.update(input.rawToken, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const fingerprint = createHmac('sha256', fingerprintSecret)
    .update(
      PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.fingerprintDomain,
      'utf8',
    )
    .update('\0', 'utf8')
    .update(input.rawToken, 'utf8')
    .digest('hex');

  return Object.freeze({
    encryptedToken: [
      PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.encryptionScheme,
      PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.keyId,
      iv.toString('base64url'),
      ciphertext.toString('base64url'),
      tag.toString('base64url'),
    ].join(':'),
    keyId: PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.keyId,
    fingerprint: [
      PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.fingerprintScheme,
      PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.keyId,
      fingerprint,
    ].join(':'),
  });
}

export function createProductionDeviceInstallationTokenProtectionPortV1(
  input: {
    readonly encryptionSecret: string;
    readonly fingerprintSecret: string;
  },
): DeviceInstallationTokenProtectionPortV1 {
  const encryptionSecret = requireSecret(
    PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.encryptionEnvName,
    input.encryptionSecret,
  );
  const fingerprintSecret = requireSecret(
    PRODUCTION_PUSH_TOKEN_PROTECTION_BINDING_V1.fingerprintEnvName,
    input.fingerprintSecret,
  );

  return Object.freeze({
    protectExpoPushToken(rawToken: string) {
      return protectProductionExpoPushTokenV1({
        rawToken,
        encryptionSecret,
        fingerprintSecret,
      });
    },
  });
}
