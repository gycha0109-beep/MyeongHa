import type {
  PreparedOfficialReadingReaderAdmissionV1,
} from './official-reading-reader-admission-v1.js';
import type {
  PostgresSubjectExecutionScopeV1,
} from './postgres-subject-execution.js';

/**
 * S2/T1/T2 private exact, fresh purchase check in the same DB transaction
 * that resolved the canonical Subject and pinned Official Source authority.
 *
 * The 1270 Reader metadata path admits active Grants but does NOT attest
 * original Commerce Receipt status. This additional S1-locked gate prevents
 * generation or context reuse under a refund-revoked Receipt and disallows
 * a sibling Grant of a DIFFERENT Reader Bundle.
 *
 * No runtime EXECUTE ACL is issued by this module. Until DB/Saju/Privacy
 * approval the private SQL will fail closed. Never use this check as a
 * public paywall, memory permission or signed source assertion.
 */
export const OFFICIAL_READER_CURRENT_VERIFIED_PURCHASE_GUARD_VERSION_V1 =
  'official-reader-s2-exact-current-purchase-bundle-v1' as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const READER = /^[a-z][a-z0-9_-]{0,63}$/u;
const VERIFY_SQL = `
select public.internal_assert_official_reader_current_verified_purchase_bundle_v1(
  $1::uuid,$2::uuid,$3::text,$4::uuid
) as "guardExecuted"
`;

export class OfficialReaderCurrentVerifiedPurchaseDeniedV1 extends Error {
  readonly code = 'OFFICIAL_READER_PURCHASE_UNAVAILABLE' as const;
  constructor() {
    super('Reader current verified purchase is unavailable.');
    this.name = 'OfficialReaderCurrentVerifiedPurchaseDeniedV1';
  }
}

function deny(): never {
  throw new OfficialReaderCurrentVerifiedPurchaseDeniedV1();
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) return deny();
  return value.toLowerCase();
}

/** The caller must not hold an old DB snapshot or a cached Reader ticket. */
export async function assertOfficialReaderPrivateCurrentVerifiedPurchaseV1(
  input: Readonly<{
    scope: PostgresSubjectExecutionScopeV1;
    admission: PreparedOfficialReadingReaderAdmissionV1;
  }>,
): Promise<void> {
  try {
    const { scope, admission } = input;
    const present = admission.scope;
    const subjectId = uuid(scope.resolvedSubject.subjectId);
    if (scope.resolvedSubject.subjectKind !== 'member'
        || uuid(present.subjectId) !== subjectId
        || !READER.test(present.readerCharacterId)
        || !UUID.test(present.readerContentBundleId)
        || !UUID.test(present.threadId)
        || !Number.isFinite(Date.parse(present.effectiveAt))) return deny();

    const response = await scope.client.query<{guardExecuted: unknown}>(VERIFY_SQL, [
      subjectId,
      uuid(present.readingId),
      present.readerCharacterId,
      uuid(present.readerContentBundleId),
    ]);
    // Function returns PostgreSQL VOID (driver codecs may map that to
    // null or an empty string). One exactly shaped result proves the private
    // SQL ran to completion without throwing; it is not a public Grant.
    if (response.rows.length !== 1 || !response.rows[0]
        || !Object.hasOwn(response.rows[0], 'guardExecuted')) {
      return deny();
    }
  } catch {
    // No DB messages, Receipt status, original Subject or Grant identity may
    // leak into the private generator, the public paid reader or ordinary Chat.
    return deny();
  }
}
