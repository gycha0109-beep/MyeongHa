import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  assessSajuHeldStagingAdmissionSignatureV2,
  parseSajuHeldStagingAdmissionPermitV2,
  type SajuHeldStagingAdmissionSignatureInputV2,
} from './saju-held-staging-admission-signature-v2.js';
import { parseSajuHeldStagingTargetManifestV1 } from './saju-held-staging-target-manifest-v1.js';
import { parseSajuHeldStagingConnectionPlanV1 } from './saju-held-staging-connection-plan-v1.js';
import type { StagingOperatorAdmissionPortV1 } from './saju-held-staging-rehearsal-runner-v1.js';

export const SAJU_HELD_STAGING_ADMISSION_POSTGRES_VERSION_V2 =
  'myeongha-saju-staging-admission-postgres-v2' as const;
export const SAJU_HELD_STAGING_ADMISSION_POSTGRES_TABLE_V2 =
  'public.saju_staging_operator_admission_permits_v2' as const;
export const SAJU_HELD_STAGING_ADMISSION_POSTGRES_ROLE_V2 =
  'myeongha_saju_staging_admission_runtime' as const;

export interface SajuHeldStagingPostgresAdmissionOptionsV2
  extends Omit<SajuHeldStagingAdmissionSignatureInputV2, 'nowMs'> {
  /** Dedicated staging admission login; never Subject, nonce or production pool. */
  readonly pool: PostgresSubjectPoolV1;
  /** Deterministic tests only. Actual Authority must independently verify the clock. */
  readonly nowMsFactory?: () => number;
}

/** Independently signed Permit V2 bound to both immutable digests. */
export const SAJU_HELD_STAGING_CONSUME_SQL_V2 = [
  'update public.saju_staging_operator_admission_permits_v2',
  "set status = 'CONSUMED',",
  '    consumed_at_ms = floor(extract(epoch from clock_timestamp()) * 1000)::bigint',
  'where permit_id = $1::uuid',
  '  and manifest_digest = $2::text',
  '  and connection_plan_digest = $3::text',
  '  and environment_id = $4::text',
  '  and myeongha_commit_sha = $5::text',
  '  and saju_commit_sha = $6::text',
  '  and approved_operator_id = $7::text',
  '  and approval_signature_key_id = $8::text',
  '  and issued_at_ms = $9::bigint',
  '  and expires_at_ms = $10::bigint',
  "  and status = 'ISSUED'",
  '  and consumed_at_ms is null',
  '  and issued_at_ms <= floor(extract(epoch from clock_timestamp()) * 1000)::bigint',
  '  and expires_at_ms > floor(extract(epoch from clock_timestamp()) * 1000)::bigint',
  'returning permit_id::text as "permitId"',
].join('\n');

/**
 * Dormant, server-only adapter. Nothing connects until consume is called.
 *
 * The caller must separately establish the trusted approval key origin,
 * target authority and deployment identity. A supplied public key, mocked DB,
 * or CI PASS is not staging approval. No route, issuer, migration or wiring.
 */
export function createSajuHeldStagingPostgresAdmissionPortV2(
  options: SajuHeldStagingPostgresAdmissionOptionsV2,
): StagingOperatorAdmissionPortV1 {
  let pinned: SajuHeldStagingAdmissionSignatureInputV2;
  let permit: ReturnType<typeof parseSajuHeldStagingAdmissionPermitV2>;
  try {
    permit = parseSajuHeldStagingAdmissionPermitV2(options.permit);
    pinned = Object.freeze({
      manifest: parseSajuHeldStagingTargetManifestV1(options.manifest),
      approvedManifest: parseSajuHeldStagingTargetManifestV1(options.approvedManifest),
      connectionPlan: parseSajuHeldStagingConnectionPlanV1(options.connectionPlan),
      approvedConnectionPlan: parseSajuHeldStagingConnectionPlanV1(options.approvedConnectionPlan),
      permit,
      approvalSignature: options.approvalSignature,
      approvalPublicKey: options.approvalPublicKey,
      expectedOperatorId: options.expectedOperatorId,
      expectedApprovalKeyId: options.expectedApprovalKeyId,
      nowMs: 0,
    });
    if (!options.pool || typeof options.pool.connect !== 'function'
      || (options.nowMsFactory !== undefined
        && typeof options.nowMsFactory !== 'function')) throw new TypeError();
    // Structural validation before allocation, but time-dependent verification
    // and detached Ed25519 authentication happen immediately before DB access.
    const checked = assessSajuHeldStagingAdmissionSignatureV2({
      ...pinned, nowMs: Math.max(permit.issuedAtMs, 0),
    });
    if (checked.contract !== 'SIGNED_TARGET_MATCHED_UNVERIFIED_AUTHORITY') {
      throw new TypeError();
    }
  } catch {
    throw new TypeError('Invalid isolated staging V2 operator admission configuration.');
  }

  let attempted = false;
  return Object.freeze({
    async consumeAuthorizedAttemptOnce(): Promise<boolean> {
      // Process-local latch guards accidental retries. PostgreSQL conditional
      // UPDATE is the cross-replica authority; COMMIT ambiguity denies retry.
      if (attempted) return false;
      attempted = true;
      try {
        const nowMs = (options.nowMsFactory ?? Date.now)();
        if (!Number.isSafeInteger(nowMs) || nowMs < 0
          || assessSajuHeldStagingAdmissionSignatureV2({
            ...pinned, nowMs,
          }).contract !== 'SIGNED_TARGET_MATCHED_UNVERIFIED_AUTHORITY') return false;
      } catch { return false; }

      let connection: Awaited<ReturnType<PostgresSubjectPoolV1['connect']>>;
      try { connection = await options.pool.connect(); }
      catch { return false; }

      let inTransaction = false;
      let discardConnection: unknown;
      try {
        await connection.query('BEGIN');
        inTransaction = true;
        await connection.query('SET LOCAL ROLE myeongha_saju_staging_admission_runtime');
        const result = await connection.query<{ permitId: unknown }>(
          SAJU_HELD_STAGING_CONSUME_SQL_V2,
          [
            permit.permitId,
            permit.manifestDigest,
            permit.connectionPlanDigest,
            permit.environmentId,
            permit.myeonghaCommitSha,
            permit.sajuCommitSha,
            permit.approvedOperatorId,
            permit.approvalSignatureKeyId,
            permit.issuedAtMs,
            permit.expiresAtMs,
          ],
        );
        if (result.rows.length > 1
          || (result.rows.length === 1 && result.rows[0]?.permitId !== permit.permitId)) {
          throw new Error('Malformed V2 approval result.');
        }
        await connection.query('COMMIT');
        inTransaction = false;
        return result.rows.length === 1;
      } catch {
        if (inTransaction) {
          try { await connection.query('ROLLBACK'); }
          catch (error) { discardConnection = error; }
        }
        return false;
      } finally {
        try { connection.release(discardConnection); } catch { /* No secret error output. */ }
      }
    },
  });
}
