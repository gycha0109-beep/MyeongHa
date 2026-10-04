import { describe, expect, it } from 'vitest';
import { MyeongHaApiClientV1 } from '../packages/api-client/src/index.js';
import {
  createMobilePushInstallationStoreV1,
} from '../apps/mobile/src/core/push/mobile-push-installation-store.js';
import {
  createMobilePushServiceV1,
  type MobilePushNativePortV1,
  type MobilePushPermissionV1,
} from '../apps/mobile/src/core/push/mobile-push-service.js';

const SERVER_ID = 'd2000000-0000-4000-8000-00000000d001';

function envelope(data: unknown): Response {
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

function setup(input?: {
  readonly permission?: MobilePushPermissionV1;
  readonly projectId?: string | null;
}) {
  const values = new Map<string, string>();
  const requests: Array<{ path: string; method: string; body: unknown }> = [];
  let permission = input?.permission ?? 'undetermined';
  let permissionRequests = 0;
  let tokenReads = 0;
  let channelCalls = 0;

  const client = new MyeongHaApiClientV1({
    origin: 'https://myeongha.test',
    fetchImpl: async (request, init) => {
      const url = new URL(String(request));
      const body = init?.body === undefined
        ? null
        : JSON.parse(String(init.body));
      requests.push({
        path: url.pathname,
        method: init?.method ?? 'GET',
        body,
      });
      if (url.pathname.endsWith('/revoke')) {
        return envelope({
          installationId: SERVER_ID,
          revokedAt: '2026-10-02T04:02:00.000Z',
          replayed: false,
        });
      }
      return envelope({
        installationId: SERVER_ID,
        registrationState: 'created',
        tokenChanged: false,
        lastSeenAt: '2026-10-02T04:01:00.000Z',
      });
    },
  });

  const store = createMobilePushInstallationStoreV1({
    storage: {
      async getItemAsync(key) { return values.get(key) ?? null; },
      async setItemAsync(key, value) { values.set(key, value); },
      async deleteItemAsync(key) { values.delete(key); },
    },
    nextInstallationKey: () => 'mobile-installation-key-a',
  });

  const native: MobilePushNativePortV1 = {
    platform: () => 'android',
    projectId: () => input?.projectId === undefined ? 'eas-project-id' : input.projectId,
    appVersion: () => '0.1.0',
    async ensureAndroidChannel() { channelCalls += 1; },
    async getPermission() { return permission; },
    async requestPermission() {
      permissionRequests += 1;
      if (permission === 'undetermined') permission = 'granted';
      return permission;
    },
    async getExpoPushToken() {
      tokenReads += 1;
      return 'ExpoPushToken[abcdefghijklmnopqrstuvwxyz012345]';
    },
    onNativePushTokenChanged() { return () => undefined; },
  };

  const service = createMobilePushServiceV1({
    client,
    subjectSession: {
      withActiveBearer(operation) {
        return operation('subject-bearer');
      },
    },
    store,
    native,
  });

  return {
    service,
    store,
    requests,
    counters: () => ({ permissionRequests, tokenReads, channelCalls }),
  };
}

describe('Mobile Push service', () => {
  it('prompts only on explicit enable and persists the server installation id', async () => {
    const ctx = setup();
    await expect(ctx.service.enable()).resolves.toEqual({
      kind: 'enabled',
      installationId: SERVER_ID,
    });

    expect(ctx.counters().permissionRequests).toBe(1);
    expect(ctx.counters().tokenReads).toBe(1);
    expect(ctx.requests).toHaveLength(1);
    expect(ctx.requests[0]?.path).toBe('/api/device-installations/register');
    await expect(ctx.store.read()).resolves.toMatchObject({
      enabled: true,
      installationId: SERVER_ID,
      installationKey: 'mobile-installation-key-a',
    });
  });

  it('startup sync does not ask for permission and refreshes an enabled binding', async () => {
    const ctx = setup({ permission: 'granted' });
    const state = await ctx.store.ensure();
    await ctx.store.write({ ...state, enabled: true, installationId: SERVER_ID });

    await expect(ctx.service.syncEnabledNoPrompt()).resolves.toEqual({
      kind: 'enabled',
      installationId: SERVER_ID,
    });
    expect(ctx.counters().permissionRequests).toBe(0);
    expect(ctx.counters().tokenReads).toBe(1);
  });

  it('revokes before subject change while preserving the local enabled preference', async () => {
    const ctx = setup({ permission: 'granted' });
    const state = await ctx.store.ensure();
    await ctx.store.write({ ...state, enabled: true, installationId: SERVER_ID });

    await ctx.service.prepareForSubjectChange();

    expect(ctx.requests.at(-1)?.path).toBe(
      `/api/device-installations/${SERVER_ID}/revoke`,
    );
    await expect(ctx.store.read()).resolves.toMatchObject({
      enabled: true,
      installationId: null,
    });
  });

  it('does not contact the server when permission is denied on explicit enable', async () => {
    const ctx = setup({ permission: 'denied' });
    await expect(ctx.service.enable()).resolves.toEqual({
      kind: 'permission_denied',
      installationId: null,
    });
    expect(ctx.requests).toHaveLength(0);
    expect(ctx.counters().permissionRequests).toBe(1);
  });

  it('does not prompt or fetch a token when EAS project identity is unavailable', async () => {
    const ctx = setup({ projectId: null });
    await expect(ctx.service.enable()).resolves.toEqual({
      kind: 'unavailable',
      installationId: null,
    });
    expect(ctx.counters()).toEqual({
      permissionRequests: 0,
      tokenReads: 0,
      channelCalls: 0,
    });
    expect(ctx.requests).toHaveLength(0);
  });
});
