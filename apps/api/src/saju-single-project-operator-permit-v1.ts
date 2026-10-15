import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF } from './production-user-data-runtime-config.js';

/**
 * ONE Supabase project / ONE PostgreSQL failure domain.
 * This is a DORMANT, non-public integration-PROBE claim adapter; NOT a
 * Target Authority V2, Owner signature verifier, independent Attestor,
 * Saju execution grant, production release permission or general Reading API.
 *
 * The function has no production LOGIN credential or role membership.
 * A trusted, separately reviewed issuer must independently verify Owner intent
 * and install a pinned permit before any real use is even considered.
 */
export const SAJU_SINGLE_PROJECT_PERMIT_VERSION_V1 =
  'myeongha-saju-single-project-operator-permit-v1' as const;

export const SAJU_SINGLE_PROJECT_PERMIT_ROLE_V1 =
  'myeongha_saju_bridge_permit_executor' as const;

export const SAJU_SINGLE_PROJECT_CONSUME_SQL_V1 = [
  'select saju_bridge_private.cmd_consume_operator_permit_v1(',
  '  $1::uuid, $2::text, $3::text, $4::text,',
  '  $5::text, $6::text, $7::uuid, $8::text',
  ') as "consumed"',
].join('\n');

const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SHA40 = /^[a-f0-9]{40}$/u;

const KEYS = Object.freeze([
  'permitId', 'scopeDigest', 'ownerIntentDigest',
  'myeonghaCommitSha', 'sajuCommitSha', 'auditEventId', 'auditDigest',
] as const);

export interface SajuSingleProjectPermitScopeV1 {
  readonly permitId: string;
  readonly scopeDigest: string;
  readonly ownerIntentDigest: string;
  readonly myeonghaCommitSha: string;
  readonly sajuCommitSha: string;
  readonly auditEventId: string;
  readonly auditDigest: string;
}

export type SajuSingleProjectPermitClaimResultV1 = Readonly<{
  version: typeof SAJU_SINGLE_PROJECT_PERMIT_VERSION_V1;
  /** DB consumption only; cannot be promoted to a run or release grant. */
  consumption: 'COMMITTED_UNVERIFIED_OWNER_AUTHORITY' | 'BLOCKED';
  ownerAuthority: 'NOT_VERIFIED';
  independentAudit: 'NOT_VERIFIED';
  canRunOnce: false;
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

export interface SajuSingleProjectPermitOptionsV1 {
  /** Never use the Production Subject/Reading pool or service_role. */
  readonly pool: PostgresSubjectPoolV1;
  /** Metadata must come from a trusted, pre-pinned Owner approval workflow. */
  readonly scope: unknown;
}

function exactRecord(value: unknown): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    const names = Object.keys(value);
    return names.length === KEYS.length
      && Reflect.ownKeys(value).length === names.length
      && KEYS.every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
      });
  } catch {
    return false;
  }
}

export function parseSajuSingleProjectPermitScopeV1(
  value: unknown,
): Readonly<SajuSingleProjectPermitScopeV1> {
  if (!exactRecord(value)
    || typeof value.permitId !== 'string' || !UUID_V4.test(value.permitId)
    || typeof value.scopeDigest !== 'string' || !SHA256.test(value.scopeDigest)
    || typeof value.ownerIntentDigest !== 'string'
    || !SHA256.test(value.ownerIntentDigest)
    || typeof value.myeonghaCommitSha !== 'string'
    || !SHA40.test(value.myeonghaCommitSha)
    || typeof value.sajuCommitSha !== 'string' || !SHA40.test(value.sajuCommitSha)
    || typeof value.auditEventId !== 'string' || !UUID_V4.test(value.auditEventId)
    || typeof value.auditDigest !== 'string' || !SHA256.test(value.auditDigest)
    || value.permitId === value.auditEventId) {
    throw new TypeError('Invalid single-project probe permit scope.');
  }
  return Object.freeze({
    permitId: value.permitId,
    scopeDigest: value.scopeDigest,
    ownerIntentDigest: value.ownerIntentDigest,
    myeonghaCommitSha: value.myeonghaCommitSha,
    sajuCommitSha: value.sajuCommitSha,
    auditEventId: value.auditEventId,
    auditDigest: value.auditDigest,
  });
}

function result(
  consumption: SajuSingleProjectPermitClaimResultV1['consumption'],
): SajuSingleProjectPermitClaimResultV1 {
  return Object.freeze({
    version: SAJU_SINGLE_PROJECT_PERMIT_VERSION_V1,
    consumption,
    ownerAuthority: 'NOT_VERIFIED',
    independentAudit: 'NOT_VERIFIED',
    canRunOnce: false,
    canExecute: false,
    canPublish: false,
    canSell: false,
  });
}

export interface SajuSingleProjectPermitConsumerV1 {
  consumeOnce(): Promise<SajuSingleProjectPermitClaimResultV1>;
}

/**
 * Scope and PostgreSQL command are always fixed; no HTTP route is mounted.
 * A failed/ambiguous COMMIT consumes the local attempt and MUST NOT retry.
 */
export function createSajuSingleProjectPermitConsumerV1(
  options: SajuSingleProjectPermitOptionsV1,
): SajuSingleProjectPermitConsumerV1 {
  if (typeof options?.pool?.connect !== 'function') {
    throw new TypeError('Dedicated single-project permit pool is required.');
  }
  const scope = parseSajuSingleProjectPermitScopeV1(options.scope);
  let attempted = false;

  return Object.freeze({
    async consumeOnce(): Promise<SajuSingleProjectPermitClaimResultV1> {
      if (attempted) return result('BLOCKED');
      attempted = true;

      let connection: Awaited<ReturnType<PostgresSubjectPoolV1['connect']>>;
      try {
        connection = await options.pool.connect();
      } catch {
        return result('BLOCKED');
      }

      let transactionStarted = false;
      let discardConnection: unknown;
      try {
        await connection.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        transactionStarted = true;
        await connection.query('SET LOCAL ROLE myeongha_saju_bridge_permit_executor');
        const consumed = await connection.query<{ consumed: unknown }>(
          SAJU_SINGLE_PROJECT_CONSUME_SQL_V1,
          [
            scope.permitId, MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
            scope.scopeDigest, scope.ownerIntentDigest,
            scope.myeonghaCommitSha, scope.sajuCommitSha,
            scope.auditEventId, scope.auditDigest,
          ],
        );
        if (consumed.rows.length !== 1
          || (consumed.rows[0]?.consumed !== true
            && consumed.rows[0]?.consumed !== false)) {
          throw new Error('Permit authority returned unexpected row shape.');
        }
        if (consumed.rows[0].consumed === false) {
          await connection.query('ROLLBACK');
          transactionStarted = false;
          return result('BLOCKED');
        }
        // COMMIT reply is the only point where a claim can be acknowledged.
        try {
          await connection.query('COMMIT');
        } catch (error) {
          discardConnection = error;
          throw error;
        }
        transactionStarted = false;
        return result('COMMITTED_UNVERIFIED_OWNER_AUTHORITY');
      } catch {
        if (transactionStarted) {
          try {
            await connection.query('ROLLBACK');
          } catch (rollbackError) {
            discardConnection = rollbackError;
          }
        }
        return result('BLOCKED');
      } finally {
        // A session with ambiguous transaction state is never reused.
        try {
          connection.release(discardConnection);
        } catch {
          // Cleanup failure cannot turn a blocked attempt into permission.
        }
      }
    },
  });
}
