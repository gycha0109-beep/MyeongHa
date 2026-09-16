import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import { ApiCommandError } from './api-error.js';
import type {
  PurchaseIntentIdPortV1,
  PurchaseIntentOfferSnapshotPortV1,
  PurchaseIntentOfferSnapshotV1,
  PurchaseIntentPlatformV1,
  PurchaseIntentStatusV1,
} from './purchase-intent-create-command.js';

export const PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V3 =
  'public.cmd_create_purchase_intent_v3' as const;

type Awaitable<T> = T | Promise<T>;

export interface PurchaseIntentCreateRequestV3 {
  readonly productOfferId: string;
  readonly idempotencyKey: string;
}

export interface PurchaseIntentCapabilitySnapshotV3 {
  readonly capabilitySetId: string;
  readonly definitionVersion: string;
  readonly definitionHash: string;
}

/**
 * Resolves only the immutable Capability Set identity already pinned to an Offer.
 * Retirement blocks new Offer assignment; it does not erase historical Offer or
 * Purchase Intent capability meaning.
 */
export interface PurchaseIntentCapabilitySnapshotPortV3 {
  resolveImmutableCapabilityMapping(input: {
    readonly productOfferId: string;
  }): Awaitable<PurchaseIntentCapabilitySnapshotV3 | null>;
}

export interface PurchaseIntentCreateAuthorityRowV3 {
  readonly purchaseIntentId: string;
  readonly productOfferId: string;
  readonly providerAccountLinkId: string | null;
  readonly status: string;
  readonly offerSnapshotJsonb: unknown;
  readonly offerSnapshotHash: string;
  readonly expectedAmountMinor: unknown;
  readonly expectedCurrency: unknown;
  readonly chargeTermsVersion: unknown;
  readonly capabilitySetId: unknown;
  readonly capabilitySnapshotJsonb: unknown;
  readonly capabilitySnapshotHash: unknown;
  readonly replayed: unknown;
}

export type PurchaseIntentCreateAuthorityFailureCodeV3 =
  | 'SUBJECT_NOT_FOUND'
  | 'SUBJECT_INELIGIBLE'
  | 'OFFER_NOT_FOUND'
  | 'OFFER_UNAVAILABLE'
  | 'CHARGE_TERMS_UNAVAILABLE'
  | 'CAPABILITY_UNAVAILABLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'REPLAY_SHAPE_CONFLICT'
  | 'OFFER_SNAPSHOT_MISMATCH'
  | 'CAPABILITY_SNAPSHOT_MISMATCH'
  | 'CAPABILITY_AUTHORITY_MISMATCH'
  | 'REPLAY_CHARGE_TERMS_MISSING'
  | 'REPLAY_CAPABILITY_MISSING'
  | 'REPLAY_CAPABILITY_CONFLICT'
  | 'SERVER_ID_CONFLICT'
  | 'INVALID_INPUT';

export class PurchaseIntentCreateAuthorityPortErrorV3 extends Error {
  constructor(
    readonly code: PurchaseIntentCreateAuthorityFailureCodeV3,
    message: string,
  ) {
    super(message);
    this.name = 'PurchaseIntentCreateAuthorityPortErrorV3';
  }
}

export interface PurchaseIntentCreateAuthorityPortV3 {
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
  }): Awaitable<readonly PurchaseIntentCreateAuthorityRowV3[]>;
}

export interface CreatePurchaseIntentInputV3 {
  readonly resolvedSubjectId?: string;
  readonly request: unknown;
  readonly offerSnapshotPort: PurchaseIntentOfferSnapshotPortV1;
  readonly capabilitySnapshotPort: PurchaseIntentCapabilitySnapshotPortV3;
  readonly idPort: PurchaseIntentIdPortV1;
  readonly authorityPort: PurchaseIntentCreateAuthorityPortV3;
}

export interface CreatePurchaseIntentResponseV3 {
  readonly purchaseIntentId: string;
  readonly status: PurchaseIntentStatusV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function parseRequest(value: unknown): PurchaseIntentCreateRequestV3 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiCommandError('INVALID_REQUEST', 'Purchase Intent request must be an object.');
  }

  const request = value as Record<string, unknown>;
  const keys = Object.keys(request);
  if (
    keys.length !== 2 ||
    !Object.prototype.hasOwnProperty.call(request, 'productOfferId') ||
    !Object.prototype.hasOwnProperty.call(request, 'idempotencyKey')
  ) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Purchase Intent request contains unsupported fields.',
    );
  }

  const productOfferId = request.productOfferId;
  const idempotencyKey = request.idempotencyKey;
  if (typeof productOfferId !== 'string' || productOfferId.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'productOfferId must be a non-empty string.');
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'idempotencyKey must be a non-empty string.');
  }

  return Object.freeze({ productOfferId, idempotencyKey });
}

function requireServerString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Purchase Intent v3 ${name} is invalid.`);
  }
  return value;
}

function requirePlatform(value: unknown): PurchaseIntentPlatformV1 {
  switch (value) {
    case 'web':
    case 'ios':
    case 'android':
      return value;
    default:
      throw new Error('Purchase Intent v3 immutable offer snapshot has an invalid platform.');
  }
}

function normalizeOfferSnapshot(
  value: PurchaseIntentOfferSnapshotV1,
  expectedProductOfferId: string,
): PurchaseIntentOfferSnapshotV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Purchase Intent v3 immutable offer snapshot is invalid.');
  }

  const snapshot = value as unknown as Record<string, unknown>;
  const expectedKeys = [
    'productOfferId',
    'productId',
    'platform',
    'provider',
    'externalProductId',
  ];
  const keys = Object.keys(snapshot);
  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(snapshot, key))
  ) {
    throw new Error('Purchase Intent v3 immutable offer snapshot has unsupported fields.');
  }

  const productOfferId = requireServerString('snapshot productOfferId', snapshot.productOfferId);
  if (productOfferId !== expectedProductOfferId) {
    throw new Error('Purchase Intent v3 immutable offer snapshot targets a different offer.');
  }

  return Object.freeze({
    productOfferId,
    productId: requireServerString('snapshot productId', snapshot.productId),
    platform: requirePlatform(snapshot.platform),
    provider: requireServerString('snapshot provider', snapshot.provider),
    externalProductId: requireServerString('snapshot externalProductId', snapshot.externalProductId),
  });
}

function normalizeCapabilitySnapshot(
  value: PurchaseIntentCapabilitySnapshotV3,
): PurchaseIntentCapabilitySnapshotV3 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Purchase Intent v3 immutable capability snapshot is invalid.');
  }

  const snapshot = value as unknown as Record<string, unknown>;
  const expectedKeys = ['capabilitySetId', 'definitionVersion', 'definitionHash'];
  const keys = Object.keys(snapshot);
  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(snapshot, key))
  ) {
    throw new Error('Purchase Intent v3 immutable capability snapshot has unsupported fields.');
  }

  return Object.freeze({
    capabilitySetId: requireServerString('capabilitySetId', snapshot.capabilitySetId),
    definitionVersion: requireServerString('definitionVersion', snapshot.definitionVersion),
    definitionHash: requireServerString('definitionHash', snapshot.definitionHash),
  });
}

function hashCanonical(value: unknown): string {
  return `sha256:v1:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function canonicalPurchaseRequest(request: PurchaseIntentCreateRequestV3): {
  readonly productOfferId: string;
} {
  return Object.freeze({ productOfferId: request.productOfferId });
}

function requireStatus(value: unknown): PurchaseIntentStatusV1 {
  switch (value) {
    case 'created':
    case 'pending':
    case 'verified':
    case 'failed':
    case 'cancelled':
      return value;
    default:
      throw new Error('Purchase Intent v3 authority returned an invalid status.');
  }
}

function offerSnapshotsEqual(
  left: PurchaseIntentOfferSnapshotV1,
  right: PurchaseIntentOfferSnapshotV1,
): boolean {
  return (
    left.productOfferId === right.productOfferId &&
    left.productId === right.productId &&
    left.platform === right.platform &&
    left.provider === right.provider &&
    left.externalProductId === right.externalProductId
  );
}

function capabilitySnapshotsEqual(
  left: PurchaseIntentCapabilitySnapshotV3,
  right: PurchaseIntentCapabilitySnapshotV3,
): boolean {
  return (
    left.capabilitySetId === right.capabilitySetId &&
    left.definitionVersion === right.definitionVersion &&
    left.definitionHash === right.definitionHash
  );
}

function requireExpectedAmountMinor(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Purchase Intent v3 authority returned an invalid expected charge amount.');
  }
  return value;
}

function requireExpectedCurrency(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    throw new Error('Purchase Intent v3 authority returned an invalid expected currency.');
  }
  return value;
}

function requireChargeTermsVersion(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Purchase Intent v3 authority returned an invalid charge-term version.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof PurchaseIntentCreateAuthorityPortErrorV3)) throw error;

  switch (error.code) {
    case 'SUBJECT_NOT_FOUND':
      throw new ApiCommandError('NOT_FOUND', 'Purchase Intent is unavailable for the current subject.');
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError(
        'FORBIDDEN',
        'Purchase Intent requires an active canonical Guest or Member subject.',
      );
    case 'OFFER_NOT_FOUND':
    case 'OFFER_UNAVAILABLE':
    case 'CHARGE_TERMS_UNAVAILABLE':
    case 'CAPABILITY_UNAVAILABLE':
      throw new ApiCommandError('NOT_FOUND', 'Selected product offer is unavailable.');
    case 'IDEMPOTENCY_CONFLICT':
      throw new ApiCommandError(
        'IDEMPOTENCY_CONFLICT',
        'idempotencyKey already represents a different purchase request.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', 'Purchase Intent request is invalid.');
    case 'REPLAY_SHAPE_CONFLICT':
    case 'OFFER_SNAPSHOT_MISMATCH':
    case 'CAPABILITY_SNAPSHOT_MISMATCH':
    case 'CAPABILITY_AUTHORITY_MISMATCH':
    case 'REPLAY_CHARGE_TERMS_MISSING':
    case 'REPLAY_CAPABILITY_MISSING':
    case 'REPLAY_CAPABILITY_CONFLICT':
    case 'SERVER_ID_CONFLICT':
      throw new Error('Purchase Intent v3 authority rejected trusted server-owned command data.');
  }
}

function assembleResponse(
  row: PurchaseIntentCreateAuthorityRowV3,
  request: PurchaseIntentCreateRequestV3,
  proposedPurchaseIntentId: string,
  expectedOfferSnapshot: PurchaseIntentOfferSnapshotV1,
  expectedOfferSnapshotHash: string,
  expectedCapabilitySnapshot: PurchaseIntentCapabilitySnapshotV3,
  expectedCapabilitySnapshotHash: string,
): CreatePurchaseIntentResponseV3 {
  const purchaseIntentId = requireServerString('authority purchase intent id', row.purchaseIntentId);
  if (row.productOfferId !== request.productOfferId) {
    throw new Error('Purchase Intent v3 authority returned a different product offer id.');
  }
  if (row.providerAccountLinkId !== null) {
    throw new Error('Purchase Intent v3 authority unexpectedly bound a provider account link.');
  }

  const returnedOfferSnapshot = normalizeOfferSnapshot(
    row.offerSnapshotJsonb as PurchaseIntentOfferSnapshotV1,
    request.productOfferId,
  );
  if (!offerSnapshotsEqual(returnedOfferSnapshot, expectedOfferSnapshot)) {
    throw new Error('Purchase Intent v3 authority returned a different immutable offer snapshot.');
  }
  if (row.offerSnapshotHash !== expectedOfferSnapshotHash) {
    throw new Error('Purchase Intent v3 authority returned a different offer snapshot hash.');
  }

  const capabilitySetId = requireServerString('authority capability set id', row.capabilitySetId);
  const returnedCapabilitySnapshot = normalizeCapabilitySnapshot(
    row.capabilitySnapshotJsonb as PurchaseIntentCapabilitySnapshotV3,
  );
  if (capabilitySetId !== expectedCapabilitySnapshot.capabilitySetId) {
    throw new Error('Purchase Intent v3 authority returned a different Capability Set id.');
  }
  if (!capabilitySnapshotsEqual(returnedCapabilitySnapshot, expectedCapabilitySnapshot)) {
    throw new Error('Purchase Intent v3 authority returned a different immutable capability snapshot.');
  }
  if (row.capabilitySnapshotHash !== expectedCapabilitySnapshotHash) {
    throw new Error('Purchase Intent v3 authority returned a different capability snapshot hash.');
  }

  requireExpectedAmountMinor(row.expectedAmountMinor);
  requireExpectedCurrency(row.expectedCurrency);
  requireChargeTermsVersion(row.chargeTermsVersion);

  if (typeof row.replayed !== 'boolean') {
    throw new Error('Purchase Intent v3 authority returned an invalid replay marker.');
  }

  const status = requireStatus(row.status);
  if (!row.replayed) {
    if (purchaseIntentId !== proposedPurchaseIntentId) {
      throw new Error('Purchase Intent v3 authority returned a different new logical identity.');
    }
    if (status !== 'created') {
      throw new Error('Purchase Intent v3 authority returned a non-created new intent.');
    }
  }

  return Object.freeze({ purchaseIntentId, status });
}

export async function createPurchaseIntentV3(
  input: CreatePurchaseIntentInputV3,
): Promise<CreatePurchaseIntentResponseV3> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const request = parseRequest(input.request);

  const resolvedOfferSnapshot = await input.offerSnapshotPort.resolveImmutableOfferMapping({
    productOfferId: request.productOfferId,
  });
  if (resolvedOfferSnapshot === null) {
    throw new ApiCommandError('NOT_FOUND', 'Selected product offer is unavailable.');
  }
  const offerSnapshot = normalizeOfferSnapshot(resolvedOfferSnapshot, request.productOfferId);

  const resolvedCapabilitySnapshot =
    await input.capabilitySnapshotPort.resolveImmutableCapabilityMapping({
      productOfferId: request.productOfferId,
    });
  if (resolvedCapabilitySnapshot === null) {
    throw new ApiCommandError('NOT_FOUND', 'Selected product offer is unavailable.');
  }
  const capabilitySnapshot = normalizeCapabilitySnapshot(resolvedCapabilitySnapshot);

  const purchaseIntentId = requireServerString(
    'generated purchase intent id',
    await input.idPort.nextPurchaseIntentId(),
  );
  const requestHash = hashCanonical(canonicalPurchaseRequest(request));
  const offerSnapshotHash = hashCanonical(offerSnapshot);
  const capabilitySnapshotHash = hashCanonical(capabilitySnapshot);

  try {
    const rows = await input.authorityPort.createPurchaseIntent({
      subjectId,
      purchaseIntentId,
      productOfferId: request.productOfferId,
      providerAccountLinkId: null,
      idempotencyKey: request.idempotencyKey,
      requestHash,
      offerSnapshotJsonb: offerSnapshot,
      offerSnapshotHash,
      capabilitySnapshotJsonb: capabilitySnapshot,
      capabilitySnapshotHash,
    });
    if (rows.length !== 1) {
      throw new Error('Purchase Intent v3 authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Purchase Intent v3 authority returned an impossible empty successful row.');
    }

    return assembleResponse(
      row,
      request,
      purchaseIntentId,
      offerSnapshot,
      offerSnapshotHash,
      capabilitySnapshot,
      capabilitySnapshotHash,
    );
  } catch (error) {
    return mapAuthorityError(error);
  }
}
