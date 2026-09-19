import {
  STANDARD_READING_UNIT_BIND_AUTHORITY_BINDING_V1,
  StandardReadingUnitBindAuthorityPortErrorV1,
  type StandardReadingUnitBindAuthorityPortV1,
  type StandardReadingUnitBindAuthorityRowV1,
} from './standard-reading-unit-bind-command-v1.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export { STANDARD_READING_UNIT_BIND_AUTHORITY_BINDING_V1 };

type UnitBindQueryRowV1 = Readonly<{
  purchaseIntentId: unknown;
  entitlementGrantId: unknown;
  productId: unknown;
  readerCharacterId: unknown;
  readerContentBundleId: unknown;
  readingSessionId: unknown;
  readingId: unknown;
  attemptNo: unknown;
  sourceBirthRevisionId: unknown;
  sajuDomain: unknown;
  domainCapabilityVersion: unknown;
  replayed: unknown;
}>;

const BIND_SQL = `
select
  purchase_intent_id::text as "purchaseIntentId",
  entitlement_grant_id::text as "entitlementGrantId",
  product_id::text as "productId",
  reader_character_id as "readerCharacterId",
  reader_content_bundle_id::text as "readerContentBundleId",
  reading_session_id::text as "readingSessionId",
  reading_id::text as "readingId",
  attempt_no as "attemptNo",
  source_birth_revision_id::text as "sourceBirthRevisionId",
  saju_domain as "sajuDomain",
  domain_capability_version as "domainCapabilityVersion",
  replayed
from public.cmd_bind_standard_reading_unit_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5::text,
  $6::text,
  $7::jsonb,
  $8::uuid
)
`.trim();

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

function postgresCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { code?: unknown }).code;
  return typeof value === 'string' ? value : null;
}

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Standard Reading unit PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function requireAttemptNo(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('Standard Reading unit PostgreSQL attempt number is invalid.');
  }
  return value;
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Standard Reading unit PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function mapRows(rows: readonly UnitBindQueryRowV1[]): readonly StandardReadingUnitBindAuthorityRowV1[] {
  return Object.freeze(rows.map((row) => Object.freeze({
    purchaseIntentId: requireString('Purchase Intent id', row.purchaseIntentId),
    entitlementGrantId: requireString('Entitlement Grant id', row.entitlementGrantId),
    productId: requireString('Product id', row.productId),
    readerCharacterId: requireString('Reader Character id', row.readerCharacterId),
    readerContentBundleId: requireString('Reader content bundle id', row.readerContentBundleId),
    readingSessionId: requireString('Reading Session id', row.readingSessionId),
    readingId: requireString('Reading id', row.readingId),
    attemptNo: requireAttemptNo(row.attemptNo),
    sourceBirthRevisionId: requireString('source Birth revision id', row.sourceBirthRevisionId),
    sajuDomain: requireString('Saju domain', row.sajuDomain),
    domainCapabilityVersion: requireString('domain capability version', row.domainCapabilityVersion),
    replayed: requireBoolean('replay marker', row.replayed),
  })));
}

function fail(
  code: ConstructorParameters<typeof StandardReadingUnitBindAuthorityPortErrorV1>[0],
  message: string,
): never {
  throw new StandardReadingUnitBindAuthorityPortErrorV1(code, message);
}

function mapPostgresError(error: unknown): never {
  const constraint = postgresConstraint(error);

  switch (constraint) {
    case 'cmd_standard_reading_unit_subject_ineligible':
      return fail('SUBJECT_INELIGIBLE', 'Standard Reading unit subject is ineligible.');
    case 'cmd_standard_reading_unit_purchase_unavailable':
      return fail('PURCHASE_UNAVAILABLE', 'Verified Standard Reading Purchase Intent is unavailable.');
    case 'cmd_standard_reading_unit_reader_provenance_unavailable':
      return fail('READER_PROVENANCE_UNAVAILABLE', 'Reader purchase provenance is unavailable.');
    case 'cmd_standard_reading_unit_capability_unavailable':
      return fail('CAPABILITY_UNAVAILABLE', 'Pinned Standard Reading capability is unavailable.');
    case 'cmd_standard_reading_unit_entitlement_unavailable':
      return fail('ENTITLEMENT_UNAVAILABLE', 'Purchase-backed active entitlement Grant is unavailable.');
    case 'cmd_standard_reading_unit_entitlement_ambiguous':
      return fail('ENTITLEMENT_AMBIGUOUS', 'Purchase-backed entitlement Grant is ambiguous.');
    case 'cmd_reading_create_source_profile_not_found':
      return fail('SOURCE_PROFILE_NOT_FOUND', 'Source Birth Profile was not found.');
    case 'cmd_reading_create_source_profile_not_ready':
      return fail('SOURCE_PROFILE_NOT_READY', 'Source Birth Profile has no current revision.');
    case 'ct_reading_session_profile_cardinality':
      return fail('PROFILE_CARDINALITY_INVALID', 'Reading Birth Profile cardinality was rejected.');
    case 'ct_reading_session_domain_available':
      return fail('DOMAIN_UNAVAILABLE', 'Standard Reading Saju domain is unavailable.');
    case 'ct_reading_character_capability':
      return fail('READER_CAPABILITY_UNAVAILABLE', 'Selected Reader cannot initiate this Saju domain.');
    case 'cmd_reading_create_idempotency_conflict':
      return fail('IDEMPOTENCY_CONFLICT', 'Reading idempotency identity conflicts.');
    case 'cmd_standard_reading_unit_binding_conflict':
    case 'cmd_standard_reading_unit_orphan_replay':
      return fail('BINDING_CONFLICT', 'Standard Reading unit binding conflicts with stored provenance.');
    case 'cmd_standard_reading_unit_ids_required':
    case 'cmd_standard_reading_unit_request_contract':
    case 'cmd_standard_reading_unit_request_snapshot':
    case 'cmd_standard_reading_unit_request_hash':
      return fail('INVALID_INPUT', 'Standard Reading unit bind input was rejected.');
    case 'cmd_reading_create_ids_required':
      return fail('SERVER_ID_CONFLICT', 'Trusted Reading identity was rejected.');
    default:
      if (postgresCode(error) === '23505') {
        return fail('SERVER_ID_CONFLICT', 'Trusted Standard Reading unit identity conflicted.');
      }
      throw error;
  }
}

class PostgresStandardReadingUnitBindAuthorityPortV1
implements StandardReadingUnitBindAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async bindUnit(
    input: Parameters<StandardReadingUnitBindAuthorityPortV1['bindUnit']>[0],
  ): Promise<readonly StandardReadingUnitBindAuthorityRowV1[]> {
    try {
      const result = await this.client.query<UnitBindQueryRowV1>(BIND_SQL, [
        input.subjectId,
        input.purchaseIntentId,
        input.readingSessionId,
        input.readingId,
        input.requestHash,
        input.requestContractVersion,
        JSON.stringify(input.requestSnapshotJsonb),
        input.sourceBirthProfileId,
      ]);
      return mapRows(result.rows);
    } catch (error) {
      return mapPostgresError(error);
    }
  }
}

export function createPostgresStandardReadingUnitBindAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): StandardReadingUnitBindAuthorityPortV1 {
  return new PostgresStandardReadingUnitBindAuthorityPortV1(client);
}
