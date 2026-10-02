import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';

export const MOBILE_PUSH_CLIENT_CAPABILITY_V1 =
  'mobile-push-registration-v1' as const;

export type DeviceInstallationPlatformV1 = 'ios' | 'android';
export type DeviceInstallationRegistrationStateV1 =
  | 'created'
  | 'refreshed'
  | 'rebound';

export interface DeviceInstallationRegisterRequestV1 {
  readonly installationKey: string;
  readonly platform: DeviceInstallationPlatformV1;
  readonly expoPushToken: string;
  readonly appVersion: string;
  readonly clientCapability: typeof MOBILE_PUSH_CLIENT_CAPABILITY_V1;
}

export interface DeviceInstallationRegisterResponseV1 {
  readonly installationId: string;
  readonly registrationState: DeviceInstallationRegistrationStateV1;
  readonly tokenChanged: boolean;
  readonly lastSeenAt: string;
}

export interface DeviceInstallationRevokeResponseV1 {
  readonly installationId: string;
  readonly revokedAt: string;
  readonly replayed: boolean;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function malformed(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'DEVICE_INSTALLATION_RESPONSE_INVALID',
    message,
  );
}

function requireUuid(name: string, value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    return malformed(`Device Installation ${name} is invalid.`);
  }
  return value;
}

function requireTimestamp(name: string, value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Number.isNaN(Date.parse(value))
  ) {
    return malformed(`Device Installation ${name} is invalid.`);
  }
  return value;
}

export async function registerDeviceInstallationV1(
  client: MyeongHaApiClientV1,
  bearer: string,
  request: DeviceInstallationRegisterRequestV1,
): Promise<DeviceInstallationRegisterResponseV1> {
  const data = await client.requestData({
    method: 'POST',
    path: '/api/device-installations/register',
    bearer,
    body: request,
  });

  if (!isRecord(data)) {
    return malformed('Device Installation registration response is not an object.');
  }
  if (
    data.registrationState !== 'created' &&
    data.registrationState !== 'refreshed' &&
    data.registrationState !== 'rebound'
  ) {
    return malformed('Device Installation registration state is invalid.');
  }
  if (typeof data.tokenChanged !== 'boolean') {
    return malformed('Device Installation token change marker is invalid.');
  }

  return Object.freeze({
    installationId: requireUuid('installationId', data.installationId),
    registrationState: data.registrationState,
    tokenChanged: data.tokenChanged,
    lastSeenAt: requireTimestamp('lastSeenAt', data.lastSeenAt),
  });
}

export async function revokeDeviceInstallationV1(
  client: MyeongHaApiClientV1,
  bearer: string,
  installationId: string,
): Promise<DeviceInstallationRevokeResponseV1> {
  const safeId = requireUuid('installationId', installationId);
  const data = await client.requestData({
    method: 'POST',
    path: `/api/device-installations/${encodeURIComponent(safeId)}/revoke`,
    bearer,
  });

  if (!isRecord(data)) {
    return malformed('Device Installation revoke response is not an object.');
  }
  if (typeof data.replayed !== 'boolean') {
    return malformed('Device Installation revoke replay marker is invalid.');
  }

  return Object.freeze({
    installationId: requireUuid('installationId', data.installationId),
    revokedAt: requireTimestamp('revokedAt', data.revokedAt),
    replayed: data.replayed,
  });
}
