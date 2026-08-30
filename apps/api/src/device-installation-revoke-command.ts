import { ApiCommandError } from './chat-receive.js';

export const DEVICE_INSTALLATION_REVOKE_COMMAND_AUTHORITY_BINDING_V1 =
  'public.cmd_revoke_device_installation_v1' as const;

type Awaitable<T> = T | Promise<T>;

export interface DeviceInstallationRevokeAuthorityRowV1 {
  readonly installationId: string;
  readonly revokedAt: string;
  readonly replayed: boolean;
}

export type DeviceInstallationRevokeAuthorityFailureCodeV1 =
  | 'INSTALLATION_UNAVAILABLE'
  | 'SUBJECT_INELIGIBLE'
  | 'INVALID_INPUT';

export class DeviceInstallationRevokeAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: DeviceInstallationRevokeAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'DeviceInstallationRevokeAuthorityPortErrorV1';
  }
}

/**
 * Owner-scoped standalone Device Installation revoke authority.
 *
 * The verified command only terminalizes the installation by setting revoked_at. It preserves
 * encrypted token material, token fingerprint/key provenance, historical notification deliveries,
 * and provider-attempt provenance. Active canonical guests are not excluded by this boundary.
 * Registration/rebind semantics remain outside this command and SRC-19 remains open.
 *
 * P0-AUTH-01 remains open, so this API slice exposes a port without selecting a production
 * PostgreSQL execution identity or adapter.
 */
export interface DeviceInstallationRevokeAuthorityPortV1 {
  revokeDeviceInstallation(input: {
    readonly subjectId: string;
    readonly installationId: string;
  }): Awaitable<readonly DeviceInstallationRevokeAuthorityRowV1[]>;
}

export interface RevokeDeviceInstallationInputV1 {
  readonly resolvedSubjectId?: string;
  readonly installationId: unknown;
  readonly authorityPort: DeviceInstallationRevokeAuthorityPortV1;
}

export interface RevokeDeviceInstallationResponseV1 {
  readonly installationId: string;
  readonly revokedAt: string;
  readonly replayed: boolean;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireInstallationId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'installationId must be a non-empty string.',
    );
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof DeviceInstallationRevokeAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'INSTALLATION_UNAVAILABLE':
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Device Installation is unavailable for the current subject.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', 'Device Installation revoke input is invalid.');
  }
}

function requireTimestamp(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
    || Number.isNaN(Date.parse(value))
  ) {
    throw new Error('Device Installation revoke authority returned an invalid revokedAt timestamp.');
  }
  return value;
}

function assembleResponse(
  row: DeviceInstallationRevokeAuthorityRowV1,
  requestedInstallationId: string,
): RevokeDeviceInstallationResponseV1 {
  if (row.installationId !== requestedInstallationId) {
    throw new Error('Device Installation revoke authority returned a different installation identity.');
  }
  const revokedAt = requireTimestamp(row.revokedAt);
  if (typeof row.replayed !== 'boolean') {
    throw new Error('Device Installation revoke authority returned an invalid replay marker.');
  }

  return Object.freeze({
    installationId: row.installationId,
    revokedAt,
    replayed: row.replayed,
  });
}

export async function revokeDeviceInstallation(
  input: RevokeDeviceInstallationInputV1,
): Promise<RevokeDeviceInstallationResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const installationId = requireInstallationId(input.installationId);

  try {
    const rows = await input.authorityPort.revokeDeviceInstallation({
      subjectId,
      installationId,
    });
    if (rows.length !== 1) {
      throw new Error('Device Installation revoke authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error(
        'Device Installation revoke authority returned an impossible empty successful row.',
      );
    }
    return assembleResponse(row, installationId);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
