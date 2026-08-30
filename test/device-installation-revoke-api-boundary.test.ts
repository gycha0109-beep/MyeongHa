import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/chat-receive.js';
import {
  DEVICE_INSTALLATION_REVOKE_COMMAND_AUTHORITY_BINDING_V1,
  DeviceInstallationRevokeAuthorityPortErrorV1,
  revokeDeviceInstallation,
  type DeviceInstallationRevokeAuthorityPortV1,
  type DeviceInstallationRevokeAuthorityRowV1,
} from '../apps/api/src/device-installation-revoke-command.js';

const SUBJECT_ID = '91000000-0000-0000-0000-00000000b130';
const INSTALLATION_ID = '92000000-0000-0000-0000-00000000b130';
const REVOKED_AT = '2026-08-30T08:30:00.000Z';

type AuthorityCall = Parameters<DeviceInstallationRevokeAuthorityPortV1['revokeDeviceInstallation']>[0];

class FakeAuthorityPortV1 implements DeviceInstallationRevokeAuthorityPortV1 {
  readonly calls: AuthorityCall[] = [];
  result: readonly DeviceInstallationRevokeAuthorityRowV1[] | Error | undefined;

  revokeDeviceInstallation(input: AuthorityCall): readonly DeviceInstallationRevokeAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    if (this.result !== undefined) return this.result;
    return [{ installationId: input.installationId, revokedAt: REVOKED_AT, replayed: false }];
  }
}

async function expectApiCode(promise: Promise<unknown>, code: string): Promise<ApiCommandError> {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
    return error as ApiCommandError;
  }
}

describe('B130 Device Installation revoke API boundary', () => {
  it('binds only to the verified standalone revoke authority', () => {
    expect(DEVICE_INSTALLATION_REVOKE_COMMAND_AUTHORITY_BINDING_V1).toBe(
      'public.cmd_revoke_device_installation_v1',
    );
  });

  it('passes only trusted subject ownership plus path installation identity and returns bounded revoke state', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    const result = await revokeDeviceInstallation({
      resolvedSubjectId: SUBJECT_ID,
      installationId: INSTALLATION_ID,
      authorityPort,
    });

    expect(authorityPort.calls).toEqual([{ subjectId: SUBJECT_ID, installationId: INSTALLATION_ID }]);
    expect(result).toEqual({ installationId: INSTALLATION_ID, revokedAt: REVOKED_AT, replayed: false });
    expect(result).not.toHaveProperty('pushTokenEncrypted');
    expect(result).not.toHaveProperty('pushTokenKeyId');
    expect(result).not.toHaveProperty('tokenFingerprint');
    expect(result).not.toHaveProperty('notificationDeliveries');
    expect(result).not.toHaveProperty('provider');
  });

  it('preserves authoritative replay state instead of fabricating a new revoke timestamp', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    authorityPort.result = [{
      installationId: INSTALLATION_ID,
      revokedAt: '2026-08-29T01:02:03.000Z',
      replayed: true,
    }];

    await expect(revokeDeviceInstallation({
      resolvedSubjectId: SUBJECT_ID,
      installationId: INSTALLATION_ID,
      authorityPort,
    })).resolves.toEqual({
      installationId: INSTALLATION_ID,
      revokedAt: '2026-08-29T01:02:03.000Z',
      replayed: true,
    });
  });

  it('does not invent a member-only restriction; active canonical guest ownership can reach authority', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    const guestSubjectId = '93000000-0000-0000-0000-00000000b130';

    await revokeDeviceInstallation({
      resolvedSubjectId: guestSubjectId,
      installationId: INSTALLATION_ID,
      authorityPort,
    });

    expect(authorityPort.calls).toEqual([{ subjectId: guestSubjectId, installationId: INSTALLATION_ID }]);
  });

  it('rejects missing trusted subject or blank installation id before authority runs', async () => {
    const p1 = new FakeAuthorityPortV1();
    await expectApiCode(revokeDeviceInstallation({
      installationId: INSTALLATION_ID,
      authorityPort: p1,
    }), 'AUTH_REQUIRED');
    expect(p1.calls).toHaveLength(0);

    const p2 = new FakeAuthorityPortV1();
    await expectApiCode(revokeDeviceInstallation({
      resolvedSubjectId: SUBJECT_ID,
      installationId: '   ',
      authorityPort: p2,
    }), 'INVALID_REQUEST');
    expect(p2.calls).toHaveLength(0);
  });

  it('maps cross-owner/unknown installation and ineligible subject to the same bounded NOT_FOUND shape', async () => {
    for (const code of ['INSTALLATION_UNAVAILABLE', 'SUBJECT_INELIGIBLE'] as const) {
      const authorityPort = new FakeAuthorityPortV1();
      authorityPort.result = new DeviceInstallationRevokeAuthorityPortErrorV1(
        code,
        `raw ${code} database detail`,
      );
      const error = await expectApiCode(revokeDeviceInstallation({
        resolvedSubjectId: SUBJECT_ID,
        installationId: INSTALLATION_ID,
        authorityPort,
      }), 'NOT_FOUND');
      expect(error.message).toBe('Device Installation is unavailable for the current subject.');
      expect(error.message).not.toContain('database detail');
    }
  });

  it('bounds invalid-input authority failures without leaking database detail', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    authorityPort.result = new DeviceInstallationRevokeAuthorityPortErrorV1(
      'INVALID_INPUT',
      'constraint cmd_device_installation_revoke_ids_required',
    );
    const error = await expectApiCode(revokeDeviceInstallation({
      resolvedSubjectId: SUBJECT_ID,
      installationId: INSTALLATION_ID,
      authorityPort,
    }), 'INVALID_REQUEST');
    expect(error.message).toBe('Device Installation revoke input is invalid.');
    expect(error.message).not.toContain('constraint');
  });

  it('fails closed on non-single-row or malformed authority success', async () => {
    const cases: readonly (readonly DeviceInstallationRevokeAuthorityRowV1[])[] = [
      [],
      [
        { installationId: INSTALLATION_ID, revokedAt: REVOKED_AT, replayed: false },
        { installationId: INSTALLATION_ID, revokedAt: REVOKED_AT, replayed: true },
      ],
      [{ installationId: 'other', revokedAt: REVOKED_AT, replayed: false }],
      [{ installationId: INSTALLATION_ID, revokedAt: 'not-a-time', replayed: false }],
      [{ installationId: INSTALLATION_ID, revokedAt: REVOKED_AT, replayed: null as never }],
    ];

    for (const rows of cases) {
      const authorityPort = new FakeAuthorityPortV1();
      authorityPort.result = rows;
      await expect(revokeDeviceInstallation({
        resolvedSubjectId: SUBJECT_ID,
        installationId: INSTALLATION_ID,
        authorityPort,
      })).rejects.toThrow();
    }
  });

  it('preserves infrastructure failures unchanged', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    const infra = new Error('database unavailable');
    authorityPort.result = infra;

    await expect(revokeDeviceInstallation({
      resolvedSubjectId: SUBJECT_ID,
      installationId: INSTALLATION_ID,
      authorityPort,
    })).rejects.toBe(infra);
  });
});
