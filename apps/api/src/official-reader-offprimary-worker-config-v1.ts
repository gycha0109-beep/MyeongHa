import type {
  OfficialReaderOffPrimaryStoreConfigV1,
} from './official-reader-node-offprimary-privacy-store-v1.js';

/**
 * Existing dedicated account-deletion Worker process only.
 * No Vercel/browser configuration or default temp paths.
 * Root paths must already be mounted by the Operator outside the PostgreSQL
 * backup boundary; this parser does not provision or endorse any vendor.
 */
export const OFFICIAL_READER_OFFPRIMARY_WORKER_ENV_V1 = Object.freeze({
  ledgerRoot: 'MYEONGHA_READER_PRIVACY_LEDGER_ROOT',
  keyRoot: 'MYEONGHA_READER_PRIVACY_KEY_ROOT',
  ledgerSealKey: 'MYEONGHA_READER_PRIVACY_LEDGER_SEAL_KEY_B64',
  keySealKey: 'MYEONGHA_READER_PRIVACY_KEY_SEAL_KEY_B64',
} as const);

export class OfficialReaderOffPrimaryConfigErrorV1 extends Error {
  constructor() {
    super('Protected Reader off-primary Worker configuration is unavailable.');
    this.name = 'OfficialReaderOffPrimaryConfigErrorV1';
  }
}

function unavailable(): never {
  throw new OfficialReaderOffPrimaryConfigErrorV1();
}

function decodeStrict32(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) return unavailable();
  const result = Buffer.from(value, 'base64url');
  if (result.length !== 32 || result.toString('base64url') !== value) {
    result.fill(0);
    return unavailable();
  }
  try {
    return Uint8Array.from(result);
  } finally {
    result.fill(0);
  }
}

export function parseOfficialReaderOffPrimaryWorkerConfigV1(
  env: Readonly<Record<string, string | undefined>>,
): OfficialReaderOffPrimaryStoreConfigV1 | null {
  const keys = Object.values(OFFICIAL_READER_OFFPRIMARY_WORKER_ENV_V1);
  const present = keys.filter((name) => env[name] !== undefined);
  if (present.length === 0) return null;
  if (present.length !== keys.length) return unavailable();

  const ledgerRoot = env[OFFICIAL_READER_OFFPRIMARY_WORKER_ENV_V1.ledgerRoot];
  const keyRoot = env[OFFICIAL_READER_OFFPRIMARY_WORKER_ENV_V1.keyRoot];
  const rawLedgerKey = env[OFFICIAL_READER_OFFPRIMARY_WORKER_ENV_V1.ledgerSealKey];
  const rawKeyKey = env[OFFICIAL_READER_OFFPRIMARY_WORKER_ENV_V1.keySealKey];
  if (!ledgerRoot || !keyRoot || !rawLedgerKey || !rawKeyKey
      || ledgerRoot.trim() !== ledgerRoot || keyRoot.trim() !== keyRoot
      || ledgerRoot === keyRoot || rawLedgerKey === rawKeyKey) {
    return unavailable();
  }

  return Object.freeze({
    ledgerRoot, keyRoot,
    ledgerSealKey: decodeStrict32(rawLedgerKey),
    keySealKey: decodeStrict32(rawKeyKey),
  });
}
