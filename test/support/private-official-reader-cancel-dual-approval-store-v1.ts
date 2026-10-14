/**
 * D3e8 isolated DB-owner adapter only. Do NOT import into production HTTP
 * runtime. SQL 1950 performs one atomic statement for durable challenge fence,
 * D3e6 review action, and temporary linked approval receipt.
 */
import type { PostgresSubjectPoolV1 } from '../../apps/api/src/postgres-subject-execution.js';
import type {
  PrivateCancelReviewAuthorizedStoreV1,
} from '../../apps/api/src/official-reader-portone-cancel-private-dual-approval-v1.js';

const SQL = [
  'select review_state as "reviewState",',
  'authorization_receipt_id::text as "authorizationReceiptId",',
  'effect_authorized as "effectAuthorized"',
  'from public.internal_private_cancel_commit_review_approval_v1(',
  '$1::uuid,$2::text,$3::text,$4::uuid,$5::timestamptz,$6::timestamptz,',
  '$7::text,$8::text,$9::text,$10::text,$11::text)',
].join(' ');

export function createPrivateCancelDualApprovalStoreTestV1(
  pool: PostgresSubjectPoolV1,
): PrivateCancelReviewAuthorizedStoreV1 {
  return Object.freeze({
    async commitAuthorizedReview(data: Parameters<PrivateCancelReviewAuthorizedStoreV1['commitAuthorizedReview']>[0]) {
      const client=await pool.connect();
      try {
        // Each SQL invocation is a single autocommitted database statement.
        // The 1950 SQL function performs the D3e6 review and approval insert
        // in the same DB transaction; any failure undoes both.
        const response=await client.query<Record<string,unknown>>(SQL,[
          data.inboxId,data.action,data.ticketReference,data.challengeId,
          data.issuedAt,data.expiresAt,data.requesterKeyId,data.approverKeyId,
          data.requesterPrincipalId,data.approverPrincipalId,data.statementDigest,
        ]);
        if (response.rows.length!==1 || !response.rows[0]) {
          throw new Error('Private signed review DB returned invalid row cardinality.');
        }
        return response.rows[0];
      } finally {client.release();}
    },
  });
}
