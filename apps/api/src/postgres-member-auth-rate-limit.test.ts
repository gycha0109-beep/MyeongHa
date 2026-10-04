import { describe, expect, it } from 'vitest';
import { PostgresMemberAuthRateLimitAdmissionPortV1 } from './postgres-member-auth-rate-limit.js';
import type {
  PostgresQueryResultV1,
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';

class FakeConnection implements PostgresSubjectConnectionV1 {
  readonly calls: Array<{ text: string; values?: readonly unknown[] }> = [];
  releasedWith: unknown = Symbol('not-released');

  constructor(
    private readonly rows: readonly Record<string, unknown>[],
    private readonly failAdmission = false,
  ) {}

  async query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PostgresQueryResultV1<Row>> {
    this.calls.push({ text, ...(values === undefined ? {} : { values }) });
    if (this.failAdmission && text.includes('cmd_admit_member_auth_request_v1')) {
      throw new Error('db unavailable');
    }
    return {
      rows: (text.includes('cmd_admit_member_auth_request_v1') ? this.rows : []) as readonly Row[],
    };
  }

  release(error?: unknown): void {
    this.releasedWith = error;
  }
}

class FakePool implements PostgresSubjectPoolV1 {
  constructor(readonly connection: FakeConnection) {}
  async connect() {
    return this.connection;
  }
}

describe('Postgres Member Auth rate-limit port', () => {
  it('enters the governed execution role and commits one strict admission row', async () => {
    const connection = new FakeConnection([
      { allowed: true, requestCount: 7, resetAt: '2026-09-27T03:00:00.000Z' },
    ]);
    const port = new PostgresMemberAuthRateLimitAdmissionPortV1(new FakePool(connection));

    await expect(port.admit({
      action: 'sign-in',
      clientFingerprint: new Uint8Array(32).fill(1),
    })).resolves.toEqual({
      allowed: true,
      requestCount: 7,
      resetAt: '2026-09-27T03:00:00.000Z',
    });

    expect(connection.calls.map((call) => call.text)).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('public.cmd_admit_member_auth_request_v1'),
      'COMMIT',
    ]);
    const values = connection.calls[2]?.values;
    expect(values?.[0]).toBe('sign-in');
    expect(Buffer.isBuffer(values?.[1])).toBe(true);
    expect((values?.[1] as Buffer).byteLength).toBe(32);
    expect(connection.releasedWith).toBeUndefined();
  });

  it('rolls back when the authority command fails', async () => {
    const connection = new FakeConnection([], true);
    const port = new PostgresMemberAuthRateLimitAdmissionPortV1(new FakePool(connection));

    await expect(port.admit({
      action: 'refresh',
      clientFingerprint: new Uint8Array(32).fill(2),
    })).rejects.toThrow('db unavailable');

    expect(connection.calls.map((call) => call.text)).toEqual([
      'BEGIN',
      'SET LOCAL ROLE myeongha_api_executor',
      expect.stringContaining('public.cmd_admit_member_auth_request_v1'),
      'ROLLBACK',
    ]);
  });

  it('rejects non-32-byte fingerprints before opening a connection', async () => {
    let connected = false;
    const pool: PostgresSubjectPoolV1 = {
      connect() {
        connected = true;
        throw new Error('must not connect');
      },
    };
    const port = new PostgresMemberAuthRateLimitAdmissionPortV1(pool);

    await expect(port.admit({
      action: 'sign-up',
      clientFingerprint: new Uint8Array(31),
    })).rejects.toThrow('exactly 32 bytes');
    expect(connected).toBe(false);
  });
});
