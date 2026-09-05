import { ApiCommandError } from './api-error.js';

export const EFFECTIVE_ENTITLEMENTS_READ_AUTHORITY_BINDING_V2 =
  'public.qry_effective_entitlements_v2' as const;

export interface EffectiveEntitlementAuthorityRowV2 {
  readonly entitlementKey: string;
  readonly scopeKey: string | null;
  readonly effectiveValidUntil: string | null;
}

export type EffectiveEntitlementsReadAuthorityFailureCodeV2 =
  | 'SUBJECT_INELIGIBLE'
  | 'INVALID_INPUT';

export class EffectiveEntitlementsReadAuthorityPortErrorV2 extends Error {
  constructor(
    readonly code: EffectiveEntitlementsReadAuthorityFailureCodeV2,
    message: string,
  ) {
    super(message);
    this.name = 'EffectiveEntitlementsReadAuthorityPortErrorV2';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Provider-independent effective-access read port.
 *
 * Production adapters bind this to `qry_effective_entitlements_v2`. The DB
 * authority resolves Guest self-only vs Member self + direct merged Guest
 * lineage and collapses duplicate logical entitlement keys. This adapter must
 * not reconstruct grants/events, infer provider receipt state, or fabricate a
 * synthetic aggregate entitlement id/revision.
 */
export interface EffectiveEntitlementsReadAuthorityPortV2 {
  readEffectiveEntitlements(input: {
    readonly subjectId: string;
    readonly effectiveAt: string;
  }): Awaitable<readonly EffectiveEntitlementAuthorityRowV2[]>;
}

export interface EffectiveEntitlementsReadClockV2 {
  now(): Date;
}

export interface EffectiveEntitlementReadItemV2 {
  readonly entitlementKey: string;
  readonly scopeKey: string | null;
  readonly effectiveValidUntil: string | null;
}

export interface EffectiveEntitlementsReadResponseV2 {
  readonly entitlements: readonly EffectiveEntitlementReadItemV2[];
}

export interface GetEffectiveEntitlementsInputV2 {
  readonly resolvedSubjectId?: string;
  readonly authorityPort: EffectiveEntitlementsReadAuthorityPortV2;
  /** Internal server clock dependency; never populate this from an HTTP request. */
  readonly clock?: EffectiveEntitlementsReadClockV2;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireEvaluationTime(clock: EffectiveEntitlementsReadClockV2 | undefined): {
  readonly iso: string;
  readonly millis: number;
} {
  const now = clock?.now() ?? new Date();
  const millis = now.getTime();
  if (Number.isNaN(millis)) {
    throw new Error('Effective entitlement access clock returned an invalid timestamp.');
  }
  return Object.freeze({ iso: now.toISOString(), millis });
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof EffectiveEntitlementsReadAuthorityPortErrorV2)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Effective entitlements are unavailable for the current subject.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Effective entitlement authority returned an invalid ${name}.`);
  }
  return value;
}

function requireScopeKey(value: unknown): string | null {
  if (value === null) return null;
  const scopeKey = requireStoredString('scope key', value);
  if (scopeKey === '__GLOBAL__') {
    throw new Error(
      'Effective entitlement authority leaked the internal normalized global scope key.',
    );
  }
  return scopeKey;
}

function requireEffectiveValidUntil(value: unknown, evaluationMillis: number): string | null {
  if (value === null) return null;
  const timestamp = requireStoredString('effective validity timestamp', value);
  const millis = Date.parse(timestamp);
  if (Number.isNaN(millis)) {
    throw new Error(
      'Effective entitlement authority returned an invalid effective validity timestamp.',
    );
  }
  if (millis <= evaluationMillis) {
    throw new Error(
      'Effective entitlement authority returned an already-expired effective projection.',
    );
  }
  return timestamp;
}

function projectEffectiveEntitlements(
  rows: readonly EffectiveEntitlementAuthorityRowV2[],
  evaluationMillis: number,
): readonly EffectiveEntitlementReadItemV2[] {
  const seenLogicalKeys = new Set<string>();

  const items = rows.map((row) => {
    const entitlementKey = requireStoredString('entitlement key', row.entitlementKey);
    const scopeKey = requireScopeKey(row.scopeKey);
    const effectiveValidUntil = requireEffectiveValidUntil(
      row.effectiveValidUntil,
      evaluationMillis,
    );

    const logicalKey = JSON.stringify([entitlementKey, scopeKey]);
    if (seenLogicalKeys.has(logicalKey)) {
      throw new Error(
        'Effective entitlement authority returned a duplicate logical entitlement key.',
      );
    }
    seenLogicalKeys.add(logicalKey);

    return Object.freeze({
      entitlementKey,
      scopeKey,
      effectiveValidUntil,
    });
  });

  return Object.freeze(items);
}

export async function getEffectiveEntitlements(
  input: GetEffectiveEntitlementsInputV2,
): Promise<EffectiveEntitlementsReadResponseV2> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const evaluation = requireEvaluationTime(input.clock);

  try {
    const rows = await input.authorityPort.readEffectiveEntitlements({
      subjectId,
      effectiveAt: evaluation.iso,
    });
    return Object.freeze({
      entitlements: projectEffectiveEntitlements(rows, evaluation.millis),
    });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
