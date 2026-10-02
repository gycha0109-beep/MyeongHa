import {
  DeviceInstallationRegisterAuthorityPortErrorV1,
  type DeviceInstallationRegisterAuthorityPortV1,
  type DeviceInstallationRegisterAuthorityRowV1,
} from './device-installation-register-command.js';
import {
  DeviceInstallationRevokeAuthorityPortErrorV1,
  type DeviceInstallationRevokeAuthorityPortV1,
  type DeviceInstallationRevokeAuthorityRowV1,
} from './device-installation-revoke-command.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const POSTGRES_DEVICE_INSTALLATION_AUTHORITY_BINDINGS_V1 =
  Object.freeze({
    register: 'public.cmd_register_device_installation_runtime_v1',
    revoke: 'public.cmd_revoke_device_installation_runtime_v1',
  } as const);

type RegisterQueryRowV1 = Readonly<{
  installationId: unknown;
  registrationState: unknown;
  tokenChanged: unknown;
  lastSeenAt: unknown;
}>;

type RevokeQueryRowV1 = Readonly<{
  installationId: unknown;
  revokedAt: unknown;
  replayed: unknown;
}>;

const REGISTER_SQL = `
select
  installation_id::text as "installationId",
  registration_state as "registrationState",
  token_changed as "tokenChanged",
  last_seen_at::text as "lastSeenAt"
from public.cmd_register_device_installation_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::text,
  $4::text,
  $5::text,
  $6::text,
  $7::text,
  $8::text,
  $9::text
)
`.trim();

const REVOKE_SQL = `
select
  installation_id::text as "installationId",
  revoked_at::text as "revokedAt",
  replayed as "replayed"
from public.cmd_revoke_device_installation_runtime_v1(
  $1::uuid,
  $2::uuid
)
`.trim();

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

function postgresCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { code?: unknown }).code;
  return typeof value === 'string' ? value : null;
}

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Device Installation PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function mapRegisterError(error: unknown): never {
  const constraint = postgresConstraint(error);
  if (constraint === 'device_installation_registration_subject_ineligible') {
    throw new DeviceInstallationRegisterAuthorityPortErrorV1(
      'SUBJECT_INELIGIBLE',
      'Device Installation subject is ineligible.',
    );
  }
  if (constraint === 'device_installation_registration_conflict') {
    throw new DeviceInstallationRegisterAuthorityPortErrorV1(
      'REGISTRATION_CONFLICT',
      'Device Installation identity conflicts with another active binding.',
    );
  }
  if (
    constraint === 'device_installation_registration_input_invalid' ||
    postgresCode(error) === '23514'
  ) {
    throw new DeviceInstallationRegisterAuthorityPortErrorV1(
      'INVALID_INPUT',
      'Device Installation registration input is invalid.',
    );
  }
  throw error;
}

function mapRevokeError(error: unknown): never {
  const constraint = postgresConstraint(error);
  if (constraint === 'cmd_device_revoke_not_found') {
    throw new DeviceInstallationRevokeAuthorityPortErrorV1(
      'INSTALLATION_UNAVAILABLE',
      'Device Installation is unavailable.',
    );
  }
  if (
    constraint === 'cmd_device_revoke_ids_required' ||
    postgresCode(error) === '23514'
  ) {
    throw new DeviceInstallationRevokeAuthorityPortErrorV1(
      'INVALID_INPUT',
      'Device Installation revoke input is invalid.',
    );
  }
  throw error;
}

export class PostgresDeviceInstallationAuthorityPortV1
  implements
    DeviceInstallationRegisterAuthorityPortV1,
    DeviceInstallationRevokeAuthorityPortV1
{
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async registerDeviceInstallation(
    input: Parameters<
      DeviceInstallationRegisterAuthorityPortV1['registerDeviceInstallation']
    >[0],
  ): Promise<readonly DeviceInstallationRegisterAuthorityRowV1[]> {
    try {
      const result = await this.client.query<RegisterQueryRowV1>(
        REGISTER_SQL,
        [
          input.subjectId,
          input.installationId,
          input.platform,
          input.installationKey,
          input.pushTokenEncrypted,
          input.pushTokenKeyId,
          input.tokenFingerprint,
          input.appVersion,
          input.clientCapability,
        ],
      );
      return Object.freeze(
        result.rows.map((row) =>
          Object.freeze({
            installationId: requireString(
              'register installation id',
              row.installationId,
            ),
            registrationState: requireString(
              'registration state',
              row.registrationState,
            ) as DeviceInstallationRegisterAuthorityRowV1['registrationState'],
            tokenChanged: row.tokenChanged as boolean,
            lastSeenAt: requireString('last seen timestamp', row.lastSeenAt),
          }),
        ),
      );
    } catch (error) {
      return mapRegisterError(error);
    }
  }

  async revokeDeviceInstallation(
    input: Parameters<
      DeviceInstallationRevokeAuthorityPortV1['revokeDeviceInstallation']
    >[0],
  ): Promise<readonly DeviceInstallationRevokeAuthorityRowV1[]> {
    try {
      const result = await this.client.query<RevokeQueryRowV1>(
        REVOKE_SQL,
        [input.subjectId, input.installationId],
      );
      return Object.freeze(
        result.rows.map((row) =>
          Object.freeze({
            installationId: requireString(
              'revoke installation id',
              row.installationId,
            ),
            revokedAt: requireString('revoked timestamp', row.revokedAt),
            replayed: row.replayed as boolean,
          }),
        ),
      );
    } catch (error) {
      return mapRevokeError(error);
    }
  }
}
