import { describe, expect, it } from 'vitest';
import {
  withCloudflareRequestSubjectScopeV1,
  type CloudflareRequestSubjectPoolV1,
} from '../apps/api/src/cloudflare-request-subject-scope.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';
import {
  createNodePostgresSubjectPoolFromDriverV1,
  type NodePostgresDriverClientV1,
  type NodePostgresDriverPoolV1,
  type NodePostgresDriverQueryResultV1,
} from '../apps/api/src/node-postgres-subject-pool.js';

const LOGIN_PRINCIPAL = 'myeongha_test_runtime';
const MEMBER_AUTH_USER_ID = '91000000-0000-0000-0000-000000000001';
const MEMBER_SUBJECT_ID = '92000000-0000-0000-0000-000000000001';
const GUEST_SUBJECT_ID = '93000000-0000-0000-0000-000000000001';
const GUEST_FINGERPRINT = 'synthetic-guest-hash-never-a-real-credential';

type CallV1 = Readonly<{ text: string; values: readonly unknown[] }>;

class SyntheticClientV1 implements NodePostgresDriverClientV1 {
  readonly calls: CallV1[] = [];
  readonly releases: Array<Error | undefined> = [];
  currentUser = LOGIN_PRINCIPAL;
  canEnterExecutionRole = true;
  rollbackError: Error | undefined;
  commitError: Error | undefined;

  constructor(readonly memberSubjectId = MEMBER_SUBJECT_ID) {}

  async query(text: string, values: readonly unknown[] = []): Promise<NodePostgresDriverQueryResultV1> {
    this.calls.push({ text, values: [...values] });
    if (text.includes('pg_has_role')) {
      return { rows: [{ currentUser: this.currentUser, canEnterExecutionRole: this.canEnterExecutionRole }] };
    }
    if (text.includes('begin_member_subject_context_v1')) {
      return { rows: [{ subjectId: this.memberSubjectId, subjectKind: 'member' }] };
    }
    if (text.includes('begin_guest_subject_context_v1')) {
      return { rows: [{ subjectId: GUEST_SUBJECT_ID, subjectKind: 'guest' }] };
    }
    if (text === 'ROLLBACK' && this.rollbackError) throw this.rollbackError;
    if (text === 'COMMIT' && this.commitError) throw this.commitError;
    return { rows: [] };
  }

  release(error?: Error): void {
    this.releases.push(error);
  }
}

class SyntheticDriverPoolV1 implements NodePostgresDriverPoolV1 {
  readonly client: SyntheticClientV1;
  connectCalls = 0;
  endCalls = 0;
  endError: Error | undefined;

  constructor(subjectId = MEMBER_SUBJECT_ID) {
    this.client = new SyntheticClientV1(subjectId);
  }

  async connect(): Promise<NodePostgresDriverClientV1> {
    this.connectCalls += 1;
    return this.client;
  }

  async end(): Promise<void> {
    this.endCalls += 1;
    if (this.endError) throw this.endError;
  }

  asSubjectPool(): CloudflareRequestSubjectPoolV1 {
    return createNodePostgresSubjectPoolFromDriverV1({
      driverPool: this,
      expectedLoginPrincipal: LOGIN_PRINCIPAL,
    });
  }
}

function executeMember(pool: PostgresSubjectPoolV1, job: (subjectId: string) => Promise<string> | string) {
  return executePostgresSubjectTransactionV1({
    pool,
    verifiedEvidence: { kind: 'member', verifiedAuthUserId: MEMBER_AUTH_USER_ID },
    execute: async ({ resolvedSubject, client }) => {
      await client.query('select synthetic_subject_work($1::uuid)', [resolvedSubject.subjectId]);
      return job(resolvedSubject.subjectId);
    },
  });
}

function sql(client: SyntheticClientV1): string[] {
  return client.calls.map(call => call.text);
}

describe('Cloudflare request-scoped subject pool (synthetic only)', () => {
  it('keeps login-principal, SET LOCAL ROLE, canonical subject and commit on one checkout; then ends pool', async () => {
    const driver = new SyntheticDriverPoolV1();
    let retained: PostgresSubjectPoolV1 | undefined;
    const result = await withCloudflareRequestSubjectScopeV1({
      createPool: () => driver.asSubjectPool(),
      execute: pool => {
        retained = pool;
        return executeMember(pool, subjectId => subjectId);
      },
    });

    expect(result).toBe(MEMBER_SUBJECT_ID);
    expect(driver.connectCalls).toBe(1);
    expect(driver.endCalls).toBe(1);
    expect(sql(driver.client)).toEqual([
      expect.stringContaining('pg_has_role'),
      'BEGIN',
      'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('public.begin_member_subject_context_v1($1::uuid)'),
      'select public.assert_myeongha_subject_context_v1($1::uuid)',
      'select synthetic_subject_work($1::uuid)',
      'COMMIT',
    ]);
    expect(driver.client.calls[0]?.values).toEqual(['myeongha_api_executor']);
    expect(driver.client.calls[3]?.values).toEqual([MEMBER_AUTH_USER_ID]);
    expect(driver.client.calls[4]?.values).toEqual([MEMBER_SUBJECT_ID]);
    expect(driver.client.releases).toEqual([undefined]);
    await expect(retained!.connect()).rejects.toThrow('request scope has ended');
  });

  it('resolves guest only through the verified fingerprint within the same transaction', async () => {
    const driver = new SyntheticDriverPoolV1();
    const actual = await withCloudflareRequestSubjectScopeV1({
      createPool: () => driver.asSubjectPool(),
      execute: pool => executePostgresSubjectTransactionV1({
        pool,
        verifiedEvidence: { kind: 'guest', verifiedGuestTokenHash: GUEST_FINGERPRINT },
        execute: async ({ resolvedSubject }) => resolvedSubject,
      }),
    });
    expect(actual).toEqual({ subjectId: GUEST_SUBJECT_ID, subjectKind: 'guest' });
    expect(sql(driver.client)).toEqual([
      expect.stringContaining('pg_has_role'),
      'BEGIN',
      'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('begin_guest_subject_context_v1($1::text)'),
      'select public.assert_myeongha_subject_context_v1($1::uuid)',
      'COMMIT',
    ]);
    expect(driver.client.calls[3]?.values).toEqual([GUEST_FINGERPRINT]);
    expect(driver.endCalls).toBe(1);
  });

  it('isolates concurrent request pools, distinct member subjects and their shutdowns', async () => {
    const first = new SyntheticDriverPoolV1(MEMBER_SUBJECT_ID);
    const secondId = '92000000-0000-0000-0000-000000000002';
    const second = new SyntheticDriverPoolV1(secondId);
    const results = await Promise.all([first, second].map(driver =>
      withCloudflareRequestSubjectScopeV1({
        createPool: () => driver.asSubjectPool(),
        execute: pool => executeMember(pool, subjectId => subjectId),
      }),
    ));
    expect(results).toEqual([MEMBER_SUBJECT_ID, secondId]);
    expect(first.endCalls).toBe(1);
    expect(second.endCalls).toBe(1);
    expect(first.client.calls.find(call => call.text === 'select synthetic_subject_work($1::uuid)')?.values)
      .toEqual([MEMBER_SUBJECT_ID]);
    expect(second.client.calls.find(call => call.text === 'select synthetic_subject_work($1::uuid)')?.values)
      .toEqual([secondId]);
    expect(first.client.releases).toEqual([undefined]);
    expect(second.client.releases).toEqual([undefined]);
  });

  it('rolls back on failed authority work, releases checkout and awaits pool close', async () => {
    const driver = new SyntheticDriverPoolV1();
    const failure = new Error('synthetic authority failure');
    await expect(withCloudflareRequestSubjectScopeV1({
      createPool: () => driver.asSubjectPool(),
      execute: pool => executeMember(pool, () => { throw failure; }),
    })).rejects.toBe(failure);
    expect(sql(driver.client).at(-1)).toBe('ROLLBACK');
    expect(sql(driver.client)).not.toContain('COMMIT');
    expect(driver.client.releases).toEqual([undefined]);
    expect(driver.endCalls).toBe(1);
  });

  it('denies unexpected DB principal before opening a user transaction; closes the pool', async () => {
    const driver = new SyntheticDriverPoolV1();
    driver.client.currentUser = 'different_login';
    await expect(withCloudflareRequestSubjectScopeV1({
      createPool: () => driver.asSubjectPool(),
      execute: pool => executeMember(pool, () => 'unreachable'),
    })).rejects.toMatchObject({ code: 'PRINCIPAL_MISMATCH' });
    expect(sql(driver.client)).not.toContain('BEGIN');
    expect(driver.client.releases[0]).toBeInstanceOf(Error);
    expect(driver.endCalls).toBe(1);
  });

  it('denies a login unable to SET LOCAL ROLE; closes the pool', async () => {
    const driver = new SyntheticDriverPoolV1();
    driver.client.canEnterExecutionRole = false;
    await expect(withCloudflareRequestSubjectScopeV1({
      createPool: () => driver.asSubjectPool(),
      execute: pool => executeMember(pool, () => 'unreachable'),
    })).rejects.toMatchObject({ code: 'EXECUTION_ROLE_UNAVAILABLE' });
    expect(sql(driver.client)).not.toContain('BEGIN');
    expect(driver.client.releases).toHaveLength(1);
    expect(driver.endCalls).toBe(1);
  });

  it('keeps original transaction+rollback failure and discards checkout before close', async () => {
    const driver = new SyntheticDriverPoolV1();
    const rollback = new Error('synthetic rollback failure');
    driver.client.rollbackError = rollback;
    await expect(withCloudflareRequestSubjectScopeV1({
      createPool: () => driver.asSubjectPool(),
      execute: pool => executeMember(pool, () => { throw Error('synthetic scope failure'); }),
    })).rejects.toBeInstanceOf(AggregateError);
    expect(sql(driver.client).at(-1)).toBe('ROLLBACK');
    expect(driver.client.releases).toEqual([rollback]);
    expect(driver.endCalls).toBe(1);
  });

  it('fails closed if pool termination fails even after successful authority work', async () => {
    const driver = new SyntheticDriverPoolV1();
    const closing = new Error('synthetic pool shutdown failure');
    driver.endError = closing;
    await expect(withCloudflareRequestSubjectScopeV1({
      createPool: () => driver.asSubjectPool(),
      execute: pool => executeMember(pool, subject => subject),
    })).rejects.toBe(closing);
    expect(driver.endCalls).toBe(1);
    expect(sql(driver.client).at(-1)).toBe('COMMIT');
  });

  it('retains BOTH original operation failure and close failure', async () => {
    const driver = new SyntheticDriverPoolV1();
    const failure = new Error('synthetic operation failure');
    const closing = new Error('synthetic cleanup failure');
    driver.endError = closing;
    await expect(withCloudflareRequestSubjectScopeV1({
      createPool: () => driver.asSubjectPool(),
      execute: pool => executeMember(pool, () => { throw failure; }),
    })).rejects.toMatchObject({ errors: [failure, closing] });
    expect(driver.endCalls).toBe(1);
  });

  it('never lends a connection whose async checkout finishes after request closure', async () => {
    let finishConnect!: (connection: { query(): Promise<{ rows: readonly never[] }>; release(error?: unknown): void }) => void;
    let releasedError: unknown;
    const connecting = new Promise<{ query(): Promise<{ rows: readonly never[] }>; release(error?: unknown): void }>(
      resolve => { finishConnect = resolve; },
    );
    let pending!: Promise<unknown>;
    let closeCalls = 0;
    const requestResult = await withCloudflareRequestSubjectScopeV1({
      createPool: () => ({
        connect: () => connecting,
        close: async () => { closeCalls++; },
      }),
      execute: pool => {
        pending = Promise.resolve(pool.connect());
        // A real caller should await checkout; the adapter must still
        // discard an unsafe connection if a caller violates this rule.
        void pending.catch(() => undefined);
        return 'finished';
      },
    });
    expect(requestResult).toBe('finished');
    finishConnect({
      query: async () => ({ rows: [] }),
      release: error => { releasedError = error; },
    });
    await expect(pending).rejects.toThrow('request scope has ended');
    expect(releasedError).toBeInstanceOf(Error);
    expect(closeCalls).toBe(1);
  });

  it('does not call work or close when the pool factory rejects before construction', async () => {
    let executed = false;
    const failure = new Error('offline pool factory failed');
    await expect(withCloudflareRequestSubjectScopeV1({
      createPool: () => Promise.reject(failure),
      execute: () => { executed = true; },
    })).rejects.toBe(failure);
    expect(executed).toBe(false);
  });
});
