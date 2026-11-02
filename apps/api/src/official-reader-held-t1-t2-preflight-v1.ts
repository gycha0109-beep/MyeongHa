import {
  createOfficialReaderPrivateCurrentPurchaseAuthorityPortV1,
  type OfficialReaderPrivateCurrentPurchaseAuthorityPortV1,
} from './official-reader-private-exact-verified-purchase-guard-v1.js';
import {
  consumeOfficialReadingReaderAdmissionV1,
  type OfficialReadingReaderAdmissionScopeV1,
  type PreparedOfficialReadingReaderAdmissionV1,
} from './official-reading-reader-admission-v1.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectExecutionScopeV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import type { CharacterStandardReadingKnowledgeSourceV1 } from './character-standard-reading-knowledge.js';

/**
 * Internal, deny-only T1 -> external work -> fresh T2 rehearsal.
 *
 * Crucially, T2 in this module is NOT the DB Owner-approved R2 scope lock,
 * a Commerce refund linearization point, or a release/HTTP send permission.
 * The generated content never appears in the return value, even on success.
 * No Production/public route may use this as a positive authorization.
 */
export const OFFICIAL_READER_HELD_DISCLOSURE_REASON_V1 =
  'R2_SCOPE_AND_FINAL_DISCLOSURE_OWNER_HOLD' as const;

export interface OfficialReaderHeldPreflightInputV1 {
  readonly pool: PostgresSubjectPoolV1;
  /** Already-verified auth evidence; never an unverified browser subject id. */
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  /**
   * Re-acquire ALL server-owned authority on each distinct subject transaction.
   * T2 must use the fresh DB clock given here, not T1's effectiveAt.
   * Passing a T1 cached admission object fails proof consumption.
   */
  readonly prepareAdmission: (
    scope: PostgresSubjectExecutionScopeV1,
    dbEffectiveAt: string,
    currentVerifiedPurchaseAuthorityPort: OfficialReaderPrivateCurrentPurchaseAuthorityPortV1,
  ) => Promise<PreparedOfficialReadingReaderAdmissionV1>;
  /**
   * Receives only the T1-admitted private Official Source.
   * No transport, logging, public response, or persistent output here.
   * This callback is invoked strictly after T1 COMMIT and connection release.
   */
  readonly generatePrivate: (
    source: CharacterStandardReadingKnowledgeSourceV1,
  ) => Promise<unknown>;
}

export type OfficialReaderHeldPreflightResultV1 = Readonly<{
  readonly status: 'held';
  readonly reason: typeof OFFICIAL_READER_HELD_DISCLOSURE_REASON_V1;
  readonly publicDisclosureAuthorized: false;
}>;

export class OfficialReaderHeldPreflightErrorV1 extends Error {
  readonly code = 'FINAL_DISCLOSURE_UNAVAILABLE' as const;

  constructor() {
    super('Official Reader final disclosure is unavailable.');
    this.name = 'OfficialReaderHeldPreflightErrorV1';
  }
}

const CURRENT_DB_CLOCK_SQL =
  'select clock_timestamp()::text as "effectiveAt"';

const comparableScopeKeys: readonly (keyof OfficialReadingReaderAdmissionScopeV1)[] =
  Object.freeze([
    'subjectId', 'threadId', 'contentRevision', 'readingId', 'readerCharacterId',
    'readerContentBundleId', 'contentReleaseId', 'productId', 'productSpecVersion',
    'sajuDomain', 'readingContractVersion', 'officialArtifactResponseHash',
    'productRuleVersion', 'approvedPolicyRevision',
  ]);

async function readDbEffectiveAt(
  scope: PostgresSubjectExecutionScopeV1,
): Promise<string> {
  const result = await scope.client.query<{ effectiveAt: unknown }>(CURRENT_DB_CLOCK_SQL);
  const row = result.rows[0];
  const value = row?.effectiveAt;
  if (result.rows.length !== 1 ||
      typeof value !== 'string' ||
      !Number.isFinite(Date.parse(value))) {
    throw new OfficialReaderHeldPreflightErrorV1();
  }
  return value;
}

function assertOwnScope(
  scope: PostgresSubjectExecutionScopeV1,
  prepared: PreparedOfficialReadingReaderAdmissionV1,
  effectiveAt: string,
): void {
  if (prepared.scope.subjectId !== scope.resolvedSubject.subjectId ||
      prepared.scope.effectiveAt !== effectiveAt) {
    throw new OfficialReaderHeldPreflightErrorV1();
  }
}

function assertNoDrift(
  before: OfficialReadingReaderAdmissionScopeV1,
  after: OfficialReadingReaderAdmissionScopeV1,
): void {
  if (comparableScopeKeys.some((key) => before[key] !== after[key])) {
    throw new OfficialReaderHeldPreflightErrorV1();
  }
}

/**
 * S4 PRE-APPROVAL guard at the PRIVATE generation boundary.
 *
 * The result is immediately discarded; do not allow any nested HTTP/stream,
 * binary, error, callback, proxy accessor, or exotic object to carry protected
 * text into a deferred log/transport/serialization sink.
 *
 * This bounds only the return *shape*; it cannot inspect side effects in the
 * provider callback or authorize data retention / publication.
 */
function assertNotDeliverablePrivateResult(result: unknown): void {
  const seen = new WeakSet<object>();
  const todo: { value: unknown; depth: number }[] = [{ value: result, depth: 0 }];
  let count = 0;
  while (todo.length > 0) {
    const item = todo.pop()!;
    if (++count > 512 || item.depth > 16) {
      throw new OfficialReaderHeldPreflightErrorV1();
    }
    const value = item.value;
    if (value === null || value === undefined ||
        typeof value === 'string' || typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))) {
      continue;
    }
    if (typeof value !== 'object' || seen.has(value)) {
      throw new OfficialReaderHeldPreflightErrorV1();
    }
    seen.add(value);
    // Plain records and arrays only; reject Request/Response, streams, Blob,
    // FormData, Buffer, Error, Map/Set, Date, Promise and class instances.
    const prototype: unknown = Object.getPrototypeOf(value);
    const array = Array.isArray(value);
    if (array ? prototype !== Array.prototype
      : (prototype !== Object.prototype && prototype !== null)) {
      throw new OfficialReaderHeldPreflightErrorV1();
    }
    // Never execute a property getter (including a deferred toJSON callback).
    // Reject symbol keys and non-value descriptors; no serialization here.
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        throw new OfficialReaderHeldPreflightErrorV1();
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        throw new OfficialReaderHeldPreflightErrorV1();
      }
      todo.push({ value: descriptor.value, depth: item.depth + 1 });
    }
  }
}

/**
 * The only successful return is a HOLD without interpretation or its hash.
 * A future positive T2 must be a separate Owner-reviewed DB/Commerce change
 * with R2 writer participation, commit/send ordering and operational E2E.
 */
export async function runOfficialReaderHeldT1T2PreflightV1(
  input: OfficialReaderHeldPreflightInputV1,
): Promise<OfficialReaderHeldPreflightResultV1> {
  try {
    const first = await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      execute: async (scope) => {
        const effectiveAt = await readDbEffectiveAt(scope);
        const prepared = await input.prepareAdmission(
          scope,effectiveAt,
          createOfficialReaderPrivateCurrentPurchaseAuthorityPortV1(scope),
        );
        assertOwnScope(scope, prepared, effectiveAt);
        return prepared;
      },
    });

    // This callback cannot receive or hold a PostgreSQL transaction scope.
    // Its return value is deliberately discarded before the second transaction.
    const privateGenerated = await input.generatePrivate(first.source);
    // No browser-facing HTTP, binary body or streaming delivery can be used
    // as the staging result. Everything else is also discarded, not persisted.
    assertNotDeliverablePrivateResult(privateGenerated);

    await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      execute: async (scope) => {
        const effectiveAt = await readDbEffectiveAt(scope);
        const current = await input.prepareAdmission(
          scope,effectiveAt,
          createOfficialReaderPrivateCurrentPurchaseAuthorityPortV1(scope),
        );
        assertOwnScope(scope, current, effectiveAt);
        assertNoDrift(first.scope, current.scope);
        consumeOfficialReadingReaderAdmissionV1({
          ticket: current.ticket, expectedScope: current.scope,
        });
        consumeOfficialReadingReaderAdmissionV1({
          ticket: first.ticket, expectedScope: first.scope,
        });
      },
    });
  } catch {
    // Never propagate raw artifact, private generation, DB identifiers or provider errors.
    throw new OfficialReaderHeldPreflightErrorV1();
  }

  return Object.freeze({
    status: 'held',
    reason: OFFICIAL_READER_HELD_DISCLOSURE_REASON_V1,
    publicDisclosureAuthorized: false,
  });
}
