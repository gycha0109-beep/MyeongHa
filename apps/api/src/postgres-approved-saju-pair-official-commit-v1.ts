import { randomUUID } from 'node:crypto';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import { executePostgresApprovedSajuIssuerTransactionV1,
  type PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { readApprovedSajuPairIssueScopeV1 } from './postgres-approved-saju-issue-scope-v1.js';
import { hashSajuHeldSourceProofRequestV1 as hashJson } from './saju-held-source-proof-verifier-v1.js';
import { projectSignedSajuT10PairProductReadingV1 } from './saju-t10-pair-official-product-reading-v1.js';
import { verifySajuT10ProductionPairIssueV1 } from './saju-t10-production-pair-issue-source-v1.js';

type SignedInput = Parameters<typeof verifySajuT10ProductionPairIssueV1>[0];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const FINALIZE = `
select reading_id::text as "readingId",execution_attempt_id::text as "executionAttemptId",
  response_hash as "responseHash",replayed
from public.cmd_finalize_approved_saju_pair_reading_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
  $6::text,$7::text,$8::text,$9::text,$10::text,
  $11::jsonb,$12::text,$13::jsonb
)`.trim();
type Row = {readingId:unknown; executionAttemptId:unknown; responseHash:unknown;replayed:unknown};
type Stored = {sourceBirthInputHash:unknown;targetBirthInputHash:unknown;
  attemptEngineVersion:unknown;sajuEngineVersion:unknown;readingContractVersion:unknown;
  productResponseState:unknown;storedResponseHash:unknown;storedSnapshot:unknown};

/** The separate T10 commit path, never the single-chart worker.
 * Trusted Source signature is rechecked against current DB purchase+consent
 * inside the same transaction that commits both immutable Reading and proof.
 */
export async function commitApprovedSajuT10OfficialPairReadingV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  subjectId: string;
  purchaseIntentId: string;
  readingId: string;
  executionAttemptId: string;
  outboxEventId?: string;
  expectedReleaseRef: string;
  source: Pick<SignedInput,'body' | 'proof' | 'trust'>;
}>) {
  if (input.verifiedEvidence.kind !== 'member' ||
      ![input.subjectId,input.purchaseIntentId,input.readingId,input.executionAttemptId]
        .every(x => UUID.test(x)) ||
      (input.outboxEventId !== undefined && !UUID.test(input.outboxEventId))) return null;

  return executePostgresApprovedSajuIssuerTransactionV1({
    pool: input.pool,verifiedEvidence: input.verifiedEvidence,
    execute: async ({client,resolvedSubject}) => {
      if (resolvedSubject.subjectId !== input.subjectId ||
          resolvedSubject.subjectKind !== 'member') return null;
      const scope = await readApprovedSajuPairIssueScopeV1(client,input);
      if (scope === null || scope.releaseRef !== input.expectedReleaseRef) return null;
      const verification: SignedInput = {
        scope,readingId:input.readingId,purchaseIntentId:input.purchaseIntentId,
        executionAttemptId:input.executionAttemptId,body:input.source.body,
        proof:input.source.proof,trust:input.source.trust,acceptedAtMs:Date.now(),
      };
      const projected = projectSignedSajuT10PairProductReadingV1(verification);
      if (projected === null) return null;
      const proof = input.source.proof as {payload:{executionAttemptId:string};signature:string};
      const envelope = {
        payload:proof.payload,signature:proof.signature,sourceBody:projected.sourceBody,
      };
      const externalRequestRef = 't10-pair-' + input.executionAttemptId;
      const eventId = input.outboxEventId ?? randomUUID();
      const {rows} = await client.query<Row>(FINALIZE,[
        input.subjectId,input.purchaseIntentId,input.readingId,
        input.executionAttemptId,eventId,scope.sourceRequestHash,
        externalRequestRef,input.source.trust.engineVersion,
        scope.sourceBirthInputHash,scope.targetBirthInputHash,
        JSON.stringify(projected.response),projected.storedResponseHash,
        JSON.stringify(envelope),
      ]);
      const row=rows[0];
      if (rows.length !== 1 || row?.readingId !== input.readingId ||
          row.executionAttemptId !== input.executionAttemptId ||
          row.responseHash !== projected.storedResponseHash ||
          typeof row.replayed !== 'boolean') {
        throw new Error('Committed pair Reading identity or hash changed.');
      }
      const recorded=await client.query<Stored>(`
        select source_birth_input_hash as "sourceBirthInputHash",
          target_birth_input_hash as "targetBirthInputHash",
          attempt_engine_version as "attemptEngineVersion",
          saju_engine_version as "sajuEngineVersion",
          reading_contract_version as "readingContractVersion",
          product_response_state as "productResponseState",
          stored_response_hash as "storedResponseHash",
          stored_snapshot as "storedSnapshot"
        from public.qry_approved_saju_stored_lineage_v1($1::uuid,$2::uuid,$3::uuid)
      `,[input.subjectId,input.readingId,input.executionAttemptId]);
      const stored=recorded.rows[0];
      if (recorded.rows.length !== 1 || !stored ||
          stored.sourceBirthInputHash !== scope.sourceBirthInputHash ||
          stored.targetBirthInputHash !== scope.targetBirthInputHash ||
          stored.sajuEngineVersion !== input.source.trust.engineVersion ||
          stored.attemptEngineVersion !== input.source.trust.engineVersion ||
          stored.readingContractVersion !== 'myeonghwa-product-reading-response-v2' ||
          stored.productResponseState !== 'delivered' ||
          stored.storedResponseHash !== projected.storedResponseHash ||
          hashJson(stored.storedSnapshot) !==
            projected.storedResponseHash.slice('sha256:v1:'.length)) {
        throw new Error('Pair archive does not preserve both Birth hashes or original Reading.');
      }
      const archive=await client.query<{receipt:unknown}>(`
        select public.qry_approved_saju_source_issue_proof_v1($1::uuid,$2::uuid) as receipt
      `,[input.subjectId,input.readingId]);
      const receipt=archive.rows[0]?.receipt;
      if (archive.rows.length !== 1 || receipt === null ||
          typeof receipt !== 'object' || Array.isArray(receipt) ||
          !receipt || !('proof' in receipt) ||
          hashJson(receipt.proof) !== hashJson(envelope)) {
        throw new Error('Pair archive lost its immutable signed source proof.');
      }
      return Object.freeze({
        state:'committed' as const,readingId:input.readingId,
        executionAttemptId:input.executionAttemptId,responseHash:projected.storedResponseHash,
        proofFingerprint:'sha256:v1:' + hashJson(envelope),
        replayed:row.replayed,
        // The caller must separately apply existing current Grant/Reader policies.
        canDisclose:false as const,canSell:false as const,
      });
    },
  });
}
