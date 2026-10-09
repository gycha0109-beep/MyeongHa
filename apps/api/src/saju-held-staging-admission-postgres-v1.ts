import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  assessSajuHeldStagingAdmissionContractV1,
  parseSajuHeldStagingAdmissionPermitV1,
  SAJU_HELD_STAGING_ADMISSION_PERMIT_KEYS_V1,
  type SajuHeldStagingAdmissionPermitV1,
} from './saju-held-staging-admission-contract-v1.js';
import {
  digestSajuHeldStagingTargetManifestV1,
  parseSajuHeldStagingTargetManifestV1,
} from './saju-held-staging-target-manifest-v1.js';
import type { StagingOperatorAdmissionPortV1 } from './saju-held-staging-rehearsal-runner-v1.js';

export const SAJU_HELD_STAGING_ADMISSION_POSTGRES_VERSION_V1 =
  'myeongha-saju-staging-admission-postgres-v1' as const;
export const SAJU_HELD_STAGING_ADMISSION_POSTGRES_ROLE_V1 =
  'myeongha_saju_staging_admission_runtime' as const;
export const SAJU_HELD_STAGING_ADMISSION_POSTGRES_TABLE_V1 =
  'public.saju_staging_operator_admission_permits' as const;

const SIGNATURE_DOMAIN = 'myeongha/saju/staging-admission/permit/v1\0';
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/u;
const IDENTIFIER = /^[A-Za-z0-9._:-]{3,128}$/u;

/**
 * The external operator approval signer MUST sign these exact domain-separated
 * bytes. This module does not sign, mint or issue admission permits.
 */
export function canonicalSajuHeldStagingPermitApprovalBytesV1(
  value: unknown,
): Uint8Array {
  const permit = parseSajuHeldStagingAdmissionPermitV1(value);
  return Buffer.from(SIGNATURE_DOMAIN + JSON.stringify(
    SAJU_HELD_STAGING_ADMISSION_PERMIT_KEYS_V1.map(key => permit[key]),
  ), 'utf8');
}

export interface SajuHeldStagingPostgresAdmissionOptionsV1 {
  /** Trusted server-side, independently reviewed target. Never user JSON. */
  readonly approvedManifest: unknown;
  /** Actual deployment manifest, asserted by the independent target authority. */
  readonly manifest: unknown;
  /** Metadata obtained from an independently governed operator approval store. */
  readonly permit: unknown;
  /** Detached, canonical base64url Ed25519 signature from that approval authority. */
  readonly approvalSignature: string;
  /** Independent operator/key trust configuration; not copied from permit metadata. */
  readonly expectedOperatorId: string;
  readonly expectedApprovalKeyId: string;
  readonly approvalPublicKey: KeyObject;
  /**
   * Dedicated staging admission PostgreSQL login/pool, NOT a Subject or nonce
   * login. Membership in the admission NOLOGIN role is provisioned externally.
   */
  readonly pool: PostgresSubjectPoolV1;
  /** Injected clock is for synthetic tests; a real caller must use server time. */
  readonly nowMsFactory?: () => number;
}

const CONSUME_SQL = [
  'update public.saju_staging_operator_admission_permits',
  "set status = 'CONSUMED',",
  '    consumed_at_ms = floor(extract(epoch from statement_timestamp()) * 1000)::bigint',
  'where permit_id = $1::uuid',
  '  and manifest_digest = $2::text',
  '  and environment_id = $3::text',
  '  and myeongha_commit_sha = $4::text',
  '  and saju_commit_sha = $5::text',
  '  and approved_operator_id = $6::text',
  '  and approval_signature_key_id = $7::text',
  '  and issued_at_ms = $8::bigint',
  '  and expires_at_ms = $9::bigint',
  "  and status = 'ISSUED'",
  '  and consumed_at_ms is null',
  '  and issued_at_ms <= floor(extract(epoch from statement_timestamp()) * 1000)::bigint',
  '  and expires_at_ms > floor(extract(epoch from statement_timestamp()) * 1000)::bigint',
  'returning permit_id::text as "permitId"',
].join('\n');

/**
 * Inert until wired by a separately authorized staging process.
 *
 * Signature verification precedes DB access. The database itself must hold
 * a separately issued, unexpired permit row and perform a unique conditional
 * UPDATE inside one transaction. No INSERT, route, grant, migration, env
 * resolver, retry, fallback or product authority is provided here.
 */
export function createSajuHeldStagingPostgresAdmissionPortV1(
  options: SajuHeldStagingPostgresAdmissionOptionsV1,
): StagingOperatorAdmissionPortV1 {
  let permit: Readonly<SajuHeldStagingAdmissionPermitV1>;
  let manifest: ReturnType<typeof parseSajuHeldStagingTargetManifestV1>;
  let approved: ReturnType<typeof parseSajuHeldStagingTargetManifestV1>;
  let key: KeyObject;
  let signature: Buffer;
  try {
    permit = parseSajuHeldStagingAdmissionPermitV1(options.permit);
    manifest = parseSajuHeldStagingTargetManifestV1(options.manifest);
    approved = parseSajuHeldStagingTargetManifestV1(options.approvedManifest);
    if (digestSajuHeldStagingTargetManifestV1(manifest)
        !== digestSajuHeldStagingTargetManifestV1(approved)
      || !IDENTIFIER.test(options.expectedOperatorId)
      || !IDENTIFIER.test(options.expectedApprovalKeyId)
      || permit.approvedOperatorId !== options.expectedOperatorId
      || permit.approvalSignatureKeyId !== options.expectedApprovalKeyId
      || permit.status !== 'ISSUED' || permit.consumedAtMs !== null
      || typeof options.approvalSignature !== 'string'
      || !SIGNATURE.test(options.approvalSignature)
      || !options.approvalPublicKey
      || options.approvalPublicKey.type !== 'public'
      || options.approvalPublicKey.asymmetricKeyType !== 'ed25519'
      || !options.pool || typeof options.pool.connect !== 'function'
      || (options.nowMsFactory !== undefined
        && typeof options.nowMsFactory !== 'function')) throw new TypeError();
    signature = Buffer.from(options.approvalSignature, 'base64url');
    if (signature.length !== 64
      || signature.toString('base64url') !== options.approvalSignature) {
      throw new TypeError();
    }
    key = createPublicKey(options.approvalPublicKey);
  } catch {
    throw new TypeError('Invalid isolated staging operator admission configuration.');
  }

  // Consume the local instance before its first await. Cross-replica authority
  // is the conditional UPDATE, not this flag or a process-local lock.
  let attempted = false;
  return Object.freeze({
    async consumeAuthorizedAttemptOnce(): Promise<boolean> {
      if (attempted) return false;
      attempted = true;
      let nowMs: number;
      try {
        nowMs = (options.nowMsFactory ?? Date.now)();
        if (!Number.isSafeInteger(nowMs) || nowMs < 0
          || assessSajuHeldStagingAdmissionContractV1({
            manifest, permit, expectedOperatorId: options.expectedOperatorId, nowMs,
          }).contract !== 'MATCHED_UNVERIFIED'
          || !verify(null, canonicalSajuHeldStagingPermitApprovalBytesV1(permit),
            key, signature)) return false;
      } catch {
        return false;
      }

      let connection: Awaited<ReturnType<PostgresSubjectPoolV1['connect']>>;
      try {
        connection = await options.pool.connect();
      } catch {
        return false;
      }
      let inTransaction = false;
      let discardConnection: unknown;
      try {
        await connection.query('BEGIN');
        inTransaction = true;
        await connection.query('SET LOCAL ROLE myeongha_saju_staging_admission_runtime');
        const result = await connection.query<{ permitId: unknown }>(CONSUME_SQL, [
          permit.permitId,
          permit.manifestDigest,
          permit.environmentId,
          permit.myeonghaCommitSha,
          permit.sajuCommitSha,
          permit.approvedOperatorId,
          permit.approvalSignatureKeyId,
          permit.issuedAtMs,
          permit.expiresAtMs,
        ]);
        if (result.rows.length !== 0 && result.rows.length !== 1) throw new Error();
        if (result.rows.length === 1
          && result.rows[0]?.permitId !== permit.permitId) throw new Error();
        await connection.query('COMMIT');
        inTransaction = false;
        return result.rows.length === 1;
      } catch {
        if (inTransaction) {
          try {
            await connection.query('ROLLBACK');
          } catch (rollbackError) {
            discardConnection = rollbackError;
          }
        }
        return false;
      } finally {
        connection.release(discardConnection);
      }
    },
  });
}
