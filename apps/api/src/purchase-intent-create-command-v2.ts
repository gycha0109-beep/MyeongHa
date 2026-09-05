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

export const PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V2 =
  'public.cmd_create_purchase_intent_v2' as const;

type Awaitable<T> = T | Promise<T>;

export interface PurchaseIntentCreateRequestV2 {
  readonly productOfferId: string;
  readonly idempotencyKey: string;
}

export interface PurchaseIntentCreateAuthorityRowV2 {
  readonly purchaseIntentId: string;
  readonly productOfferId: string;
  readonly providerAccountLinkId: string | null;
  readonly status: string;
  readonly offerSnapshotJsonb: unknown;
  readonly offerSnapshotHash: string;
  readonly expectedAmountMinor: unknown;
  readonly expectedCurrency: unknown;
  readonly chargeTermsVersion: unknown;
  readonly replayed: unknown;
}

export type PurchaseIntentCreateAuthorityFailureCodeV2 =
  | 'SUBJECT_NOT_FOUND'
  | 'SUBJECT_INELIGIBLE'
  | 'OFFER_NOT_FOUND'
  | 'OFFER_UNAVAILABLE'
  | 'CHARGE_TERMS_UNAVAILABLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'REPLAY_SHAPE_CONFLICT'
  | 'OFFER_SNAPSHOT_MISMATCH'
  | 'REPLAY_CHARGE_TERMS_MISSING'
  | 'SERVER_ID_CONFLICT'
  | 'INVALID_INPUT';

export class PurchaseIntentCreateAuthorityPortErrorV2 extends Error {
  constructor(
    readonly code: PurchaseIntentCreateAuthorityFailureCodeV2,
    message: string,
  ) {
    super(message);
    this.name = 'PurchaseIntentCreateAuthorityPortErrorV2';
  }
}

/**
 * Trusted persistence boundary for Guest/Member Purchase Intent v2.
 *
 * The caller never supplies monetary authority. The DB command resolves and pins the
 * current server-owned charge-term version atomically with the Purchase Intent.
 */
export interface PurchaseIntentCreateAuthorityPortV2 {
  createPurchaseIntent(input: {
    readonly subjectId: string;
    readonly purchaseIntentId: string;
    readonly productOfferId: string;
    readonly providerAccountLinkId: null;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly offerSnapshotJsonb: PurchaseIntentOfferSnapshotV1;
    readonly offerSnapshotHash: string;
  }): Awaitable<readonly PurchaseIntentCreateAuthorityRowV2[]>;
}

export interface CreatePurchaseIntentInputV2 {
  readonly resolvedSubjectId?: string;
  readonly request: unknown;
  readonly offerSnapshotPort: PurchaseIntentOfferSnapshotPortV1;
  readonly idPort: PurchaseIntentIdPortV1;
  readonly authorityPort: PurchaseIntentCreateAuthorityPortV2;
}

export interface CreatePurchaseIntentResponseV2 {
  readonly purchaseIntentId: string;
  readonly status: PurchaseIntentStatusV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function parseRequest(value: unknown): PurchaseIntentCreateRequestV2 {
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
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'productOfferId must be a non-empty string.',
    );
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'idempotencyKey must be a non-empty string.',
    );
  }

  return Object.freeze({ productOfferId, idempotencyKey });
}

function requireServerString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Purchase Intent v2 ${name} is invalid.`);
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
      throw new Error('Purchase Intent v2 immutable offer snapshot has an invalid platform.');
  }
}

function normalizeOfferSnapshot(
  value: PurchaseIntentOfferSnapshotV1,
  expectedProductOfferId: string,
): PurchaseIntentOfferSnapshotV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Purchase Intent v2 immutable offer snapshot is invalid.');
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
    throw new Error('Purchase Intent v2 immutable offer snapshot has unsupported fields.');
  }

  const productOfferId = requireServerString('snapshot productOfferId', snapshot.productOfferId);
  if (productOfferId !== expectedProductOfferId) {
    throw new Error('Purchase Intent v2 immutable offer snapshot targets a different offer.');
  }

  return Object.freeze({
    productOfferId,
    productId: requireServerString('snapshot productId', snapshot.productId),
    platform: requirePlatform(snapshot.platform),
    provider: requireServerString('snapshot provider', snapshot.provider),
    externalProductId: requireServerString(
      'snapshot externalProductId',
      snapshot.externalProductId,
    ),
  });
}

function hashCanonical(value: unknown): string {
  return `sha256:v1:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function canonicalPurchaseRequest(request: PurchaseIntentCreateRequestV2): {
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
      throw new Error('Purchase Intent v2 authority returned an invalid status.');
  }
}

function snapshotsEqual(
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

function requireExpectedAmountMinor(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Purchase Intent v2 authority returned an invalid expected charge amount.');
  }
  return value;
}

function requireExpectedCurrency(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    throw new Error('Purchase Intent v2 authority returned an invalid expected currency.');
  }
  return value;
}

function requireChargeTermsVersion(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Purchase Intent v2 authority returned an invalid charge-term version.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof PurchaseIntentCreateAuthorityPortErrorV2)) throw error;

  switch (error.code) {
    case 'SUBJECT_NOT_FOUND':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Purchase Intent is unavailable for the current subject.',
      );
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError(
        'FORBIDDEN',
        'Purchase Intent requires an active canonical Guest or Member subject.',
      );
    case 'OFFER_NOT_FOUND':
    case 'OFFER_UNAVAILABLE':
    case 'CHARGE_TERMS_UNAVAILABLE':
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
    case 'REPLAY_CHARGE_TERMS_MISSING':
    case 'SERVER_ID_CONFLICT':
      throw new Error('Purchase Intent v2 authority rejected trusted server-owned command data.');
  }
}

function assembleResponse(
  row: PurchaseIntentCreateAuthorityRowV2,
  request: PurchaseIntentCreateRequestV2,
  proposedPurchaseIntentId: string,
  expectedSnapshot: PurchaseIntentOfferSnapshotV1,
  expectedSnapshotHash: string,
): CreatePurchaseIntentResponseV2 {
  const purchaseIntentId = requireServerString(
    'authority purchase intent id',
    row.purchaseIntentId,
  );
  if (row.productOfferId !== request.productOfferId) {
    throw new Error('Purchase Intent v2 authority returned a different product offer id.');
  }
  if (row.providerAccountLinkId !== null) {
    throw new Error('Purchase Intent v2 authority unexpectedly bound a provider account link.');
  }

  const returnedSnapshot = normalizeOfferSnapshot(
    row.offerSnapshotJsonb as PurchaseIntentOfferSnapshotV1,
    request.productOfferId,
  );
  if (!snapshotsEqual(returnedSnapshot, expectedSnapshot)) {
    throw new Error('Purchase Intent v2 authority returned a different immutable offer snapshot.');
  }
  if (row.offerSnapshotHash !== expectedSnapshotHash) {
    throw new Error('Purchase Intent v2 authority returned a different offer snapshot hash.');
  }

  // Validate the server-pinned monetary tuple even though it is intentionally not
  // exposed through this minimal public response. This prevents an adapter from
  // silently accepting a DB/provider amount that cannot be represented exactly by
  // the TypeScript/JSON boundary.
  requireExpectedAmountMinor(row.expectedAmountMinor);
  requireExpectedCurrency(row.expectedCurrency);
  requireChargeTermsVersion(row.chargeTermsVersion);

  if (typeof row.replayed !== 'boolean') {
    throw new Error('Purchase Intent v2 authority returned an invalid replay marker.');
  }

  const status = requireStatus(row.status);
  if (!row.replayed) {
    if (purchaseIntentId !== proposedPurchaseIntentId) {
      throw new Error('Purchase Intent v2 authority returned a different new logical identity.');
    }
    if (status !== 'created') {
      throw new Error('Purchase Intent v2 authority returned a non-created new intent.');
    }
  }

  return Object.freeze({ purchaseIntentId, status });
}

export async function createPurchaseIntentV2(
  input: CreatePurchaseIntentInputV2,
): Promise<CreatePurchaseIntentResponseV2> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const request = parseRequest(input.request);

  const resolvedSnapshot = await input.offerSnapshotPort.resolveImmutableOfferMapping({
    productOfferId: request.productOfferId,
  });
  if (resolvedSnapshot === null) {
    throw new ApiCommandError('NOT_FOUND', 'Selected product offer is unavailable.');
  }
  const offerSnapshot = normalizeOfferSnapshot(resolvedSnapshot, request.productOfferId);

  const purchaseIntentId = requireServerString(
    'generated purchase intent id',
    await input.idPort.nextPurchaseIntentId(),
  );
  const requestHash = hashCanonical(canonicalPurchaseRequest(request));
  const offerSnapshotHash = hashCanonical(offerSnapshot);

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
    });
    if (rows.length !== 1) {
      throw new Error('Purchase Intent v2 authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Purchase Intent v2 authority returned an impossible empty successful row.');
    }

    return assembleResponse(
      row,
      request,
      purchaseIntentId,
      offerSnapshot,
      offerSnapshotHash,
    );
  } catch (error) {
    return mapAuthorityError(error);
  }
}
