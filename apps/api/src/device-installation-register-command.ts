import { ApiCommandError } from './api-error.js';

export const DEVICE_INSTALLATION_CLIENT_CAPABILITY_V1 =
  'mobile-push-registration-v1' as const;

export type DeviceInstallationPlatformV1 = 'ios' | 'android';
export type DeviceInstallationRegistrationStateV1 =
  | 'created'
  | 'refreshed'
  | 'rebound';

type Awaitable<T> = T | Promise<T>;

export interface ProtectedPushTokenV1 {
  readonly encryptedToken: string;
  readonly keyId: 'k1';
  readonly fingerprint: string;
}

export interface DeviceInstallationTokenProtectionPortV1 {
  protectExpoPushToken(rawToken: string): ProtectedPushTokenV1;
}

export interface DeviceInstallationRegistrationIdPortV1 {
  nextInstallationId(): string;
}

export interface DeviceInstallationRegisterAuthorityRowV1 {
  readonly installationId: string;
  readonly registrationState: DeviceInstallationRegistrationStateV1;
  readonly tokenChanged: boolean;
  readonly lastSeenAt: string;
}

export type DeviceInstallationRegisterAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'REGISTRATION_CONFLICT'
  | 'INVALID_INPUT';

export class DeviceInstallationRegisterAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: DeviceInstallationRegisterAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'DeviceInstallationRegisterAuthorityPortErrorV1';
  }
}

export interface DeviceInstallationRegisterAuthorityPortV1 {
  registerDeviceInstallation(input: {
    readonly subjectId: string;
    readonly installationId: string;
    readonly platform: DeviceInstallationPlatformV1;
    readonly installationKey: string;
    readonly pushTokenEncrypted: string;
    readonly pushTokenKeyId: 'k1';
    readonly tokenFingerprint: string;
    readonly appVersion: string;
    readonly clientCapability: typeof DEVICE_INSTALLATION_CLIENT_CAPABILITY_V1;
  }): Awaitable<readonly DeviceInstallationRegisterAuthorityRowV1[]>;
}

export interface RegisterDeviceInstallationInputV1 {
  readonly resolvedSubjectId?: string;
  readonly request: unknown;
  readonly idPort: DeviceInstallationRegistrationIdPortV1;
  readonly tokenProtectionPort: DeviceInstallationTokenProtectionPortV1;
  readonly authorityPort: DeviceInstallationRegisterAuthorityPortV1;
}

export interface RegisterDeviceInstallationResponseV1 {
  readonly installationId: string;
  readonly registrationState: DeviceInstallationRegistrationStateV1;
  readonly tokenChanged: boolean;
  readonly lastSeenAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Device Installation registration contains an unsupported field.',
    );
  }
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requirePlatform(value: unknown): DeviceInstallationPlatformV1 {
  if (value !== 'ios' && value !== 'android') {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Device Installation platform must be ios or android.',
    );
  }
  return value;
}

function requireInstallationKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 8 ||
    value.length > 128 ||
    /[\u0000-\u001f\u007f\s]/u.test(value)
  ) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Device Installation key is outside the supported bounds.',
    );
  }
  return value;
}

function requireExpoPushToken(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 512 ||
    !/^(?:Expo|Exponent)PushToken\[[^\]\s]{16,384}\]$/u.test(value)
  ) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Expo push token is malformed.',
    );
  }
  return value;
}

function requireAppVersion(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/u.test(value)
  ) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Mobile app version is malformed.',
    );
  }
  return value;
}

function requireCapability(
  value: unknown,
): typeof DEVICE_INSTALLATION_CLIENT_CAPABILITY_V1 {
  if (value !== DEVICE_INSTALLATION_CLIENT_CAPABILITY_V1) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Device Installation client capability is unsupported.',
    );
  }
  return value;
}

function requireServerInstallationId(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  ) {
    throw new Error('Device Installation id port returned a malformed UUID.');
  }
  return value;
}

function requireTimestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error(
      'Device Installation authority returned an invalid lastSeenAt timestamp.',
    );
  }
  return value;
}

function requireRegistrationState(
  value: unknown,
): DeviceInstallationRegistrationStateV1 {
  if (value !== 'created' && value !== 'refreshed' && value !== 'rebound') {
    throw new Error(
      'Device Installation authority returned an invalid registration state.',
    );
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof DeviceInstallationRegisterAuthorityPortErrorV1)) {
    throw error;
  }

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Device Installation registration is unavailable for the current subject.',
      );
    case 'REGISTRATION_CONFLICT':
      throw new ApiCommandError(
        'IDEMPOTENCY_CONFLICT',
        'Device Installation identity is already active elsewhere.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError(
        'INVALID_REQUEST',
        'Device Installation registration input was rejected.',
      );
  }
}

export async function registerDeviceInstallation(
  input: RegisterDeviceInstallationInputV1,
): Promise<RegisterDeviceInstallationResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  if (!isRecord(input.request)) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Device Installation registration request must be an object.',
    );
  }

  assertOnlyKeys(input.request, [
    'installationKey',
    'platform',
    'expoPushToken',
    'appVersion',
    'clientCapability',
  ]);

  const installationKey = requireInstallationKey(input.request.installationKey);
  const platform = requirePlatform(input.request.platform);
  const rawPushToken = requireExpoPushToken(input.request.expoPushToken);
  const appVersion = requireAppVersion(input.request.appVersion);
  const clientCapability = requireCapability(input.request.clientCapability);
  const installationId = requireServerInstallationId(
    input.idPort.nextInstallationId(),
  );
  const protectedToken =
    input.tokenProtectionPort.protectExpoPushToken(rawPushToken);

  try {
    const rows = await input.authorityPort.registerDeviceInstallation({
      subjectId,
      installationId,
      platform,
      installationKey,
      pushTokenEncrypted: protectedToken.encryptedToken,
      pushTokenKeyId: protectedToken.keyId,
      tokenFingerprint: protectedToken.fingerprint,
      appVersion,
      clientCapability,
    });

    const row = rows[0];
    if (rows.length !== 1 || row === undefined) {
      throw new Error(
        'Device Installation registration authority must return exactly one row.',
      );
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        row.installationId,
      )
    ) {
      throw new Error(
        'Device Installation registration authority returned an invalid installation id.',
      );
    }
    if (typeof row.tokenChanged !== 'boolean') {
      throw new Error(
        'Device Installation registration authority returned an invalid token change marker.',
      );
    }

    return Object.freeze({
      installationId: row.installationId,
      registrationState: requireRegistrationState(row.registrationState),
      tokenChanged: row.tokenChanged,
      lastSeenAt: requireTimestamp(row.lastSeenAt),
    });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
