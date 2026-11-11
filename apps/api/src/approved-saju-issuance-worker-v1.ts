import { randomUUID } from 'node:crypto';
import {
  SAJU_READING_COMPONENTS_V1,
  type SajuReadingComponentV1,
} from '../../../packages/contracts/src/approved-saju-catalog.js';
import { executeApprovedSajuOfficialReadingV1 } from './postgres-approved-saju-issuance-v1.js';
import {
  executePostgresApprovedSajuIssuerJobTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import { SAJU_PRODUCTION_ISSUE_RELEASE_REF_V1 } from './saju-production-reading-http-adapter.js';
import {
  createSajuProductionReadingIssueSourceV1,
  type SajuProductionIssueSourceConfigV1,
} from './saju-production-reading-issue-source-v1.js';

type SelfComponent = Exclude<SajuReadingComponentV1, 'compatibility'>;
type ComponentRelease = Readonly<{ releaseRef: string; readerCharacterId: string }>;
type WorkerResult = Readonly<{ state: 'idle' | 'issued' | 'held' | 'lease_expired' }>;

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
      typeof release.readerCharacterId !== 'string' || !SERVER_KEY.test(release.readerCharacterId)
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
  const source = createSajuProductionReadingIssueSourceV1(input.source);

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
        if (result.state !== 'committed') return { state: 'held' };
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
