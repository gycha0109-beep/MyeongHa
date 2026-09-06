import { ApiCommandError } from './api-error.js';
import {
  getEffectiveEntitlements,
  type EffectiveEntitlementsReadAuthorityPortV2,
  type EffectiveEntitlementsReadClockV2,
  type EffectiveEntitlementReadItemV2,
} from './effective-entitlements-read-v2.js';

export const ENTITLEMENT_RESTORE_COMMAND_BINDING_V1 =
  'public.cmd_restore_entitlements_runtime_v1' as const;

export type EntitlementRestoreAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'SUBJECT_CONTEXT_MISMATCH'
  | 'INVALID_INPUT';

export class EntitlementRestoreAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: EntitlementRestoreAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'EntitlementRestoreAuthorityPortErrorV1';
  }
}

export interface EntitlementRestoreAuthorityResultV1 {
  readonly recomputedProjectionCount: number;
  readonly changedProjectionCount: number;
  readonly providerRevalidationPerformed: boolean;
}

/**
 * Provider-independent restore authority.
 *
 * Production adapters bind this port to `cmd_restore_entitlements_runtime_v1`.
 * That DB command can only rebuild derived Entitlement projections from existing
 * server-side Grant authority for the current Member plus directly merged Guests.
 * It must not verify provider receipts, create Grants, append Entitlement Events,
 * rewrite historical ownership, or infer recursive merge ancestry.
 */
export interface EntitlementRestoreAuthorityPortV1 {
  restoreServerEntitlements(input: {
    readonly subjectId: string;
  }): EntitlementRestoreAuthorityResultV1 | Promise<EntitlementRestoreAuthorityResultV1>;
}

export interface EntitlementRestoreResponseV1 {
  readonly restoreScope: 'server_entitlements_only';
  readonly providerRevalidationPerformed: false;
  readonly recomputedProjectionCount: number;
  readonly changedProjectionCount: number;
  readonly entitlements: readonly EffectiveEntitlementReadItemV2[];
}

export interface RestoreEntitlementsInputV1 {
  readonly resolvedSubjectId?: string;
  readonly restoreAuthorityPort: EntitlementRestoreAuthorityPortV1;
  readonly effectiveEntitlementsReadAuthorityPort: EffectiveEntitlementsReadAuthorityPortV2;
  /** Internal server clock dependency; never populate this from an HTTP request. */
  readonly clock?: EffectiveEntitlementsReadClockV2;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved Member subject is required.');
  }
  return value;
}

function requireNonNegativeSafeInteger(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Entitlement restore authority returned an invalid ${name}.`);
  }
  return value;
}

function mapRestoreAuthorityError(error: unknown): never {
  if (!(error instanceof EntitlementRestoreAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Entitlement restore is unavailable for the current subject.',
      );
    case 'SUBJECT_CONTEXT_MISMATCH':
      throw new ApiCommandError('AUTH_REQUIRED', 'The resolved subject context is no longer current.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

/**
 * Rebuild server-authoritative projections, then read the effective-access union.
 *
 * The response deliberately makes provider verification impossible to overclaim:
 * this provider-neutral v1 accepts only `false` from the DB restore authority and
 * publishes a literal `false` plus `server_entitlements_only` scope to callers.
 */
export async function restoreEntitlements(
  input: RestoreEntitlementsInputV1,
): Promise<EntitlementRestoreResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);

  let restoreResult: EntitlementRestoreAuthorityResultV1;
  try {
    restoreResult = await input.restoreAuthorityPort.restoreServerEntitlements({ subjectId });
  } catch (error) {
    return mapRestoreAuthorityError(error);
  }

  const recomputedProjectionCount = requireNonNegativeSafeInteger(
    'recomputed projection count',
    restoreResult.recomputedProjectionCount,
  );
  const changedProjectionCount = requireNonNegativeSafeInteger(
    'changed projection count',
    restoreResult.changedProjectionCount,
  );
  if (changedProjectionCount > recomputedProjectionCount) {
    throw new Error(
      'Entitlement restore authority reported more changed projections than recomputed projections.',
    );
  }
  if (restoreResult.providerRevalidationPerformed !== false) {
    throw new Error(
      'Provider-independent entitlement restore must not claim provider revalidation.',
    );
  }

  const effective = await getEffectiveEntitlements({
    resolvedSubjectId: subjectId,
    authorityPort: input.effectiveEntitlementsReadAuthorityPort,
    clock: input.clock,
  });

  return Object.freeze({
    restoreScope: 'server_entitlements_only',
    providerRevalidationPerformed: false,
    recomputedProjectionCount,
    changedProjectionCount,
    entitlements: effective.entitlements,
  });
}
