// Watchtower-Track: security
// S0 withdrawal + issued-response receipt never require a metered model or
// governed cost DB. Both use the existing canonical Subject/receipt commands.
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { executePostgresSubjectTransactionV1 } from './postgres-subject-execution.js';
import {
  handleSeyeonPositiveReplyReceiptV1,
} from './seyeon-first-positive-memory-fetch-delivery-v1.js';
import { handleSeyeonMemoryGrantRevokeRequestV1 } from './seyeon-memory-grant-revoke-http-v1.js';
import type { SeyeonOriginalMemoryGrantRevokeAckV1 } from './seyeon-original-grant-revoke-ack-v1.js';

export interface SeyeonReceiptWithdrawalFetchInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly pool: PostgresSubjectPoolV1;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  /** Server-owned S0 receipt/withdrawal admission. Never model-use approval. */
  readonly approvedWithdrawalWriteAdmission?: () => boolean | Promise<boolean>;
}

/**
 * Returns null only for a non-receipt/non-withdrawal route. The first positive
 * model response remains owned by the separately governed runtime.
 */
export async function handleSeyeonReceiptWithdrawalFetchV1(
  input: SeyeonReceiptWithdrawalFetchInputV1,
): Promise<Response | null> {
  const path = new URL(input.request.url).pathname;
  if (path.startsWith('/api/chat/delivery-receipts/')) {
    return handleSeyeonPositiveReplyReceiptV1({
      request: input.request,
      requestId: input.requestId,
      pool: input.pool,
    });
  }
  if (!/^\/api\/memories\/[^/]+\/grants\/seyeon\/revoke$/u.test(path)) {
    return null;
  }
  return handleSeyeonMemoryGrantRevokeRequestV1({
    request: input.request,
    requestId: input.requestId,
    serverTime: input.serverTime,
    identityEvidenceVerifier: input.identityEvidenceVerifier,
    pool: input.pool,
    ...(input.approvedWithdrawalWriteAdmission === undefined ? {} : {
      approvedDbWriteAdmission: input.approvedWithdrawalWriteAdmission,
    }),
    revoke: async ({ verifiedEvidence, memoryItemId }) => {
      return executePostgresSubjectTransactionV1({
        pool: input.pool,
        verifiedEvidence,
        execute: async ({ client, resolvedSubject }) => {
          const result = await client.query<{ result: unknown }>(
            `select seyeon_private.cmd_request_seyeon_memory_revoke_v1(
              $1::uuid,$2::uuid
            ) as result`,
            [resolvedSubject.subjectId, memoryItemId],
          );
          if (result.rows.length !== 1) {
            throw Error('Missing original Memory withdrawal result.');
          }
          // The HTTP boundary validates both committed and pending ACK.
          return result.rows[0]?.result as SeyeonOriginalMemoryGrantRevokeAckV1 |
            Readonly<{
              status: 'pending';
              memoryItemId: string;
              characterId: 'seyeon';
              newUseBlocked: true;
            }>;
        },
      });
    },
  });
}
