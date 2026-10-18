// Watchtower-Track: security
// R15: verified-Member revoke ACK under the SAME Subject lock namespace as
// R13 original-Grant Node sends. Not mounted as a Production HTTP write route.
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';
import {
  revokeMemoryCharacterGrant,
  type MemoryGrantRevokeCommandAuthorityRowV1,
} from './memory-grant-revoke-command.js';

export const SEYEON_ORIGINAL_GRANT_REVOKE_ACK_V1 = Object.freeze({
  version: 'seyeon-original-grant-revoke-ack-v1',
  originalGrantRevokeRpc: 'public.cmd_revoke_memory_character_grant_v1',
  privateCandidateRpc: 'seyeon_private.cmd_revoke_seyeon_memory_grant_v1',
  characterId: 'seyeon',
  subjectLockMode: 'FOR UPDATE',
  revokeAckAfterDbCommitOnly: true,
  productionRouteMounted: false,
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const REVOKE_SQL = `
select
  memory_item_id::text as "memoryItemId",
  character_id::text as "characterId",
  revoked_grant_count as "revokedGrantCount",
  replayed as "replayed"
from public.cmd_revoke_memory_character_grant_v1(
  $1::uuid, $2::uuid, $3::text
)
`.trim();

// Only selected by the server-owned, unmounted Production composition. This
// candidate does not enable its HTTP write admission or deploy its migration.
const PRIVATE_REVOKE_SQL = `
select
  memory_item_id::text as "memoryItemId",
  character_id::text as "characterId",
  revoked_grant_count as "revokedGrantCount",
  replayed as "replayed"
from seyeon_private.cmd_revoke_seyeon_memory_grant_v1(
  $1::uuid, $2::uuid
)
`.trim();

export class SeyeonOriginalGrantRevokeAckErrorV1 extends Error {
  constructor(readonly code: 'MEMBER_REQUIRED' | 'INVALID_MEMORY_ID') {
    super('Se-yeon Memory grant revocation requires verified Member authority.');
    this.name = 'SeyeonOriginalGrantRevokeAckErrorV1';
  }
}

export interface RevokeSeyeonOriginalMemoryGrantAndAckInputV1 {
  readonly pool: PostgresSubjectPoolV1;
  /** Verified by the server; browser subject/character/grant IDs are forbidden. */
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  /** Record locator only; DB determines the current original Grant IDs. */
  readonly memoryItemId: string;
  /** Internal only; default retains R15's already-tested original RPC. */
  readonly dbCommand?: 'legacy_original' | 'private_candidate';
}

export interface SeyeonOriginalMemoryGrantRevokeAckV1 {
  readonly status: 'committed';
  readonly memoryItemId: string;
  readonly characterId: 'seyeon';
  readonly revokedGrantCount: number;
  readonly replayed: boolean;
}

/**
 * The SQL command already takes Subject FOR UPDATE before changing its owned
 * original Memory Grant(s). R13's exact current-rights sender holds Subject
 * FOR SHARE through the trusted Node socket finish; therefore revoke COMMIT
 * cannot overtake a send which entered that lock scope first.
 *
 * This function returns a successful ACK ONLY AFTER transaction COMMIT.
 * A lost COMMIT response is ambiguous and MUST NOT be presented as success;
 * a retry obtains the command's state-derived replay/no-op instead.
 *
 * No direct UPDATE, no user-selected Character, no replacement Grant,
 * no historical-message deletion. SECURITY INVOKER role/ACL still govern
 * whether this candidate can execute. No Production route calls it yet.
 */
export async function revokeSeyeonOriginalMemoryGrantAndAckV1(
  input: RevokeSeyeonOriginalMemoryGrantAndAckInputV1,
): Promise<SeyeonOriginalMemoryGrantRevokeAckV1> {
  if (input.verifiedEvidence.kind !== 'member' ||
      !UUID.test(input.verifiedEvidence.verifiedAuthUserId)) {
    throw new SeyeonOriginalGrantRevokeAckErrorV1('MEMBER_REQUIRED');
  }
  if (typeof input.memoryItemId !== 'string' || !UUID.test(input.memoryItemId)) {
    throw new SeyeonOriginalGrantRevokeAckErrorV1('INVALID_MEMORY_ID');
  }

  const data = await executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: async ({ resolvedSubject, client }) => {
      if (resolvedSubject.subjectKind !== 'member') {
        throw new SeyeonOriginalGrantRevokeAckErrorV1('MEMBER_REQUIRED');
      }
      await client.query("SET LOCAL lock_timeout = '2000ms'");
      await client.query("SET LOCAL statement_timeout = '5000ms'");
      // Use the already-audited domain command with the current, server-owned
      // canonical Subject. The RPC itself locks Subject FOR UPDATE.
      return revokeMemoryCharacterGrant({
        resolvedSubjectId: resolvedSubject.subjectId,
        memoryItemId: input.memoryItemId,
        characterId: SEYEON_ORIGINAL_GRANT_REVOKE_ACK_V1.characterId,
        authorityPort: {
          async revokeCharacterGrants(locators) {
            const result =
              await client.query<MemoryGrantRevokeCommandAuthorityRowV1>(
                input.dbCommand === 'private_candidate'
                  ? PRIVATE_REVOKE_SQL : REVOKE_SQL,
                input.dbCommand === 'private_candidate'
                  ? [locators.subjectId, locators.memoryItemId]
                  : [locators.subjectId, locators.memoryItemId, locators.characterId],
              );
            return result.rows;
          },
        },
      });
    },
  });

  // NO ACK may escape before the DB transaction's COMMIT resolves.
  return Object.freeze({
    status: 'committed' as const,
    memoryItemId: data.memoryItemId,
    characterId: 'seyeon' as const,
    revokedGrantCount: data.revokedGrantCount,
    replayed: data.replayed,
  });
}
