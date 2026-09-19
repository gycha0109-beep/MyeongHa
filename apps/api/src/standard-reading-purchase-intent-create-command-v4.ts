import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import { ApiCommandError } from './api-error.js';
import {
  PurchaseIntentCreateAuthorityPortErrorV3,
  createPurchaseIntentV3,
  type PurchaseIntentCapabilitySnapshotPortV3,
  type PurchaseIntentCapabilitySnapshotV3,
  type PurchaseIntentCreateAuthorityPortV3,
  type PurchaseIntentCreateAuthorityRowV3,
} from './purchase-intent-create-command-v3.js';
import type {
  PurchaseIntentIdPortV1,
  PurchaseIntentOfferSnapshotPortV1,
  PurchaseIntentOfferSnapshotV1,
  PurchaseIntentStatusV1,
} from './purchase-intent-create-command.js';

export const STANDARD_READING_PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V4 =
  'public.cmd_create_standard_reading_purchase_intent_v4' as const;
export const STANDARD_READING_READER_SELECTION_CONTRACT_V1 =
  'standard-reading-reader-selection-v1' as const;

type Awaitable<T> = T | Promise<T>;

export interface StandardReadingPurchaseIntentRequestV4 {
  readonly productOfferId: string;
  readonly idempotencyKey: string;
  readonly readerCharacterId: string;
}

export interface StandardReadingReaderSelectionResolutionV4 {
  readonly productId: string;
  readonly topicKey: string;
  readonly specVersion: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
}

export interface StandardReadingReaderSelectionPortV4 {
  /**
   * Resolve only server-owned, already-authoritative Reader access state.
   * Implementations must not infer or mutate Character unlock conditions.
   */
  resolveEligibleReaderSelection(input: {
    readonly subjectId: string;
    readonly productId: string;
    readonly readerCharacterId: string;
  }): Awaitable<StandardReadingReaderSelectionResolutionV4 | null>;
}

export interface StandardReadingPurchaseIntentAuthorityRowV4
extends PurchaseIntentCreateAuthorityRowV3 {
  readonly readerCharacterId: unknown;
  readonly readerContentBundleId: unknown;
  readonly readerSelectionSnapshotJsonb: unknown;
  readonly readerSelectionHash: unknown;
}

export type StandardReadingPurchaseIntentAuthorityFailureCodeV4 =
  | ConstructorParameters<typeof PurchaseIntentCreateAuthorityPortErrorV3>[0]
  | 'READER_UNAVAILABLE'
  | 'READER_PROVENANCE_CONFLICT';

export class StandardReadingPurchaseIntentAuthorityPortErrorV4 extends Error {
  constructor(
    readonly code: StandardReadingPurchaseIntentAuthorityFailureCodeV4,
    message: string,
  ) {
    super(message);
    this.name = 'StandardReadingPurchaseIntentAuthorityPortErrorV4';
  }
}

export interface StandardReadingPurchaseIntentAuthorityPortV4 {
  createPurchaseIntent(input: {
    readonly subjectId: string;
    readonly purchaseIntentId: string;
    readonly productOfferId: string;
    readonly providerAccountLinkId: null;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly offerSnapshotJsonb: PurchaseIntentOfferSnapshotV1;
    readonly offerSnapshotHash: string;
    readonly capabilitySnapshotJsonb: PurchaseIntentCapabilitySnapshotV3;
    readonly capabilitySnapshotHash: string;
    readonly productId: string;
    readonly readerCharacterId: string;
    readonly readerContentBundleId: string;
    readonly readerSelectionContractVersion: typeof STANDARD_READING_READER_SELECTION_CONTRACT_V1;
    readonly readerSelectionSnapshotJsonb: StandardReadingReaderSelectionSnapshotV4;
    readonly readerSelectionHash: string;
  }): Awaitable<readonly StandardReadingPurchaseIntentAuthorityRowV4[]>;
}

export interface StandardReadingReaderSelectionSnapshotV4 {
  readonly schemaVersion: typeof STANDARD_READING_READER_SELECTION_CONTRACT_V1;
  readonly productId: string;
  readonly topicKey: string;
  readonly specVersion: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
}

export interface CreateStandardReadingPurchaseIntentInputV4 {
  readonly resolvedSubjectId?: string;
  readonly request: unknown;
  readonly offerSnapshotPort: PurchaseIntentOfferSnapshotPortV1;
  readonly capabilitySnapshotPort: PurchaseIntentCapabilitySnapshotPortV3;
  readonly readerSelectionPort: StandardReadingReaderSelectionPortV4;
  readonly idPort: PurchaseIntentIdPortV1;
  readonly authorityPort: StandardReadingPurchaseIntentAuthorityPortV4;
}

export interface CreateStandardReadingPurchaseIntentResponseV4 {
  readonly purchaseIntentId: string;
  readonly status: PurchaseIntentStatusV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireBoundedString(name: string, value: unknown, maxLength = 160): string {
  if (typeof value !== 'string') {
    throw new ApiCommandError('INVALID_REQUEST', `${name} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new ApiCommandError('INVALID_REQUEST', `${name} is outside the supported bounds.`);
  }
  return normalized;
}

function requireTrustedString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Standard Reading Purchase Intent v4 trusted ${name} is invalid.`);
  }
  return value;
}

function parseRequest(value: unknown): StandardReadingPurchaseIntentRequestV4 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiCommandError('INVALID_REQUEST', 'Standard Reading Purchase Intent request must be an object.');
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(['productOfferId', 'idempotencyKey', 'readerCharacterId']);
  const unexpected = Object.keys(record).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      `Unexpected Standard Reading Purchase Intent field: ${unexpected.sort()[0] ?? 'unknown'}.`,
    );
  }
  return Object.freeze({
    productOfferId: requireBoundedString('productOfferId', record.productOfferId),
    idempotencyKey: requireBoundedString('idempotencyKey', record.idempotencyKey, 200),
    readerCharacterId: requireBoundedString('readerCharacterId', record.readerCharacterId, 128),
  });
}

function hashCanonical(value: unknown): string {
  return `sha256:v1:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function requirePreflightOffer(
  value: PurchaseIntentOfferSnapshotV1 | null,
  expectedOfferId: string,
): PurchaseIntentOfferSnapshotV1 {
  if (value === null) {
    throw new ApiCommandError('NOT_FOUND', 'Selected product offer is unavailable.');
  }
  if (value.productOfferId !== expectedOfferId) {
    throw new Error('Standard Reading Purchase Intent v4 Offer resolver returned a different Offer id.');
  }
  requireTrustedString('Offer Product id', value.productId);
  return value;
}

function requirePreflightCapability(
  value: PurchaseIntentCapabilitySnapshotV3 | null,
): PurchaseIntentCapabilitySnapshotV3 {
  if (value === null) {
    throw new ApiCommandError('NOT_FOUND', 'Selected product offer is unavailable.');
  }
  requireTrustedString('Capability Set id', value.capabilitySetId);
  requireTrustedString('Capability definition version', value.definitionVersion);
  requireTrustedString('Capability definition hash', value.definitionHash);
  return value;
}

function normalizeReaderSelection(
  value: StandardReadingReaderSelectionResolutionV4 | null,
  expectedProductId: string,
  expectedReaderCharacterId: string,
): StandardReadingReaderSelectionSnapshotV4 {
  if (value === null) {
    throw new ApiCommandError('NOT_FOUND', 'Selected Reader is unavailable.');
  }
  if (value.productId !== expectedProductId) {
    throw new Error('Standard Reading Reader resolver returned a different Product id.');
  }
  if (value.readerCharacterId !== expectedReaderCharacterId) {
    throw new Error('Standard Reading Reader resolver returned a different Character id.');
  }

  const topicKey = requireTrustedString('Reader topic key', value.topicKey);
  const specVersion = requireTrustedString('Reader Product spec version', value.specVersion);
  const readerContentBundleId = requireTrustedString(
    'Reader content bundle id',
    value.readerContentBundleId,
  );

  return Object.freeze({
    schemaVersion: STANDARD_READING_READER_SELECTION_CONTRACT_V1,
    productId: expectedProductId,
    topicKey,
    specVersion,
    readerCharacterId: expectedReaderCharacterId,
    readerContentBundleId,
  });
}

function translateAuthorityError(error: unknown): never {
  if (!(error instanceof StandardReadingPurchaseIntentAuthorityPortErrorV4)) throw error;

  if (error.code === 'READER_UNAVAILABLE') {
    throw new ApiCommandError('NOT_FOUND', 'Selected Reader is unavailable.');
  }
  if (error.code === 'READER_PROVENANCE_CONFLICT') {
    throw new Error('Standard Reading Purchase Intent v4 authority rejected trusted Reader provenance.');
  }
  throw new PurchaseIntentCreateAuthorityPortErrorV3(error.code, error.message);
}

function validateReturnedReader(
  row: StandardReadingPurchaseIntentAuthorityRowV4,
  expectedSnapshot: StandardReadingReaderSelectionSnapshotV4,
  expectedHash: string,
): PurchaseIntentCreateAuthorityRowV3 {
  if (row.readerCharacterId !== expectedSnapshot.readerCharacterId) {
    throw new Error('Standard Reading Purchase Intent v4 authority returned a different Reader Character.');
  }
  if (row.readerContentBundleId !== expectedSnapshot.readerContentBundleId) {
    throw new Error('Standard Reading Purchase Intent v4 authority returned a different Reader content bundle.');
  }
  if (canonicalJson(row.readerSelectionSnapshotJsonb) !== canonicalJson(expectedSnapshot)) {
    throw new Error('Standard Reading Purchase Intent v4 authority returned a different Reader selection snapshot.');
  }
  if (row.readerSelectionHash !== expectedHash) {
    throw new Error('Standard Reading Purchase Intent v4 authority returned a different Reader selection hash.');
  }

  return Object.freeze({
    purchaseIntentId: row.purchaseIntentId,
    productOfferId: row.productOfferId,
    providerAccountLinkId: row.providerAccountLinkId,
    status: row.status,
    offerSnapshotJsonb: row.offerSnapshotJsonb,
    offerSnapshotHash: row.offerSnapshotHash,
    expectedAmountMinor: row.expectedAmountMinor,
    expectedCurrency: row.expectedCurrency,
    chargeTermsVersion: row.chargeTermsVersion,
    capabilitySetId: row.capabilitySetId,
    capabilitySnapshotJsonb: row.capabilitySnapshotJsonb,
    capabilitySnapshotHash: row.capabilitySnapshotHash,
    replayed: row.replayed,
  });
}

export async function createStandardReadingPurchaseIntentV4(
  input: CreateStandardReadingPurchaseIntentInputV4,
): Promise<CreateStandardReadingPurchaseIntentResponseV4> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const request = parseRequest(input.request);

  const offerSnapshot = requirePreflightOffer(
    await input.offerSnapshotPort.resolveImmutableOfferMapping({
      productOfferId: request.productOfferId,
    }),
    request.productOfferId,
  );
  const capabilitySnapshot = requirePreflightCapability(
    await input.capabilitySnapshotPort.resolveImmutableCapabilityMapping({
      productOfferId: request.productOfferId,
    }),
  );
  const productId = requireTrustedString('Offer Product id', offerSnapshot.productId);
  const readerSelectionSnapshot = normalizeReaderSelection(
    await input.readerSelectionPort.resolveEligibleReaderSelection({
      subjectId,
      productId,
      readerCharacterId: request.readerCharacterId,
    }),
    productId,
    request.readerCharacterId,
  );
  const readerSelectionHash = hashCanonical(readerSelectionSnapshot);
  const v4RequestHash = hashCanonical({
    productOfferId: request.productOfferId,
    readerCharacterId: request.readerCharacterId,
  });

  const cachedOfferPort: PurchaseIntentOfferSnapshotPortV1 = Object.freeze({
    resolveImmutableOfferMapping: ({ productOfferId }: { readonly productOfferId: string }) => {
      if (productOfferId !== request.productOfferId) {
        throw new Error('Standard Reading Purchase Intent v4 cached Offer lookup drifted.');
      }
      return offerSnapshot;
    },
  });
  const cachedCapabilityPort: PurchaseIntentCapabilitySnapshotPortV3 = Object.freeze({
    resolveImmutableCapabilityMapping: ({ productOfferId }: { readonly productOfferId: string }) => {
      if (productOfferId !== request.productOfferId) {
        throw new Error('Standard Reading Purchase Intent v4 cached Capability lookup drifted.');
      }
      return capabilitySnapshot;
    },
  });

  const v3AuthorityAdapter: PurchaseIntentCreateAuthorityPortV3 = Object.freeze({
    async createPurchaseIntent(authorityInput: Parameters<PurchaseIntentCreateAuthorityPortV3['createPurchaseIntent']>[0]) {
      try {
        const rows = await input.authorityPort.createPurchaseIntent({
          ...authorityInput,
          requestHash: v4RequestHash,
          productId,
          readerCharacterId: readerSelectionSnapshot.readerCharacterId,
          readerContentBundleId: readerSelectionSnapshot.readerContentBundleId,
          readerSelectionContractVersion: STANDARD_READING_READER_SELECTION_CONTRACT_V1,
          readerSelectionSnapshotJsonb: readerSelectionSnapshot,
          readerSelectionHash,
        });
        return Object.freeze(
          rows.map((row) => validateReturnedReader(row, readerSelectionSnapshot, readerSelectionHash)),
        );
      } catch (error) {
        return translateAuthorityError(error);
      }
    },
  });

  return createPurchaseIntentV3({
    resolvedSubjectId: subjectId,
    request: {
      productOfferId: request.productOfferId,
      idempotencyKey: request.idempotencyKey,
    },
    offerSnapshotPort: cachedOfferPort,
    capabilitySnapshotPort: cachedCapabilityPort,
    idPort: input.idPort,
    authorityPort: v3AuthorityAdapter,
  });
}
