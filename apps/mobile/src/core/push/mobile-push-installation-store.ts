export const MOBILE_PUSH_INSTALLATION_STORAGE_KEY_V1 =
  'myeongha.mobile.installation.v1' as const;

export interface MobilePushInstallationStateV1 {
  readonly version: 1;
  readonly installationKey: string;
  readonly installationId: string | null;
  readonly enabled: boolean;
}

export interface MobilePushInstallationStoragePortV1 {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface MobilePushInstallationStoreV1 {
  read(): Promise<MobilePushInstallationStateV1 | null>;
  ensure(): Promise<MobilePushInstallationStateV1>;
  write(
    state: MobilePushInstallationStateV1,
  ): Promise<MobilePushInstallationStateV1>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isValidInstallationKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 8 &&
    value.length <= 128 &&
    !/[\u0000-\u001f\u007f\s]/u.test(value)
  );
}

function parseState(value: string): MobilePushInstallationStateV1 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (
    record.version !== 1 ||
    !isValidInstallationKey(record.installationKey) ||
    typeof record.enabled !== 'boolean' ||
    (record.installationId !== null &&
      (typeof record.installationId !== 'string' ||
        !UUID_PATTERN.test(record.installationId)))
  ) {
    return null;
  }
  return Object.freeze({
    version: 1,
    installationKey: record.installationKey,
    installationId: record.installationId as string | null,
    enabled: record.enabled,
  });
}

function assertState(
  state: MobilePushInstallationStateV1,
): MobilePushInstallationStateV1 {
  if (
    state.version !== 1 ||
    !isValidInstallationKey(state.installationKey) ||
    (state.installationId !== null && !UUID_PATTERN.test(state.installationId))
  ) {
    throw new Error('Mobile Push installation state is malformed.');
  }
  return Object.freeze({ ...state });
}

export function createMobilePushInstallationStoreV1(input: {
  readonly storage: MobilePushInstallationStoragePortV1;
  readonly nextInstallationKey: () => string;
}): MobilePushInstallationStoreV1 {
  return Object.freeze({
    async read() {
      const raw = await input.storage.getItemAsync(
        MOBILE_PUSH_INSTALLATION_STORAGE_KEY_V1,
      );
      if (raw === null) return null;
      const parsed = parseState(raw);
      if (parsed !== null) return parsed;
      await input.storage.deleteItemAsync(
        MOBILE_PUSH_INSTALLATION_STORAGE_KEY_V1,
      );
      return null;
    },

    async ensure() {
      const current = await this.read();
      if (current !== null) return current;
      const state = assertState({
        version: 1,
        installationKey: input.nextInstallationKey(),
        installationId: null,
        enabled: false,
      });
      await input.storage.setItemAsync(
        MOBILE_PUSH_INSTALLATION_STORAGE_KEY_V1,
        JSON.stringify(state),
      );
      return state;
    },

    async write(state) {
      const safe = assertState(state);
      await input.storage.setItemAsync(
        MOBILE_PUSH_INSTALLATION_STORAGE_KEY_V1,
        JSON.stringify(safe),
      );
      return safe;
    },
  });
}
