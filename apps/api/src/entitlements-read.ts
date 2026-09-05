import { ApiCommandError } from './api-error.js';

export const ENTITLEMENTS_READ_AUTHORITY_BINDING_V1 =
  'public.qry_entitlements_v1' as const;

export type EntitlementProjectionStatusV1 = 'active' | 'inactive';

export interface EntitlementCurrentAuthorityRowV1 {
  readonly entitlementId: string;
  readonly entitlementKey: string;
  readonly scopeKey: string | null;
  readonly status: string;
  readonly activeGrantCount: number;
  readonly effectiveValidUntil: string | null;
  readonly revision: number;
  readonly updatedAt: string;
}

export type EntitlementsReadAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'INVALID_INPUT';

export class EntitlementsReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: EntitlementsReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'EntitlementsReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the verified provider-independent logical entitlement projection.
 *
 * A production adapter may bind this to `qry_entitlements_v1`. This boundary
 * reads the stored projection only; it must not reconstruct grants, apply
 * entitlement events, resolve products to grants, or infer provider receipt
 * semantics. SRC-18/SRC-21 are architecture-resolved, P0-CM-01 is decided as
 * Web + one-off launch MVP, and P0-AUTH-01 is decided as the dedicated
 * non-BYPASSRLS API role plus transaction-scoped canonical subject context.
 * Those decisions do not authorize provider-specific verification/apply
 * runtime or production Commerce activation.
 */
export interface EntitlementsReadAuthorityPortV1 {
  readCurrentEntitlements(input: {
    readonly subjectId: string;
  }): Awaitable<readonly EntitlementCurrentAuthorityRowV1[]>;
}

export interface EntitlementsReadClockV1 {
  now(): Date;
}

export interface EntitlementReadItemV1 {
  readonly entitlementId: string;
  readonly entitlementKey: string;
  readonly scopeKey: string | null;
  readonly status: EntitlementProjectionStatusV1;
  readonly activeGrantCount: number;
  readonly effectiveValidUntil: string | null;
  readonly revision: number;
  readonly updatedAt: string;
  /**
   * Server-side access decision over the stored current projection.
   * Source fixes exactly this fail-closed wall-clock rule:
   * status='active' AND (effective_valid_until IS NULL OR effective_valid_until > now()).
   */
  readonly accessAllowed: boolean;
}

export interface EntitlementsReadResponseV1 {
  readonly entitlements: readonly EntitlementReadItemV1[];
}

export interface GetEntitlementsInputV1 {
  readonly resolvedSubjectId?: string;
  readonly authorityPort: EntitlementsReadAuthorityPortV1;
  /** Internal server clock dependency; never populate this from an HTTP request. */
  readonly clock?: EntitlementsReadClockV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof EntitlementsReadAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Entitlements are unavailable for the current subject.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Entitlement authority returned an invalid ${name}.`);
  }
  return value;
}

function requireScopeKey(value: unknown): string | null {
  if (value === null) return null;
  const scopeKey = requireStoredString('scope key', value);
  if (scopeKey === '__GLOBAL__') {
    throw new Error('Entitlement authority leaked the internal normalized global scope key.');
  }
  return scopeKey;
}

function requireStatus(value: unknown): EntitlementProjectionStatusV1 {
  if (value !== 'active' && value !== 'inactive') {
    throw new Error('Entitlement authority returned an invalid status.');
  }
  return value;
}

function requireNonNegativeSafeInteger(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Entitlement authority returned an invalid ${name}.`);
  }
  return value;
}

function requireTimestamp(name: string, value: unknown): string {
  const stored = requireStoredString(name, value);
  if (Number.isNaN(Date.parse(stored))) {
    throw new Error(`Entitlement authority returned an invalid ${name}.`);
  }
  return stored;
}

function requireNullableTimestamp(name: string, value: unknown): string | null {
  if (value === null) return null;
  return requireTimestamp(name, value);
}

function requireWallClockMillis(clock: EntitlementsReadClockV1 | undefined): number {
  const now = clock?.now() ?? new Date();
  const nowMillis = now.getTime();
  if (Number.isNaN(nowMillis)) {
    throw new Error('Entitlement access clock returned an invalid timestamp.');
  }
  return nowMillis;
}

function accessAllowedAt(
  status: EntitlementProjectionStatusV1,
  effectiveValidUntil: string | null,
  nowMillis: number,
): boolean {
  if (status !== 'active') return false;
  if (effectiveValidUntil === null) return true;
  return Date.parse(effectiveValidUntil) > nowMillis;
}

function projectCurrentEntitlements(
  rows: readonly EntitlementCurrentAuthorityRowV1[],
  nowMillis: number,
): readonly EntitlementReadItemV1[] {
  const seenIds = new Set<string>();
  const seenLogicalKeys = new Set<string>();

  const items = rows.map((row) => {
    const entitlementId = requireStoredString('entitlement identity', row.entitlementId);
    const entitlementKey = requireStoredString('entitlement key', row.entitlementKey);
    const scopeKey = requireScopeKey(row.scopeKey);
    const status = requireStatus(row.status);
    const activeGrantCount = requireNonNegativeSafeInteger(
      'active grant count',
      row.activeGrantCount,
    );
    const effectiveValidUntil = requireNullableTimestamp(
      'effective validity timestamp',
      row.effectiveValidUntil,
    );
    const revision = requireNonNegativeSafeInteger('revision', row.revision);
    const updatedAt = requireTimestamp('updated timestamp', row.updatedAt);

    if (status === 'active' && activeGrantCount === 0) {
      throw new Error('Entitlement authority returned an invalid active projection shape.');
    }
    if (status === 'inactive' && activeGrantCount !== 0) {
      throw new Error('Entitlement authority returned an invalid inactive projection shape.');
    }
    if (seenIds.has(entitlementId)) {
      throw new Error('Entitlement authority returned a duplicate entitlement identity.');
    }
    seenIds.add(entitlementId);

    const logicalKey = JSON.stringify([entitlementKey, scopeKey]);
    if (seenLogicalKeys.has(logicalKey)) {
      throw new Error('Entitlement authority returned a duplicate logical entitlement key.');
    }
    seenLogicalKeys.add(logicalKey);

    return Object.freeze({
      entitlementId,
      entitlementKey,
      scopeKey,
      status,
      activeGrantCount,
      effectiveValidUntil,
      revision,
      updatedAt,
      accessAllowed: accessAllowedAt(status, effectiveValidUntil, nowMillis),
    });
  });

  return Object.freeze(items);
}

export async function getEntitlements(
  input: GetEntitlementsInputV1,
): Promise<EntitlementsReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const nowMillis = requireWallClockMillis(input.clock);

  try {
    const rows = await input.authorityPort.readCurrentEntitlements({ subjectId });
    return Object.freeze({
      entitlements: projectCurrentEntitlements(rows, nowMillis),
    });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
