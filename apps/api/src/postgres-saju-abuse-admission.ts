import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { requireSajuAbuseAdmissionResultV1, type SajuAbuseAdmissionPortV1, type SajuAbuseAdmissionResultV1 } from './saju-abuse-admission-http.js';

export const SAJU_ABUSE_ADMISSION_SQL_V1 = `
select allowed, request_count as "requestCount", reset_at::text as "resetAt", evaluated_at::text as "evaluatedAt",
  policy_version as "policyVersion", policy_hash as "policyHash", window_seconds as "windowSeconds",
  request_limit as "requestLimit", blocked_count_saturation as "blockedCountSaturation",
  retry_after_maximum_seconds as "retryAfterMaximumSeconds", cleanup_retention_seconds as "cleanupRetentionSeconds"
from public.cmd_admit_saju_request_v1($1::text, $2::bytea, $3::text, $4::uuid, $5::text)
`.trim();

export class PostgresSajuAbuseAdmissionPortV1 implements SajuAbuseAdmissionPortV1 {
  constructor(private readonly pool: PostgresSubjectPoolV1) {}

  async admit(input: Parameters<SajuAbuseAdmissionPortV1['admit']>[0]) {
    if (!/^[a-f0-9]{64}$/u.test(input.clientKey)) throw new Error('Invalid Saju admission client fingerprint.');
    const connection = await this.pool.connect();
    let started = false;
    let discard: unknown;
    try {
      await connection.query('BEGIN');
      started = true;
      await connection.query('SET LOCAL ROLE myeongha_api_executor');
      const result = await connection.query<Record<string, unknown>>(SAJU_ABUSE_ADMISSION_SQL_V1, [
        input.routeId, Buffer.from(input.clientKey, 'hex'), input.evidence.kind,
        input.evidence.kind === 'member' ? input.evidence.verifiedAuthUserId : null,
        input.evidence.kind === 'guest' ? input.evidence.verifiedGuestTokenHash : null,
      ]);
      if (result.rows.length > 1) throw new Error('Saju admission returned multiple authority rows.');
      const row = result.rows[0];
      const admission = row === undefined ? null : requireSajuAbuseAdmissionResultV1({
        allowed: row.allowed, requestCount: row.requestCount, resetAt: row.resetAt, evaluatedAt: row.evaluatedAt,
        policy: {
          policyVersion: row.policyVersion, policyHash: row.policyHash, windowSeconds: row.windowSeconds,
          requestLimit: row.requestLimit, blockedCountSaturation: row.blockedCountSaturation,
          retryAfterMaximumSeconds: row.retryAfterMaximumSeconds, cleanupRetentionSeconds: row.cleanupRetentionSeconds,
        },
      } as SajuAbuseAdmissionResultV1);
      await connection.query('COMMIT');
      started = false;
      return admission;
    } catch (error) {
      if (started) {
        try { await connection.query('ROLLBACK'); }
        catch (rollbackError) {
          discard = rollbackError;
          throw new AggregateError([error, rollbackError], 'Saju admission failed and rollback failed.');
        }
      }
      throw error;
    } finally { connection.release(discard); }
  }
}
