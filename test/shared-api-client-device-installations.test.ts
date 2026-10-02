import { describe, expect, it } from 'vitest';
import {
  MyeongHaApiClientV1,
  registerDeviceInstallationV1,
  revokeDeviceInstallationV1,
} from '../packages/api-client/src/index.js';

const INSTALLATION_ID = 'd2000000-0000-4000-8000-00000000c001';

function success(data: unknown): Response {
  return Response.json({
    ok: true,
    data,
    meta: {
      apiContractVersion: 'v0.9',
      requestId: 'request-1',
      serverTime: '2026-10-02T04:00:00.000Z',
    },
  });
}

describe('shared Device Installation API client', () => {
  it('registers through the active subject bearer and never sends subjectId', async () => {
    let path = '';
    let body: Record<string, unknown> | null = null;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input, init) => {
        path = new URL(String(input)).pathname;
        body = JSON.parse(String(init?.body));
        return success({
          installationId: INSTALLATION_ID,
          registrationState: 'created',
          tokenChanged: false,
          lastSeenAt: '2026-10-02T04:00:00.000Z',
        });
      },
    });

    await registerDeviceInstallationV1(client, 'subject-bearer', {
      installationKey: 'mobile-key-a',
      platform: 'android',
      expoPushToken: 'ExpoPushToken[abcdefghijklmnopqrstuvwxyz012345]',
      appVersion: '0.1.0',
      clientCapability: 'mobile-push-registration-v1',
    });

    expect(path).toBe('/api/device-installations/register');
    expect(body).not.toHaveProperty('subjectId');
    expect(body).not.toHaveProperty('installationId');
  });

  it('revokes only the server installation id supplied by local registration state', async () => {
    let path = '';
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input) => {
        path = new URL(String(input)).pathname;
        return success({
          installationId: INSTALLATION_ID,
          revokedAt: '2026-10-02T04:01:00.000Z',
          replayed: false,
        });
      },
    });

    await revokeDeviceInstallationV1(
      client,
      'subject-bearer',
      INSTALLATION_ID,
    );
    expect(path).toBe(
      `/api/device-installations/${INSTALLATION_ID}/revoke`,
    );
  });
});
