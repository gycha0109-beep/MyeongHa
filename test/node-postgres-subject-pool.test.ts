import { describe, expect, it } from 'vitest';
import {
  MYEONGHA_API_EXECUTION_ROLE,
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  type ProductionUserDataRuntimeConfigV1,
} from '../apps/api/src/production-user-data-runtime-config.js';
import {
  NODE_POSTGRES_SUBJECT_POOL_DEFAULTS_V1,
  NodePostgresSubjectPoolErrorV1,
  createNodePostgresSubjectPoolFromDriverV1,
  createNodePostgresSubjectPoolV1,
  type NodePostgresDriverClientV1,
  type NodePostgresDriverPoolV1,
  type NodePostgresDriverQueryResultV1,
} from '../apps/api/src/node-postgres-subject-pool.js';

const LOGIN_PRINCIPAL = 'myeongha_runtime';

type QueryCall = Readonly<{
  text: string;
  values: readonly unknown[] | undefined;
}>;

class FakeDriverClientV1 implements NodePostgresDriverClientV1 {
  readonly calls: QueryCall[] = [];
  readonly releases: Array<Error | undefined> = [];
  principalRows: readonly Record<string, unknown>[] = [
    {
      currentUser: LOGIN_PRINCIPAL,
      canEnterExecutionRole: true,
    },
  ];
  applicationRows: readonly Record<string, unknown>[] = [{ value: 42 }];
  principalError: unknown;

  async query(
    text: string,
    values?: readonly unknown[],
  ): Promise<NodePostgresDriverQueryResultV1> {
    this.calls.push(
      Object.freeze({
        text,
        values: values === undefined ? undefined : Object.freeze([...values]),
      }),
    );

    if (text.includes('pg_has_role')) {
      if (this.principalError !== undefined) throw this.principalError;
      return { rows: this.principalRows };
    }

    return { rows: this.applicationRows };
  }

  release(error?: Error): void {
    this.releases.push(error);
  }
}

class FakeDriverPoolV1 implements NodePostgresDriverPoolV1 {
  connectCalls = 0;
  endCalls = 0;

  constructor(readonly client: FakeDriverClientV1) {}

  async connect(): Promise<NodePostgresDriverClientV1> {
    this.connectCalls += 1;
    return this.client;
  }

  async end(): Promise<void> {
    this.endCalls += 1;
  }
}

function createFixture() {
  const client = new FakeDriverClientV1();
  const driverPool = new FakeDriverPoolV1(client);
  const pool = createNodePostgresSubjectPoolFromDriverV1({
    driverPool,
    expectedLoginPrincipal: LOGIN_PRINCIPAL,
  });
  return { client, driverPool, pool };
}

describe('node-postgres subject pool adapter', () => {
  it('uses conservative bounded pool defaults for a serverless runtime', () => {
    expect(NODE_POSTGRES_SUBJECT_POOL_DEFAULTS_V1).toEqual({
      maxConnectionsPerRuntime: 4,
      connectionTimeoutMs: 5_000,
      idleTimeoutMs: 10_000,
    });
  });

  it('verifies current_user and execution-role membership before exposing a connection', async () => {
    const fixture = createFixture();

    const connection = await fixture.pool.connect();

    expect(fixture.driverPool.connectCalls).toBe(1);
    expect(fixture.client.calls).toHaveLength(1);
    expect(fixture.client.calls[0]?.text).toContain('current_user');
    expect(fixture.client.calls[0]?.text).toContain('pg_has_role');
    expect(fixture.client.calls[0]?.values).toEqual([MYEONGHA_API_EXECUTION_ROLE]);
    expect(fixture.client.releases).toEqual([]);

    const result = await connection.query<{ value: number }>('select $1::int as value', [42]);
    expect(result.rows).toEqual([{ value: 42 }]);
    expect(fixture.client.calls[1]).toEqual({
      text: 'select $1::int as value',
      values: [42],
    });

    connection.release();
    expect(fixture.client.releases).toEqual([undefined]);
  });

  it('fails closed and discards the checkout when current_user differs from configured principal', async () => {
    const fixture = createFixture();
    fixture.client.principalRows = [
      {
        currentUser: 'unexpected_runtime',
        canEnterExecutionRole: true,
      },
    ];

    await expect(fixture.pool.connect()).rejects.toMatchObject({
      code: 'PRINCIPAL_MISMATCH',
    });
    expect(fixture.client.releases).toHaveLength(1);
    expect(fixture.client.releases[0]).toBeInstanceOf(
      NodePostgresSubjectPoolErrorV1,
    );
  });

  it('fails closed and discards the checkout when login principal cannot enter the ordinary execution role', async () => {
    const fixture = createFixture();
    fixture.client.principalRows = [
      {
        currentUser: LOGIN_PRINCIPAL,
        canEnterExecutionRole: false,
      },
    ];

    await expect(fixture.pool.connect()).rejects.toMatchObject({
      code: 'EXECUTION_ROLE_UNAVAILABLE',
    });
    expect(fixture.client.releases).toHaveLength(1);
  });

  it('fails closed on malformed preflight projection', async () => {
    const fixture = createFixture();
    fixture.client.principalRows = [];

    await expect(fixture.pool.connect()).rejects.toMatchObject({
      code: 'INVALID_PREFLIGHT_RESULT',
    });
    expect(fixture.client.releases).toHaveLength(1);
  });

  it('discards the checked-out driver connection when the transaction adapter marks it unhealthy', async () => {
    const fixture = createFixture();
    const connection = await fixture.pool.connect();
    const rollbackFailure = new Error('rollback failed');

    connection.release(rollbackFailure);

    expect(fixture.client.releases).toEqual([rollbackFailure]);
  });

  it('converts non-Error discard markers into a safe local error without leaking the original value', async () => {
    const fixture = createFixture();
    const connection = await fixture.pool.connect();

    connection.release({ secret: 'must-not-leak' });

    expect(fixture.client.releases).toHaveLength(1);
    expect(fixture.client.releases[0]?.message).toBe(
      'PostgreSQL subject connection was marked for discard.',
    );
    expect(fixture.client.releases[0]?.message).not.toContain('must-not-leak');
  });

  it('closes the underlying driver pool explicitly', async () => {
    const fixture = createFixture();

    await fixture.pool.close();

    expect(fixture.driverPool.endCalls).toBe(1);
  });

  it('rejects a production config that drifts away from the governed execution role before constructing a usable pool', () => {
    const config = {
      databaseUrl:
        'postgresql://myeongha_runtime:password@db.example.internal/postgres?sslmode=require',
      databasePrincipal: LOGIN_PRINCIPAL,
      databaseExecutionRole: 'unexpected_role',
      supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
      supabaseApiKey: 'sb_publishable_example_key_for_runtime_contract',
      guestFingerprintSecret:
        'guest-fingerprint-secret-material-at-least-thirty-two-bytes',
    } as unknown as ProductionUserDataRuntimeConfigV1;

    expect(() => createNodePostgresSubjectPoolV1(config)).toThrow(
      'does not target the governed API execution role',
    );
  });
});
