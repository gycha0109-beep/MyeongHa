import {
  STANDARD_READING_ACCESS_BIND_AUTHORITY_BINDING_V2,
  StandardReadingAccessBindAuthorityPortErrorV2,
  type StandardReadingAccessBindAuthorityPortV2,
  type StandardReadingAccessBindAuthorityRowV2,
  type StandardReadingAccessRoleV2,
} from './standard-reading-access-bind-command-v2.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export { STANDARD_READING_ACCESS_BIND_AUTHORITY_BINDING_V2 };

type AccessBindQueryRowV2 = Readonly<{
  purchaseIntentId: unknown;
  entitlementGrantId: unknown;
  productId: unknown;
  readerCharacterId: unknown;
  readerContentBundleId: unknown;
  readingSessionId: unknown;
  readingId: unknown;
  sourceBirthRevisionId: unknown;
  sajuDomain: unknown;
  domainCapabilityVersion: unknown;
  accessRole: unknown;
  officialReadingCreated: unknown;
  interpretationCreated: unknown;
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
  source_birth_revision_id::text as "sourceBirthRevisionId",
  saju_domain as "sajuDomain",
  domain_capability_version as "domainCapabilityVersion",
  access_role as "accessRole",
  official_reading_created as "officialReadingCreated",
  interpretation_created as "interpretationCreated",
  replayed
from public.cmd_bind_standard_reading_access_v2(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5::text,
  $6::text,
  $7::jsonb
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
    throw new Error(`Standard Reading access PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Standard Reading access PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function requireAccessRole(value: unknown): StandardReadingAccessRoleV2 {
  if (value !== 'initial_reader' && value !== 'additional_reader') {
    throw new Error('Standard Reading access PostgreSQL access role is invalid.');
  }
  return value;
}

function mapRows(rows: readonly AccessBindQueryRowV2[]): readonly StandardReadingAccessBindAuthorityRowV2[] {
  return Object.freeze(rows.map((row) => Object.freeze({
    purchaseIntentId: requireString('Purchase Intent id', row.purchaseIntentId),
    entitlementGrantId: requireString('Entitlement Grant id', row.entitlementGrantId),
    productId: requireString('Product id', row.productId),
    readerCharacterId: requireString('Reader Character id', row.readerCharacterId),
    readerContentBundleId: requireString('Reader content bundle id', row.readerContentBundleId),
    readingSessionId: requireString('Reading Session id', row.readingSessionId),
    readingId: requireString('Reading id', row.readingId),
    sourceBirthRevisionId: requireString('source Birth revision id', row.sourceBirthRevisionId),
    sajuDomain: requireString('Saju domain', row.sajuDomain),
    domainCapabilityVersion: requireString('domain capability version', row.domainCapabilityVersion),
    accessRole: requireAccessRole(row.accessRole),
    officialReadingCreated: requireBoolean('official Reading creation marker', row.officialReadingCreated),
    interpretationCreated: requireBoolean('Reader Interpretation creation marker', row.interpretationCreated),
    replayed: requireBoolean('replay marker', row.replayed),
  })));
}

function fail(
  code: ConstructorParameters<typeof StandardReadingAccessBindAuthorityPortErrorV2>[0],
  message: string,
): never {
  throw new StandardReadingAccessBindAuthorityPortErrorV2(code, message);
}

function mapPostgresError(error: unknown): never {
  const constraint = postgresConstraint(error);

  switch (constraint) {
    case 'cmd_standard_reading_access_v2_subject_ineligible':
      return fail('SUBJECT_INELIGIBLE', 'Standard Reading access subject is ineligible.');
    case 'cmd_standard_reading_access_v2_purchase_unavailable':
      return fail('PURCHASE_UNAVAILABLE', 'Verified Standard Reading Purchase Intent is unavailable.');
    case 'cmd_standard_reading_access_v2_reader_provenance_unavailable':
      return fail('READER_PROVENANCE_UNAVAILABLE', 'Reader purchase provenance is unavailable.');
    case 'cmd_standard_reading_access_v2_capability_unavailable':
      return fail('CAPABILITY_UNAVAILABLE', 'Pinned Standard Reading capability is unavailable.');
    case 'cmd_standard_reading_access_v2_entitlement_unavailable':
      return fail('ENTITLEMENT_UNAVAILABLE', 'Purchase-backed active Entitlement Grant is unavailable.');
    case 'cmd_standard_reading_access_v2_entitlement_ambiguous':
      return fail('ENTITLEMENT_AMBIGUOUS', 'Purchase-backed Entitlement Grant is ambiguous.');
    case 'cmd_standard_reading_access_v2_source_profile_unavailable':
    case 'cmd_reading_create_source_profile_not_found':
      return fail('SOURCE_PROFILE_NOT_FOUND', 'Source Birth Profile was not found.');
    case 'cmd_standard_reading_access_v2_source_profile_not_ready':
    case 'cmd_reading_create_source_profile_not_ready':
      return fail('SOURCE_PROFILE_NOT_READY', 'Source Birth Profile has no current revision.');
    case 'cmd_standard_reading_access_v2_domain_unavailable':
    case 'ct_reading_session_domain_available':
      return fail('DOMAIN_UNAVAILABLE', 'Standard Reading Saju domain is unavailable.');
    case 'cmd_standard_reading_access_v2_reader_capability_unavailable':
    case 'ct_reading_character_capability':
      return fail('READER_CAPABILITY_UNAVAILABLE', 'Selected Reader cannot initiate this Saju domain.');
    case 'cmd_standard_reading_access_v2_official_not_reusable':
      return fail('OFFICIAL_READING_NOT_REUSABLE', 'Existing official Reading is not reusable.');
    case 'cmd_reading_create_idempotency_conflict':
      return fail('IDEMPOTENCY_CONFLICT', 'Official Reading idempotency identity conflicts.');
    case 'cmd_standard_reading_access_v2_binding_conflict':
    case 'cmd_standard_reading_access_v2_orphan_replay':
      return fail('BINDING_CONFLICT', 'Standard Reading access binding conflicts with stored provenance.');
    case 'cmd_standard_reading_access_v2_ids_required':
    case 'cmd_standard_reading_access_v2_request_contract':
    case 'cmd_standard_reading_access_v2_request_snapshot':
    case 'cmd_standard_reading_access_v2_request_hash':
      return fail('INVALID_INPUT', 'Standard Reading access bind input was rejected.');
    case 'cmd_reading_create_ids_required':
      return fail('SERVER_ID_CONFLICT', 'Trusted Reading identity was rejected.');
    default:
      if (postgresCode(error) === '23505') {
        return fail('SERVER_ID_CONFLICT', 'Trusted Standard Reading access identity conflicted.');
      }
      throw error;
  }
}

class PostgresStandardReadingAccessBindAuthorityPortV2
implements StandardReadingAccessBindAuthorityPortV2 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async bindAccess(
    input: Parameters<StandardReadingAccessBindAuthorityPortV2['bindAccess']>[0],
  ): Promise<readonly StandardReadingAccessBindAuthorityRowV2[]> {
    try {
      const result = await this.client.query<AccessBindQueryRowV2>(BIND_SQL, [
        input.subjectId,
        input.purchaseIntentId,
        input.proposedReadingSessionId,
        input.proposedReadingId,
        input.requestHash,
        input.requestContractVersion,
        JSON.stringify(input.requestSnapshotJsonb),
      ]);
      return mapRows(result.rows);
    } catch (error) {
      return mapPostgresError(error);
    }
  }
}

export function createPostgresStandardReadingAccessBindAuthorityPortV2(
  client: PostgresTransactionQueryV1,
): StandardReadingAccessBindAuthorityPortV2 {
  return new PostgresStandardReadingAccessBindAuthorityPortV2(client);
}
