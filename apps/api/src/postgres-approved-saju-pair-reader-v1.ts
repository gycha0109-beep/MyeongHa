import { executePostgresApprovedSajuPairReaderTransactionV1,
  type PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import { readApprovedSajuPairReaderScopeV1 } from './postgres-approved-saju-issue-scope-v1.js';
import { projectSignedSajuT10PairProductReadingV1 } from './saju-t10-pair-official-product-reading-v1.js';
import { projectProductReadingResponseV2 } from '../../../packages/api-client/src/product-reading-display.js';
import { hashSajuHeldSourceProofRequestV1 as hashJson } from './saju-held-source-proof-verifier-v1.js';
import type { SajuT10ProductionPairTrustV1 } from './saju-t10-production-pair-issue-source-v1.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const VERSION = 'myeongha-t10-production-pair-issue-v1';
type RecordRow = {
  readingId: unknown; component: unknown; responseHash: unknown;
  responseSnapshotJsonb: unknown; productResponseState: unknown;
  readerCharacterId: unknown; sajuDomain: unknown;
  readingContractVersion: unknown;
};
type ReceiptRow = { receipt: unknown };
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Exact historical two-chart Reading for one authorized member and Reader.
 * Archive signature is verified using immutable DB acceptance time, while
 * current paid access and counterpart consent are checked again by the DB.
 */
export async function readPostgresApprovedSajuT10PairReaderV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  /** Optional internal expectation; the actual subject always comes from verified DB identity. */
  subjectId?: string;
  purchaseIntentId: string;
  readingId: string;
  readerCharacterId: string;
  trusts: readonly SajuT10ProductionPairTrustV1[];
}>) {
  if (input.verifiedEvidence.kind !== 'member' || input.trusts.length === 0 ||
      ![input.purchaseIntentId,input.readingId].every(value => UUID.test(value)) ||
      (input.subjectId !== undefined && !UUID.test(input.subjectId)) ||
      !input.readerCharacterId || input.readerCharacterId.length > 128) return null;
  return executePostgresApprovedSajuPairReaderTransactionV1({
    pool:input.pool,verifiedEvidence:input.verifiedEvidence,
    execute:async ({client,resolvedSubject}) => {
      if (resolvedSubject.subjectKind !== 'member' ||
          (input.subjectId !== undefined && resolvedSubject.subjectId !== input.subjectId)) return null;
      const subjectId=resolvedSubject.subjectId;
      const scope=await readApprovedSajuPairReaderScopeV1(client,{
        subjectId,purchaseIntentId:input.purchaseIntentId,
      });
      if (scope === null) return null;
      const result=await client.query<RecordRow>(`
        select reading_id::text as "readingId",component,response_hash as "responseHash",
          response_snapshot_jsonb as "responseSnapshotJsonb",
          product_response_state as "productResponseState",
          reader_character_id as "readerCharacterId",saju_domain as "sajuDomain",
          reading_contract_version as "readingContractVersion"
        from public.qry_approved_saju_component_record_v1($1::uuid,$2::uuid,$3::text,true)
      `,[subjectId,input.readingId,input.readerCharacterId]);
      const row=result.rows[0];
      if (result.rows.length !== 1 || !row ||
          row.readingId !== input.readingId ||
          row.component !== 'compatibility' || row.sajuDomain !== 'compatibility' ||
          row.readerCharacterId !== input.readerCharacterId ||
          row.readingContractVersion !== 'myeonghwa-product-reading-response-v2' ||
          row.productResponseState !== 'delivered' ||
          typeof row.responseHash !== 'string' ||
          row.responseHash !== 'sha256:v1:' + hashJson(row.responseSnapshotJsonb)) return null;

      const archived=await client.query<ReceiptRow>(
        'select public.qry_approved_saju_source_issue_proof_v1($1::uuid,$2::uuid) as receipt',
        [subjectId,input.readingId],
      );
      const receipt=archived.rows[0]?.receipt;
      if (archived.rows.length !== 1 || !record(receipt) ||
          !record(receipt.proof) || !record(receipt.proof.sourceBody) ||
          !record(receipt.proof.payload) || typeof receipt.proof.signature !== 'string' ||
          receipt.component !== 'compatibility' ||
          receipt.sourceRequestHash !== scope.sourceRequestHash ||
          receipt.releaseRef !== scope.releaseRef ||
          receipt.storedResponseHash !== row.responseHash ||
          typeof receipt.acceptedAt !== 'string' ||
          !Number.isFinite(Date.parse(receipt.acceptedAt)) ||
          typeof receipt.executionAttemptId !== 'string' ||
          !UUID.test(receipt.executionAttemptId) ||
          typeof receipt.originatingGrantId !== 'string' ||
          !UUID.test(receipt.originatingGrantId)) return null;
      const payload=receipt.proof.payload;
      if (payload.version !== VERSION || payload.readingId !== input.readingId ||
          payload.purchaseIntentId !== input.purchaseIntentId ||
          payload.executionAttemptId !== receipt.executionAttemptId) return null;
      for (const trust of input.trusts) {
        if (trust.keyId !== payload.keyId || trust.engineVersion !== payload.engineVersion ||
            trust.issuer !== payload.issuer || trust.audience !== payload.audience) continue;
        const projection=projectSignedSajuT10PairProductReadingV1({
          scope,readingId:input.readingId,purchaseIntentId:input.purchaseIntentId,
          executionAttemptId:receipt.executionAttemptId,
          body:receipt.proof.sourceBody,
          proof:{payload,signature:receipt.proof.signature},
          trust,acceptedAtMs:Date.parse(receipt.acceptedAt),
        });
        if (projection === null ||
            projection.storedResponseHash !== row.responseHash ||
            hashJson(projection.response) !== hashJson(row.responseSnapshotJsonb)) continue;
        const display=projectProductReadingResponseV2(row.responseSnapshotJsonb);
        if (display.kind !== 'delivered') return null;
        return Object.freeze({
          state:'signed_pair_archive_reopened' as const,
          readingId:input.readingId,
          readerCharacterId:input.readerCharacterId,
          originatingGrantId:receipt.originatingGrantId,
          sourceProofFingerprint:'sha256:v1:' + hashJson(receipt.proof),
          materialHash:projection.materialHash,
          display,
          // Grounding owner remains Saju; protected original paragraphs are exposed
          // without granting LLM permission to generate new relationship claims.
          sourceUnits:(projection.sourceBody as {units:readonly unknown[]}).units,
        });
      }
      return null;
    },
  });
}
