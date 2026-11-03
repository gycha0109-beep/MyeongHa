import {
  createOfficialReaderNodeOffPrimaryStoreV1,
  type OfficialReaderOffPrimaryStoreConfigV1,
} from './official-reader-node-offprimary-privacy-store-v1.js';
import {
  createOfficialReaderNodeOffPrimaryPrivacyReadPortV1,
} from './official-reader-node-offprimary-privacy-read-v1.js';
import type {
  OfficialReaderPrivatePrivacyLedgerPortV1,
} from './official-reader-private-privacy-ledger-v1.js';
import type {
  PrivateOfficialReaderPaidAnswerKeyResolverV1,
} from './official-reader-private-paid-answer-reread-v1.js';
import {
  parseOfficialReaderOffPrimaryWorkerConfigV1,
} from './official-reader-offprimary-worker-config-v1.js';

/**
 * The private S6 read dependency group. This factory only constructs
 * internally scoped, independently sourced authority; it NEVER flips the
 * public paid-read route from its current hardcoded OFF status.
 */
export interface OfficialReaderPrivatePaidReadPortsV1 {
  readonly keyResolver: PrivateOfficialReaderPaidAnswerKeyResolverV1;
  readonly privacyLedgerPort: OfficialReaderPrivatePrivacyLedgerPortV1;
}

export interface OfficialReaderPrivatePaidReadConfigV1 {
  readonly offPrimary: OfficialReaderOffPrimaryStoreConfigV1;
  readonly recoverySignerPublicKeyPem: string;
  readonly expectedRestoreEpoch: string;
}

export class OfficialReaderPrivatePaidReadConfigErrorV1 extends Error {
  constructor() {
    super('Official Reader independent recovery authority is unavailable.');
    this.name = 'OfficialReaderPrivatePaidReadConfigErrorV1';
  }
}

function unavailable(): never {
  throw new OfficialReaderPrivatePaidReadConfigErrorV1();
}

export function parseOfficialReaderPrivatePaidReadConfigV1(
  env: Readonly<Record<string, string | undefined>>,
): OfficialReaderPrivatePaidReadConfigV1 | null {
  const offPrimary = parseOfficialReaderOffPrimaryWorkerConfigV1(env);
  const signer = env.MYEONGHA_READER_PRIVACY_RECOVERY_PUBLIC_KEY_PEM;
  const epoch = env.MYEONGHA_READER_PRIVACY_EXPECTED_RESTORE_EPOCH;
  if (offPrimary === null && signer === undefined && epoch === undefined) {
    return null;
  }
  if (!offPrimary || typeof signer !== 'string'
      || !signer.includes('BEGIN PUBLIC KEY')
      || typeof epoch !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(epoch)) {
    return unavailable();
  }
  return Object.freeze({
    offPrimary,
    recoverySignerPublicKeyPem: signer,
    expectedRestoreEpoch: epoch.toLowerCase(),
  });
}

export function createOfficialReaderPrivatePaidReadPortsV1(
  config: OfficialReaderPrivatePaidReadConfigV1,
): OfficialReaderPrivatePaidReadPortsV1 {
  if (!config?.offPrimary || !config.recoverySignerPublicKeyPem
      || !config.expectedRestoreEpoch) return unavailable();

  const offPrimary = createOfficialReaderNodeOffPrimaryStoreV1(
    config.offPrimary,
  );
  return Object.freeze({
    keyResolver: offPrimary.keys,
    privacyLedgerPort: createOfficialReaderNodeOffPrimaryPrivacyReadPortV1({
      ledgerRoot: config.offPrimary.ledgerRoot,
      ledgerSealKey: config.offPrimary.ledgerSealKey,
      recoverySignerPublicKeyPem: config.recoverySignerPublicKeyPem,
      expectedRestoreEpoch: config.expectedRestoreEpoch,
    }),
  });
}
