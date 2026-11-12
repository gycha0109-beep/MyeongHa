import {
  SAJU_READING_COMPONENTS_V1, type SajuReadingComponentV1,
} from '../../../packages/contracts/src/approved-saju-catalog.js';
import type { ApprovedSajuPurchaseReadingV1 } from '../../../packages/api-client/src/records.js';
import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
} from './character-standard-reading-knowledge.js';
import type { OfficialReadingRecordReadAuthorityPortV1 } from './official-reading-record-read.js';
import type { OfficialReaderPrivateCurrentPurchaseAuthorityPortV1 } from './official-reader-private-exact-verified-purchase-guard-v1.js';
import {
  executePostgresApprovedSajuIssuerTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import type { OfficialReadingCharacterGroundingProjectionInputV1 } from './reader-interpretation-preview-runtime-v1.js';
import { projectSajuCanonicalReaderGroundingV1 } from './saju-canonical-reader-source-v1.js';
import {
  verifyArchivedSajuProductionIssueProofV1,
  type SajuProductionIssueProofTrustV1,
} from './saju-production-reading-issue-source-v1.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

export interface ApprovedSajuCanonicalReaderAuthorityV1 {
  readonly pool: PostgresSubjectPoolV1;
  readonly trusts: readonly SajuProductionIssueProofTrustV1[];
}

/** Resolve the same private source for the purchased Reader scene and its follow-up. */
export async function readPostgresApprovedSajuCanonicalReaderV1(input: Readonly<{
  authority: ApprovedSajuCanonicalReaderAuthorityV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  subjectId: string;
  artifact: OfficialReadingCharacterGroundingProjectionInputV1;
}>) {
  const { artifact, authority, subjectId, verifiedEvidence } = input;
  if (verifiedEvidence.kind !== 'member' || authority.trusts.length === 0) {
    throw new Error('Signed canonical Reader source requires a verified member.');
  }
  const receipt = await executePostgresApprovedSajuIssuerTransactionV1({
    pool: authority.pool, verifiedEvidence,
    execute: async ({ client, resolvedSubject }) => {
      if (resolvedSubject.subjectId !== subjectId) return null;
      const { rows } = await client.query<{ receipt: { originatingGrantId?: unknown } | null }>(
        'select public.qry_approved_saju_source_issue_proof_v1($1::uuid,$2::uuid) as receipt',
        [resolvedSubject.subjectId, artifact.readingId],
      );
      return rows.length === 1 ? rows[0]?.receipt ?? null : null;
    },
  });
  const verified = verifyArchivedSajuProductionIssueProofV1({
    receipt, trusts: authority.trusts, readingId: artifact.readingId,
    storedResponse: artifact.responseSnapshotJsonb, storedResponseHash: artifact.officialArtifactResponseHash,
  });
  const grant = receipt?.originatingGrantId;
  if (verified?.readerSource === undefined || typeof grant !== 'string' ||
    !/^[a-f0-9]{8}-[0-9a-f]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(grant)) {
    throw new Error('Signed canonical Reader source is unavailable.');
  }
  const grounding = projectSajuCanonicalReaderGroundingV1(verified.readerSource, {
    readingId: artifact.readingId, storedResponseHash: artifact.officialArtifactResponseHash, sajuDomain: artifact.sajuDomain,
  });
  if (grounding.engineVersion !== artifact.sajuEngineVersion ||
    grounding.productResponseVersion !== artifact.readingContractVersion ||
    artifact.productResponseState !== 'delivered') throw new Error('Canonical Reader source does not match the archive.');
  return Object.freeze({
    grounding, originatingGrantId: grant,
    issueIdentity: Object.freeze({
      sourceProofFingerprint: verified.sourceProofFingerprint,
      nativeSourceResponseHash: verified.nativeSourceResponseHash,
      executionAttemptId: verified.executionAttemptId,
    }),
  });
}

const READ_SQL = `
select reading_id::text as "readingId",reading_session_id::text as "readingSessionId",
  product_id::text as "productId",saju_domain as "sajuDomain",component,
  source_birth_revision_id::text as "sourceBirthRevisionId",reader_character_id as "readerCharacterId",
  reader_content_bundle_id::text as "readerContentBundleId",domain_capability_version as "domainCapabilityVersion",
  saju_engine_version as "sajuEngineVersion",reading_contract_version as "readingContractVersion",
  product_response_state as "productResponseState",response_snapshot_jsonb as "responseSnapshotJsonb",
  response_hash as "responseHash",completed_at::text as "completedAt",
  issued_revision_no as "issuedRevisionNo",current_revision_no as "currentRevisionNo"
from public.qry_approved_saju_component_record_v1($1::uuid,$2::uuid,$3::text,$4::boolean)
`.trim();

/** Server-only archive manifest, read inside the existing canonical subject transaction. */
export async function readPostgresApprovedSajuPurchaseReadingsV1(
  client: PostgresTransactionQueryV1,
  subjectId: string,
  purchaseIntentId: string,
): Promise<readonly ApprovedSajuPurchaseReadingV1[]> {
  const { rows } = await client.query<{
    component: string;
    readingId: string | null;
    readingSessionId: string | null;
    sajuDomain: string | null;
    readerCharacterId: string | null;
    completedAt: string | null;
  }>(`
    select component,reading_id::text as "readingId",reading_session_id::text as "readingSessionId",
      saju_domain as "sajuDomain",reader_character_id as "readerCharacterId",
      completed_at::text as "completedAt"
    from public.qry_approved_saju_purchase_readings_v1($1::uuid,$2::uuid)
  `.trim(), [subjectId, purchaseIntentId]);
  const components = new Set<string>();
  return rows.map(({ component, readingId, readingSessionId, sajuDomain, readerCharacterId, completedAt }) => {
    if (!Object.hasOwn(SAJU_READING_COMPONENTS_V1, component) || components.has(component)) {
      throw new Error('Approved Saju archive manifest returned an invalid component.');
    }
    components.add(component);
    const key = component as SajuReadingComponentV1;
    if (readingId === null && readingSessionId === null && sajuDomain === null && readerCharacterId === null && completedAt === null) {
      return { component: key, state: 'pending' };
    }
    const domain = SAJU_READING_COMPONENTS_V1[key].domain;
    if (!readingId || !readingSessionId || sajuDomain !== domain || !readerCharacterId
      || !completedAt || !Number.isFinite(Date.parse(completedAt))) {
      throw new Error('Approved Saju archive manifest returned an incomplete Reading.');
    }
    return {
      component: key, state: 'ready', readingId, readingSessionId, sajuDomain: domain,
      readerCharacterId, completedAt: new Date(completedAt).toISOString(),
    };
  });
}

interface ApprovedReadingRow {
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly productId: string;
  readonly sajuDomain: string;
  readonly component: string;
  readonly sourceBirthRevisionId: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
  readonly domainCapabilityVersion: string;
  readonly sajuEngineVersion: string;
  readonly readingContractVersion: string;
  readonly productResponseState: string;
  readonly responseSnapshotJsonb: unknown;
  readonly responseHash: string;
  readonly completedAt: string;
  readonly issuedRevisionNo: number;
  readonly currentRevisionNo: number | null;
}

/** Request-scoped Records/Reader adapters. Use the canonical subject transaction
 * and a server-validated Reading selector. The Reader metadata query returns no body. */
export function createPostgresApprovedSajuReadingAccessV1(
  client: PostgresTransactionQueryV1,
  readingId: string,
): Readonly<{
  recordPort: OfficialReadingRecordReadAuthorityPortV1;
  accessPort: CharacterStandardReadingAccessAuthorityPortV1;
  artifactPort: CharacterStandardReadingArtifactAuthorityPortV1;
  purchasePort: OfficialReaderPrivateCurrentPurchaseAuthorityPortV1;
}> {
  async function read(subjectId: string, reader: string | null, includePayload: boolean) {
    const { rows } = await client.query<ApprovedReadingRow>(READ_SQL, [subjectId, readingId, reader, includePayload]);
    const row = rows[0];
    if (rows.length > 1 || (row !== undefined && (row.readingId !== readingId
      || (reader !== null && row.readerCharacterId !== reader)
      || (!includePayload && row.responseSnapshotJsonb !== null)))) {
      throw new Error('Approved Saju Reading returned inconsistent authority.');
    }
    return row;
  }

  return {
    purchasePort: {
      async assertCurrentVerifiedPurchase(input) {
        const row = input.readingId === readingId
          ? await read(input.subjectId, input.readerCharacterId, false) : undefined;
        if (row === undefined || row.readerContentBundleId !== input.readerContentBundleId) {
          throw new Error('Approved Saju Reading purchase is unavailable for this Reader.');
        }
      },
    },
    recordPort: {
      async readRecord(input) {
        if (input.readingId !== readingId) return null;
        const row = await read(input.subjectId, null, true);
        if (row === undefined) return null;
        const { issuedRevisionNo, currentRevisionNo } = row;
        return {
          readingId: row.readingId, readingSessionId: row.readingSessionId, sajuDomain: row.sajuDomain,
          readingContractVersion: row.readingContractVersion, productResponseState: row.productResponseState,
          responseSnapshotJsonb: row.responseSnapshotJsonb, responseHash: row.responseHash,
          readerCharacterIds: [row.readerCharacterId], completedAt: row.completedAt,
          birthRevision: {
            issuedRevisionNo, currentRevisionNo,
            state: currentRevisionNo === null ? 'unknown' : currentRevisionNo === issuedRevisionNo ? 'current' : 'changed',
          },
        };
      },
    },
    accessPort: {
      async readAccessibleReadings(input) {
        const row = await read(input.subjectId, input.readerCharacterId, false);
        if (row === undefined) return [];
        return [{
          subjectId: input.subjectId, readingId: row.readingId, readingSessionId: row.readingSessionId,
          productId: row.productId, readerCharacterId: row.readerCharacterId, readerContentBundleId: row.readerContentBundleId,
          topicKey: row.component, sajuDomain: row.sajuDomain,
          readingPeriod: row.component === 'year' ? 'annual' : row.component === 'month' ? 'monthly' : 'natal',
          readingVariant: row.component === 'compatibility' ? 'comparison' : 'default',
          sourceBirthRevisionId: row.sourceBirthRevisionId, productSpecVersion: 'approved-saju-2026-11-06',
          domainCapabilityVersion: row.domainCapabilityVersion, readingContractVersion: row.readingContractVersion,
          sajuEngineVersion: row.sajuEngineVersion, responseHash: row.responseHash,
        }];
      },
    },
    artifactPort: {
      async readArtifactSource(input) {
        if (input.readingId !== readingId) return [];
        const row = await read(input.subjectId, input.readerCharacterId, true);
        if (row === undefined) return [];
        return [{
          readingId: row.readingId, productId: row.productId, readerCharacterId: row.readerCharacterId,
          readingContractVersion: row.readingContractVersion, productResponseState: row.productResponseState,
          responseSnapshotJsonb: row.responseSnapshotJsonb, responseHash: row.responseHash, completedAt: row.completedAt,
        }];
      },
    },
  };
}
