import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodePostgresAccountDeletionWorkerPoolV1 } from '../apps/api/src/node-postgres-account-deletion-worker-pool.js';
import { createPostgresAccountDeletionWorkerPortsV1 } from '../apps/api/src/postgres-account-deletion-worker.js';
import { createAccountDeletionWorkerRuntimeV1 } from '../apps/api/src/production-account-deletion-worker-runtime.js';
import { parseProductionAccountDeletionWorkerDbConfigV1 } from '../apps/api/src/production-account-deletion-worker-db-config.js';
import type { SupabaseAuthAdminUserDeletionPortV1 } from '../apps/api/src/supabase-auth-admin-user-deletion.js';

const enabled = process.env.MYEONGHA_RUN_ACCOUNT_DELETION_DB_E2E === '1';
const suite = enabled ? describe : describe.skip;

const AUTH_ID = 'fe100000-0000-4000-8000-000000000001';
const SUBJECT_ID = 'fe200000-0000-4000-8000-000000000001';
const GUEST_SUBJECT_ID = 'fe200000-0000-4000-8000-000000000002';
const GUEST_SESSION_ID = 'fe210000-0000-4000-8000-000000000002';
const MERGE_JOB_ID = 'fe220000-0000-4000-8000-000000000002';
const MERGE_ACTION_ID = 'fe230000-0000-4000-8000-000000000002';
const COMMERCE_LINK_ID = 'fe600000-0000-4000-8000-000000000001';
const JOB_ID = 'fe800000-0000-4000-8000-000000000001';
const OUTBOX_ID = 'fe810000-0000-4000-8000-000000000001';
const WRONG_OUTBOX_ID = 'fe810000-0000-4000-8000-000000000002';
const WRONG_JOB_ID = 'fe800000-0000-4000-8000-000000000002';
const WRONG_SUBJECT_ID = 'fe200000-0000-4000-8000-000000000099';
const LOCK_OWNER = 'account-deletion-runtime-e2e';
const WORKER_PASSWORD = 'worker-e2e-secret';

suite('account deletion concrete worker PostgreSQL E2E', () => {
  const admin = new Pool({
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? '5432'),
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'postgres',
    database: process.env.PGDATABASE ?? 'myeongha_test',
    max: 2,
  });
  let workerPool: ReturnType<typeof createNodePostgresAccountDeletionWorkerPoolV1>;
  let authDeleteCalls = 0;

  beforeAll(async () => {
    await admin.query(`alter role myeongha_worker_runtime password '${WORKER_PASSWORD}'`);

    await admin.query('insert into auth.users(id) values ($1::uuid)', [AUTH_ID]);

    await admin.query(
      `insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at)
       values ($1::uuid,'member',$2::uuid,'active',null,clock_timestamp(),clock_timestamp())`,
      [SUBJECT_ID, AUTH_ID],
    );
    await admin.query(
      `insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at)
       values ($1::uuid,'guest',null,'active',null,clock_timestamp(),clock_timestamp())`,
      [GUEST_SUBJECT_ID],
    );
    await admin.query(
      `insert into public.profiles(subject_id,display_name,locale,timezone,onboarding_state,created_at,updated_at)
       values ($1::uuid,'PII E2E','ko','Asia/Seoul','done',clock_timestamp(),clock_timestamp())`,
      [SUBJECT_ID],
    );
    await admin.query(
      `insert into public.guest_sessions(id,subject_id,token_hash,expires_at,consumed_at,claimed_by_subject_id,created_at)
       values ($1::uuid,$2::uuid,'sha256:worker-e2e',clock_timestamp()+interval '1 day',clock_timestamp(),$3::uuid,clock_timestamp()-interval '1 second')`,
      [GUEST_SESSION_ID, GUEST_SUBJECT_ID, SUBJECT_ID],
    );
    await admin.query(
      `insert into public.subject_merge_jobs(id,guest_subject_id,member_subject_id,guest_session_id,policy_version,status,conflicts_jsonb,resolution_jsonb,idempotency_key,created_at,completed_at)
       values ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'test','completed','{"pii":"secret"}'::jsonb,'{"pii":"secret"}'::jsonb,'secret-e2e',clock_timestamp(),clock_timestamp())`,
      [MERGE_JOB_ID, GUEST_SUBJECT_ID, SUBJECT_ID, GUEST_SESSION_ID],
    );
    await admin.query(
      `insert into public.subject_merge_actions(id,merge_job_id,action_dedupe_key,domain_key,resource_type,source_resource_id,action_type,target_resource_id,status,created_at,completed_at)
       values ($1::uuid,$2::uuid,'secret-action-e2e','memory','memory_item','secret-source','import_new','secret-target','applied',clock_timestamp(),clock_timestamp())`,
      [MERGE_ACTION_ID, MERGE_JOB_ID],
    );
    await admin.query(
      `insert into public.commerce_account_links(id,subject_id,provider,external_account_fingerprint,status,verified_at,revoked_at,created_at)
       values ($1::uuid,$2::uuid,'test-provider','sha256:retain-e2e','active',clock_timestamp(),null,clock_timestamp())`,
      [COMMERCE_LINK_ID, SUBJECT_ID],
    );
    await admin.query(
      `select * from public.cmd_start_account_deletion_v1($1::uuid,$2::uuid,$3::text,$4::uuid)`,
      [SUBJECT_ID, JOB_ID, 'runtime-e2e-start', OUTBOX_ID],
    );
    await admin.query(
      `insert into public.outbox_events(
         id,aggregate_type,aggregate_id,event_type,event_schema_version,dedupe_key,payload_jsonb,
         status,attempt_count,available_at,created_at
       ) values (
         $1::uuid,'data_deletion_job',$2::uuid::text,'WRONG_EVENT','v1','account-delete-start-v1',
         jsonb_build_object('deletionJobId',$2::uuid,'subjectId',$3::uuid,'scope','account'),
         'pending',0,clock_timestamp(),clock_timestamp()
       )`,
      [WRONG_OUTBOX_ID, WRONG_JOB_ID, WRONG_SUBJECT_ID],
    );

    const workerUrl =
      `postgresql://myeongha_worker_runtime:${WORKER_PASSWORD}@${process.env.PGHOST ?? 'localhost'}:${process.env.PGPORT ?? '5432'}/${process.env.PGDATABASE ?? 'myeongha_test'}`;
    workerPool = createNodePostgresAccountDeletionWorkerPoolV1(
      parseProductionAccountDeletionWorkerDbConfigV1({
        MYEONGHA_WORKER_DATABASE_URL: workerUrl,
        MYEONGHA_WORKER_DATABASE_PRINCIPAL: 'myeongha_worker_runtime',
      }),
    );
  });

  afterAll(async () => {
    if (workerPool !== undefined) await workerPool.close();
    await admin.query('alter role myeongha_worker_runtime password null');
    await admin.end();
  });

  it('runs claimed deletion through DB finalization, Auth seam, completion ACK, and same-owner processed replay', async () => {
    const authDeletionPort: SupabaseAuthAdminUserDeletionPortV1 = {
      async deleteUser(input) {
        authDeleteCalls += 1;
        const result = await admin.query(
          'delete from auth.users where id=$1::uuid returning id',
          [input.authUserId],
        );
        return Object.freeze({
          outcome: result.rowCount === 1 ? 'deleted' : 'already_absent',
        });
      },
    };

    const runtime = createAccountDeletionWorkerRuntimeV1({
      ports: createPostgresAccountDeletionWorkerPortsV1({ pool: workerPool }),
      authDeletionPort,
    });

    const leaseExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    await expect(
      runtime.run({
        outboxEventId: WRONG_OUTBOX_ID,
        lockOwner: LOCK_OWNER,
        leaseExpiresAt,
      }),
    ).rejects.toThrow(/exact ACCOUNT_DELETION_STARTED event contract/u);

    const wrong = await admin.query(
      'select status,lock_owner,lease_expires_at from public.outbox_events where id=$1::uuid',
      [WRONG_OUTBOX_ID],
    );
    expect(wrong.rows[0]).toMatchObject({
      status: 'pending',
      lock_owner: null,
      lease_expires_at: null,
    });

    const result = await runtime.run({
      outboxEventId: OUTBOX_ID,
      lockOwner: LOCK_OWNER,
      leaseExpiresAt,
    });

    expect(result.claim).toMatchObject({
      outboxEventId: OUTBOX_ID,
      subjectId: SUBJECT_ID,
      deletionJobId: JOB_ID,
      reclaimed: false,
    });
    expect(result.worker.status).toBe('completed');
    expect(result.worker.resumedFrom).toBe('db_finalization_required');
    expect(result.worker.authDeletionOutcome).toBe('deleted');
    expect(authDeleteCalls).toBe(1);

    const state = await admin.query(
      `
select
  s.status as subject_status,
  s.auth_user_id,
  dj.status as job_status,
  (dj.completed_at is not null) as job_completed,
  oe.status as outbox_status,
  oe.lock_owner,
  (oe.processed_at is not null) as outbox_processed,
  (select count(*)::int from public.profiles p where p.subject_id=s.id) as profile_count
from public.subjects s
join public.data_deletion_jobs dj on dj.id=$2::uuid and dj.subject_id=s.id
join public.outbox_events oe on oe.id=$3::uuid
where s.id=$1::uuid
`,
      [SUBJECT_ID, JOB_ID, OUTBOX_ID],
    );
    expect(state.rows[0]).toMatchObject({
      subject_status: 'deleted',
      auth_user_id: null,
      job_status: 'completed',
      job_completed: true,
      outbox_status: 'processed',
      lock_owner: LOCK_OWNER,
      outbox_processed: true,
      profile_count: 0,
    });

    const merge = await admin.query(
      'select guest_session_id,conflicts_jsonb,resolution_jsonb,idempotency_key from public.subject_merge_jobs where id=$1::uuid',
      [MERGE_JOB_ID],
    );
    expect(merge.rows[0]).toEqual({
      guest_session_id: null,
      conflicts_jsonb: {},
      resolution_jsonb: null,
      idempotency_key: `anonymized:${MERGE_JOB_ID}`,
    });

    const action = await admin.query(
      'select action_dedupe_key,source_resource_id,target_resource_id from public.subject_merge_actions where id=$1::uuid',
      [MERGE_ACTION_ID],
    );
    expect(action.rows[0]).toEqual({
      action_dedupe_key: `anonymized:${MERGE_ACTION_ID}`,
      source_resource_id: 'anonymized',
      target_resource_id: 'anonymized',
    });

    const retained = await admin.query(
      'select status,(revoked_at is not null) as revoked from public.commerce_account_links where id=$1::uuid',
      [COMMERCE_LINK_ID],
    );
    expect(retained.rows[0]).toEqual({ status: 'revoked', revoked: true });

    const replay = await runtime.run({
      outboxEventId: OUTBOX_ID,
      lockOwner: LOCK_OWNER,
      leaseExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    expect(replay.worker.alreadyCompleted).toBe(true);
    expect(replay.worker.resumedFrom).toBe('completed');
    expect(authDeleteCalls).toBe(1);

    await expect(
      runtime.run({
        outboxEventId: OUTBOX_ID,
        lockOwner: 'different-worker',
        leaseExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      }),
    ).rejects.toThrow(/completing worker owner/u);
  });
});
