import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import {
  DEVICE_INSTALLATION_CLIENT_CAPABILITY_V1,
  DeviceInstallationRegisterAuthorityPortErrorV1,
  registerDeviceInstallation,
  type DeviceInstallationRegisterAuthorityPortV1,
  type DeviceInstallationRegisterAuthorityRowV1,
} from '../apps/api/src/device-installation-register-command.js';

const SUBJECT_ID = 'd1000000-0000-4000-8000-00000000a001';
const INSTALLATION_ID = 'd2000000-0000-4000-8000-00000000a001';
const RAW_TOKEN = 'ExpoPushToken[abcdefghijklmnopqrstuvwxyz012345]';
const LAST_SEEN = '2026-10-02T04:00:00.000Z';

class FakeAuthority implements DeviceInstallationRegisterAuthorityPortV1 {
  calls: unknown[] = [];
  result: readonly DeviceInstallationRegisterAuthorityRowV1[] | Error = [{
    installationId: INSTALLATION_ID,
    registrationState: 'created',
    tokenChanged: false,
    lastSeenAt: LAST_SEEN,
  }];

  registerDeviceInstallation(input: Parameters<DeviceInstallationRegisterAuthorityPortV1['registerDeviceInstallation']>[0]) {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

function validRequest() {
  return {
    installationKey: 'mobile-installation-key-a',
    platform: 'android',
    expoPushToken: RAW_TOKEN,
    appVersion: '0.1.0',
    clientCapability: DEVICE_INSTALLATION_CLIENT_CAPABILITY_V1,
  } as const;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
  }
}

describe('Device Installation registration command', () => {
  it('protects the raw Expo token before authority and never forwards subject/id from client', async () => {
    const authority = new FakeAuthority();
    const result = await registerDeviceInstallation({
      resolvedSubjectId: SUBJECT_ID,
      request: validRequest(),
      idPort: { nextInstallationId: () => INSTALLATION_ID },
      tokenProtectionPort: {
        protectExpoPushToken(token) {
          expect(token).toBe(RAW_TOKEN);
          return {
            encryptedToken: 'aes-256-gcm:k1:iv:cipher:tag',
            keyId: 'k1',
            fingerprint: 'hmac-sha256:k1:' + 'a'.repeat(64),
          };
        },
      },
      authorityPort: authority,
    });

    expect(result).toEqual({
      installationId: INSTALLATION_ID,
      registrationState: 'created',
      tokenChanged: false,
      lastSeenAt: LAST_SEEN,
    });
    expect(JSON.stringify(authority.calls)).not.toContain(RAW_TOKEN);
  });

  it('rejects extra fields and malformed Expo tokens before authority', async () => {
    const authority = new FakeAuthority();
    await expectCode(registerDeviceInstallation({
      resolvedSubjectId: SUBJECT_ID,
      request: { ...validRequest(), subjectId: SUBJECT_ID },
      idPort: { nextInstallationId: () => INSTALLATION_ID },
      tokenProtectionPort: { protectExpoPushToken() { throw new Error('must not run'); } },
      authorityPort: authority,
    }), 'INVALID_REQUEST');

    await expectCode(registerDeviceInstallation({
      resolvedSubjectId: SUBJECT_ID,
      request: { ...validRequest(), expoPushToken: 'raw-secret' },
      idPort: { nextInstallationId: () => INSTALLATION_ID },
      tokenProtectionPort: { protectExpoPushToken() { throw new Error('must not run'); } },
      authorityPort: authority,
    }), 'INVALID_REQUEST');

    expect(authority.calls).toHaveLength(0);
  });

  it('maps active identity conflicts without leaking database ownership detail', async () => {
    const authority = new FakeAuthority();
    authority.result = new DeviceInstallationRegisterAuthorityPortErrorV1(
      'REGISTRATION_CONFLICT',
      'other subject detail',
    );

    await expectCode(registerDeviceInstallation({
      resolvedSubjectId: SUBJECT_ID,
      request: validRequest(),
      idPort: { nextInstallationId: () => INSTALLATION_ID },
      tokenProtectionPort: {
        protectExpoPushToken() {
          return {
            encryptedToken: 'aes-256-gcm:k1:iv:cipher:tag',
            keyId: 'k1',
            fingerprint: 'hmac-sha256:k1:' + 'a'.repeat(64),
          };
        },
      },
      authorityPort: authority,
    }), 'IDEMPOTENCY_CONFLICT');
  });
});
