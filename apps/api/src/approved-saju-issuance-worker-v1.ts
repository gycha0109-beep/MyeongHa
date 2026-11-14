import { randomUUID } from 'node:crypto';
import {
  SAJU_READING_COMPONENTS_V1,
  type SajuReadingComponentV1,
} from '../../../packages/contracts/src/approved-saju-catalog.js';
import { executeApprovedSajuOfficialReadingV1 } from './postgres-approved-saju-issuance-v1.js';
import type { SajuOfficialIssuanceResultV1 } from './saju-official-reading-issuer-db-persistence-v1.js';
import {
  OFFICIAL_READER_RUNTIME_IDS_V1,
  type OfficialReaderRuntimeIdV1,
} from './reader-production-rollout-policy-v1.js';
import {
  executePostgresApprovedSajuIssuerJobTransactionV1,
  executePostgresApprovedSajuIssuerTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import { SAJU_PRODUCTION_ISSUE_RELEASE_REF_V1 } from './saju-production-reading-http-adapter.js';
import {
  createSajuProductionReadingIssueSourceV1,
  type SajuProductionIssueSourceConfigV1,
} from './saju-production-reading-issue-source-v1.js';

type SelfComponent = Exclude<SajuReadingComponentV1, 'compatibility'>;
type ComponentRelease = Readonly<{ releaseRef: string; readerCharacterId: OfficialReaderRuntimeIdV1 }>;
type WorkerResult = Readonly<{ state: 'idle' | 'issued' | 'lease_expired' }> | Readonly<{
  state: 'held';
  jobId: string;
  component: SelfComponent;
  reason: Extract<SajuOfficialIssuanceResultV1, { state: 'held' }>['reason'] | 'missing_signed_receipt';
  localAttempt: 'not_allocated' | 'requires_source_reconciliation' | 'signed_commit' | 'unavailable';
}>;

interface Job {
  readonly job_id: string;
  readonly subject_id: string;
  readonly auth_user_id: string;
  readonly purchase_intent_id: string;
  readonly component: SelfComponent;
  readonly release_ref: string;
  readonly already_issued: boolean;
}

const UUID = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const SERVER_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u;
const officialReaderIds = new Set<string>(OFFICIAL_READER_RUNTIME_IDS_V1);

/** Server-only worker. The payment transaction queues work and the issuer owns completion. */
export function createApprovedSajuIssuanceWorkerV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  source: SajuProductionIssueSourceConfigV1;
  releases: Partial<Readonly<Record<SelfComponent, ComponentRelease>>>;
  engineKey: string;
  engineVersion: string;
}>) {
  const releases = new Map<string, ComponentRelease>();
  for (const [component, release] of Object.entries(input.releases)) {
    if (
      component === 'compatibility' || !Object.hasOwn(SAJU_READING_COMPONENTS_V1, component) ||
      !release || typeof release.releaseRef !== 'string' ||
      !SAJU_PRODUCTION_ISSUE_RELEASE_REF_V1.test(release.releaseRef) ||
      !officialReaderIds.has(release.readerCharacterId)
    ) throw new Error('Invalid approved Saju issuance release.');
    releases.set(component, { ...release });
  }
  if (releases.size === 0 || !SERVER_KEY.test(input.engineKey) || !SERVER_KEY.test(input.engineVersion)) {
    throw new Error('Approved Saju issuance worker requires explicit releases and engine identity.');
  }

  const releaseJson = JSON.stringify(Object.fromEntries(
    [...releases].map(([component, release]) => [component, release.releaseRef]),
  ));
  const { pool, engineKey, engineVersion } = input;
  const source = createSajuProductionReadingIssueSourceV1({ ...input.source, requireCanonicalReaderSource: true });

  return Object.freeze({
    async runNext(): Promise<WorkerResult> {
      const leaseId = randomUUID();
      const job = await executePostgresApprovedSajuIssuerJobTransactionV1({
        pool,
        execute: async (client) => {
          const { rows } = await client.query<Job>(
            'select * from public.cmd_claim_approved_saju_issue_job_v1($1::uuid,$2::jsonb)',
            [leaseId, releaseJson],
          );
          if (rows.length > 1) throw new Error('Approved Saju issuer claimed multiple jobs.');
          return rows[0];
        },
      });
      if (job === undefined) return { state: 'idle' };

      const release = releases.get(job.component);
      if (!release || release.releaseRef !== job.release_ref || typeof job.already_issued !== 'boolean'
        || ![job.job_id, job.subject_id, job.auth_user_id, job.purchase_intent_id].every(
          (id) => typeof id === 'string' && UUID.test(id),
        )) throw new Error('Invalid approved Saju issuance job.');

      // A Reading binding alone is not proof of an issued, signed Official Reading.
      // Check the current grant and the durable Source proof before ACKing any job,
      // including a lease recovered after a crash.
      const readCommitState = () => executePostgresApprovedSajuIssuerTransactionV1({
        pool,
        verifiedEvidence: { kind: 'member', verifiedAuthUserId: job.auth_user_id },
        execute: async ({ client, resolvedSubject }) => {
          if (resolvedSubject.subjectId !== job.subject_id) return 'unavailable';
          const { rows } = await client.query<{ attempt_no: number | null; signed_commit: boolean }>(
            'select attempt_no,signed_commit from public.qry_approved_saju_issue_job_status_v1($1::uuid,$2::uuid,$3::text)',
            [job.subject_id, job.purchase_intent_id, job.component],
          );
          const row = rows[0];
          if (rows.length !== 1 || row === undefined) return 'unavailable';
          if (row.signed_commit === true) return 'signed_commit';
          return row.attempt_no === null ? 'not_allocated' : 'requires_source_reconciliation';
        },
      });

      if (!job.already_issued) {
        const result = await executeApprovedSajuOfficialReadingV1({
          ...source, pool,
          verifiedEvidence: { kind: 'member', verifiedAuthUserId: job.auth_user_id },
          subjectId: job.subject_id,
          purchaseIntentId: job.purchase_intent_id,
          component: job.component,
          expectedReleaseRef: release.releaseRef,
          readerCharacterId: release.readerCharacterId,
          readingId: randomUUID(),
          readingSessionId: randomUUID(),
          executionAttemptId: randomUUID(),
          outboxEventId: randomUUID(),
          transportKey: 'saju-production-issue-proof-v1',
          sajuEngineKey: engineKey,
          requestedEngineVersion: engineVersion,
        });
        if (result.state !== 'committed') {
          const localAttempt = await readCommitState();
          return { state: 'held', jobId: job.job_id, component: job.component, reason: result.reason, localAttempt };
        }
      }
      const localAttempt = await readCommitState();
      if (localAttempt !== 'signed_commit') {
        return { state: 'held', jobId: job.job_id, component: job.component,
          reason: 'missing_signed_receipt', localAttempt };
      }
      const completed = await executePostgresApprovedSajuIssuerJobTransactionV1({
        pool,
        execute: async (client) => {
          const { rows } = await client.query<{ completed: boolean }>(
            'select public.cmd_complete_approved_saju_issue_job_v1($1::uuid,$2::uuid) as completed',
            [job.job_id, leaseId],
          );
          if (rows.length !== 1 || typeof rows[0]?.completed !== 'boolean') {
            throw new Error('Approved Saju issuer returned invalid job completion.');
          }
          return rows[0].completed;
        },
      });
      return { state: completed ? 'issued' : 'lease_expired' };
    },
  });
}
