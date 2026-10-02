import { describe, expect, it } from 'vitest';
import {
  MOBILE_PUSH_INSTALLATION_STORAGE_KEY_V1,
  createMobilePushInstallationStoreV1,
} from '../apps/mobile/src/core/push/mobile-push-installation-store.js';

describe('Mobile Push installation store', () => {
  it('creates one stable local installation key without inventing a server row id', async () => {
    const values = new Map<string, string>();
    let keyCalls = 0;
    const store = createMobilePushInstallationStoreV1({
      storage: {
        async getItemAsync(key) { return values.get(key) ?? null; },
        async setItemAsync(key, value) { values.set(key, value); },
        async deleteItemAsync(key) { values.delete(key); },
      },
      nextInstallationKey() {
        keyCalls += 1;
        return 'mobile-installation-key-stable';
      },
    });

    const first = await store.ensure();
    const second = await store.ensure();

    expect(first).toEqual({
      version: 1,
      installationKey: 'mobile-installation-key-stable',
      installationId: null,
      enabled: false,
    });
    expect(second).toEqual(first);
    expect(keyCalls).toBe(1);
    expect(values.has(MOBILE_PUSH_INSTALLATION_STORAGE_KEY_V1)).toBe(true);
  });

  it('drops malformed local state instead of treating it as authority', async () => {
    const values = new Map<string, string>([
      [MOBILE_PUSH_INSTALLATION_STORAGE_KEY_V1, '{"version":1,"installationKey":"x","installationId":"not-a-uuid","enabled":true}'],
    ]);
    const store = createMobilePushInstallationStoreV1({
      storage: {
        async getItemAsync(key) { return values.get(key) ?? null; },
        async setItemAsync(key, value) { values.set(key, value); },
        async deleteItemAsync(key) { values.delete(key); },
      },
      nextInstallationKey: () => 'mobile-installation-key-new',
    });

    await expect(store.read()).resolves.toBeNull();
    expect(values.has(MOBILE_PUSH_INSTALLATION_STORAGE_KEY_V1)).toBe(false);
  });
});
