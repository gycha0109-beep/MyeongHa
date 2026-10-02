import {
  MOBILE_PUSH_CLIENT_CAPABILITY_V1,
  registerDeviceInstallationV1,
  revokeDeviceInstallationV1,
  type DeviceInstallationPlatformV1,
  type MyeongHaApiClientV1,
} from '@myeongha/api-client';

import type {
  MobilePushInstallationStateV1,
  MobilePushInstallationStoreV1,
} from '@/core/push/mobile-push-installation-store';
import type { MobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';

export type MobilePushPermissionV1 =
  | 'granted'
  | 'denied'
  | 'undetermined';

export type MobilePushStatusKindV1 =
  | 'disabled'
  | 'enabled'
  | 'needs_sync'
  | 'permission_denied'
  | 'unavailable';

export interface MobilePushStatusV1 {
  readonly kind: MobilePushStatusKindV1;
  readonly installationId: string | null;
}

export interface MobilePushNativePortV1 {
  platform(): DeviceInstallationPlatformV1 | null;
  projectId(): string | null;
  appVersion(): string | null;
  ensureAndroidChannel(): Promise<void>;
  getPermission(): Promise<MobilePushPermissionV1>;
  requestPermission(): Promise<MobilePushPermissionV1>;
  getExpoPushToken(projectId: string): Promise<string>;
  onNativePushTokenChanged(listener: () => void): () => void;
}

export interface MobilePushServiceV1 {
  readStatus(): Promise<MobilePushStatusV1>;
  enable(): Promise<MobilePushStatusV1>;
  disable(): Promise<MobilePushStatusV1>;
  syncEnabledNoPrompt(): Promise<MobilePushStatusV1>;
  prepareForSubjectChange(): Promise<void>;
  startTokenRotationWatch(): () => void;
}

function status(
  kind: MobilePushStatusKindV1,
  installationId: string | null,
): MobilePushStatusV1 {
  return Object.freeze({ kind, installationId });
}

function availableMetadata(native: MobilePushNativePortV1): Readonly<{
  platform: DeviceInstallationPlatformV1;
  projectId: string;
  appVersion: string;
}> | null {
  const platform = native.platform();
  const projectId = native.projectId();
  const appVersion = native.appVersion();
  if (
    platform === null ||
    projectId === null ||
    projectId.trim().length === 0 ||
    appVersion === null ||
    appVersion.trim().length === 0
  ) {
    return null;
  }
  return Object.freeze({
    platform,
    projectId: projectId.trim(),
    appVersion: appVersion.trim(),
  });
}

export function createMobilePushServiceV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly subjectSession: Pick<
    MobileSubjectSessionCoordinatorV1,
    'withActiveBearer'
  >;
  readonly store: MobilePushInstallationStoreV1;
  readonly native: MobilePushNativePortV1;
}): MobilePushServiceV1 {
  let operationTail: Promise<void> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const run = operationTail.then(operation, operation);
    operationTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function register(
    current: MobilePushInstallationStateV1,
  ): Promise<MobilePushStatusV1> {
    const metadata = availableMetadata(input.native);
    if (metadata === null) {
      return status('unavailable', current.installationId);
    }

    await input.native.ensureAndroidChannel();
    const token = await input.native.getExpoPushToken(metadata.projectId);
    const response = await input.subjectSession.withActiveBearer((bearer) =>
      registerDeviceInstallationV1(input.client, bearer, {
        installationKey: current.installationKey,
        platform: metadata.platform,
        expoPushToken: token,
        appVersion: metadata.appVersion,
        clientCapability: MOBILE_PUSH_CLIENT_CAPABILITY_V1,
      }),
    );
    await input.store.write({
      ...current,
      enabled: true,
      installationId: response.installationId,
    });
    return status('enabled', response.installationId);
  }

  async function revokeKnown(
    current: MobilePushInstallationStateV1,
  ): Promise<void> {
    if (current.installationId === null) return;
    await input.subjectSession.withActiveBearer((bearer) =>
      revokeDeviceInstallationV1(
        input.client,
        bearer,
        current.installationId as string,
      ),
    );
  }

  async function syncInternal(): Promise<MobilePushStatusV1> {
    const current = await input.store.read();
    if (current === null || !current.enabled) {
      return status('disabled', current?.installationId ?? null);
    }
    if (availableMetadata(input.native) === null) {
      return status('unavailable', current.installationId);
    }

    const permission = await input.native.getPermission();
    if (permission !== 'granted') {
      await revokeKnown(current);
      await input.store.write({
        ...current,
        enabled: false,
        installationId: null,
      });
      return status('permission_denied', null);
    }

    return register(current);
  }

  return Object.freeze({
    async readStatus() {
      const current = await input.store.read();
      if (current === null || !current.enabled) {
        return status('disabled', current?.installationId ?? null);
      }
      if (availableMetadata(input.native) === null) {
        return status('unavailable', current.installationId);
      }
      const permission = await input.native.getPermission();
      if (permission !== 'granted') {
        return status('permission_denied', current.installationId);
      }
      return current.installationId === null
        ? status('needs_sync', null)
        : status('enabled', current.installationId);
    },

    enable() {
      return serialize(async () => {
        const current = await input.store.ensure();
        if (availableMetadata(input.native) === null) {
          return status('unavailable', current.installationId);
        }
        await input.native.ensureAndroidChannel();
        const permission = await input.native.requestPermission();
        if (permission !== 'granted') {
          await input.store.write({
            ...current,
            enabled: false,
            installationId: null,
          });
          return status('permission_denied', null);
        }
        const enabled = await input.store.write({
          ...current,
          enabled: true,
        });
        return register(enabled);
      });
    },

    disable() {
      return serialize(async () => {
        const current = await input.store.read();
        if (current === null) return status('disabled', null);
        await revokeKnown(current);
        await input.store.write({
          ...current,
          enabled: false,
          installationId: null,
        });
        return status('disabled', null);
      });
    },

    syncEnabledNoPrompt() {
      return serialize(syncInternal);
    },

    prepareForSubjectChange() {
      return serialize(async () => {
        const current = await input.store.read();
        if (current === null) return;
        await revokeKnown(current);
        await input.store.write({
          ...current,
          installationId: null,
        });
      });
    },

    startTokenRotationWatch() {
      return input.native.onNativePushTokenChanged(() => {
        void serialize(syncInternal).catch(() => undefined);
      });
    },
  });
}
