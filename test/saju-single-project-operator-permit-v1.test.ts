import { describe, expect, it, vi } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import { MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF } from
  '../apps/api/src/production-user-data-runtime-config.js';
import {
  createSajuSingleProjectPermitConsumerV1,
  parseSajuSingleProjectPermitScopeV1,
  SAJU_SINGLE_PROJECT_CONSUME_SQL_V1,
  SAJU_SINGLE_PROJECT_PERMIT_ROLE_V1,
} from '../apps/api/src/saju-single-project-operator-permit-v1.js';

const scope = {
  permitId: '123e4567-e89b-42d3-a456-426614174011',
  scopeDigest: 'a'.repeat(64),
  ownerIntentDigest: 'b'.repeat(64),
  myeonghaCommitSha: 'c'.repeat(40),
  sajuCommitSha: 'd'.repeat(40),
  auditEventId: '123e4567-e89b-42d3-a456-426614174012',
  auditDigest: 'e'.repeat(64),
};
type Failure = 'connect' | 'begin' | 'role' | 'consume' | 'commit' | 'rollback';
function fixture(input: {
  fail?: Failure;
  dbResult?: true | false | 'wrong-row' | 'many-rows' | 'string-true';
} = {}) {
  const log: { sql: string; args?: readonly unknown[] }[] = [];
  const claimed = new Set<string>();
  const release = vi.fn((_error?: unknown) => undefined);
  const connect = vi.fn(async () => {
    if (input.fail === 'connect') throw Error('secret connection string');
    return {
      async query<Row = Record<string, unknown>>(sql: string, args?: readonly unknown[]) {
        log.push(args === undefined ? { sql } : { sql, args });
        if (input.fail === 'begin' && sql.startsWith('BEGIN')) throw Error('BEGIN_ERROR_SECRET');
        if (input.fail === 'role' && sql.startsWith('SET LOCAL ROLE')) {
          throw Error('wrong principal');
        }
        if (input.fail === 'consume' && sql === SAJU_SINGLE_PROJECT_CONSUME_SQL_V1) {
          throw Error('RPC_NOT_AUTHORIZED_SECRET');
        }
        if (input.fail === 'commit' && sql === 'COMMIT') throw Error('lost COMMIT reply');
        if (input.fail === 'rollback' && sql === 'ROLLBACK') throw Error('lost ROLLBACK reply');
        if (sql === SAJU_SINGLE_PROJECT_CONSUME_SQL_V1) {
          if (input.dbResult === 'wrong-row') return {rows: [] as Row[]};
          if (input.dbResult === 'many-rows') return {
            rows: [{ consumed: true }, { consumed: true }] as Row[],
          };
          if (input.dbResult === 'string-true') return {
            rows: [{ consumed: 'true' }] as Row[],
          };
          if (input.dbResult === false) return {rows: [{ consumed: false }] as Row[]};
          const id = String(args?.[0]);
          if (claimed.has(id)) return {rows: [{ consumed: false }] as Row[]};
          claimed.add(id);
          return {rows: [{ consumed: true }] as Row[]};
        }
        return {rows: [] as Row[]};
      },
      release,
    };
  });
  const pool: PostgresSubjectPoolV1 = { connect };
  return {
    log, connect, release, pool,
    consumer: createSajuSingleProjectPermitConsumerV1({pool, scope}),
  };
}

describe('Saju single-project dormant one-shot Owner probe adapter', () => {
  it('does no I/O at construction; one exact role-bound DB claim then stays blocked', async () => {
    const f = fixture();
    expect(f.connect).not.toHaveBeenCalled();
    const first = await f.consumer.consumeOnce();
    expect(first).toEqual({
      version: 'myeongha-saju-single-project-operator-permit-v1',
      consumption: 'COMMITTED_UNVERIFIED_OWNER_AUTHORITY',
      ownerAuthority: 'NOT_VERIFIED',
      independentAudit: 'NOT_VERIFIED',
      canRunOnce: false, canExecute: false, canPublish: false, canSell: false,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect((await f.consumer.consumeOnce()).consumption).toBe('BLOCKED');
    expect(f.connect).toHaveBeenCalledOnce();
    expect(f.release).toHaveBeenCalledOnce();
    expect(SAJU_SINGLE_PROJECT_PERMIT_ROLE_V1)
      .toBe('myeongha_saju_bridge_permit_executor');
    expect(f.log.map(x => x.sql)).toEqual([
      'BEGIN ISOLATION LEVEL READ COMMITTED',
      'SET LOCAL ROLE myeongha_saju_bridge_permit_executor',
      SAJU_SINGLE_PROJECT_CONSUME_SQL_V1,
      'COMMIT',
    ]);
    expect(f.log[2]?.args).toEqual([
      scope.permitId, MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
      scope.scopeDigest, scope.ownerIntentDigest,
      scope.myeonghaCommitSha, scope.sajuCommitSha,
      scope.auditEventId, scope.auditDigest,
    ]);
    expect(f.log[2]?.sql).toContain('saju_bridge_private.cmd_consume_operator_permit_v1');
    expect(JSON.stringify(first)).not.toContain(scope.scopeDigest);
  });

  it('does not let mutating the caller scope change any prepared SQL predicate', async () => {
    const caller = { ...scope };
    const f = fixture();
    const consumer = createSajuSingleProjectPermitConsumerV1({
      pool: f.pool, scope: caller,
    });
    caller.scopeDigest = 'f'.repeat(64);
    caller.ownerIntentDigest = '0'.repeat(64);
    expect((await consumer.consumeOnce()).consumption)
      .toBe('COMMITTED_UNVERIFIED_OWNER_AUTHORITY');
    expect(f.log.find(q => q.sql === SAJU_SINGLE_PROJECT_CONSUME_SQL_V1)?.args?.[2])
      .toBe(scope.scopeDigest);
    expect(f.log.find(q => q.sql === SAJU_SINGLE_PROJECT_CONSUME_SQL_V1)?.args?.[3])
      .toBe(scope.ownerIntentDigest);
  });

  it('cannot double-consume from two consumers backed by one DB ledger', async () => {
    const f = fixture();
    const other = createSajuSingleProjectPermitConsumerV1({pool:f.pool,scope});
    const statuses = await Promise.all([
      f.consumer.consumeOnce(), other.consumeOnce(),
    ]);
    expect(statuses.map(x => x.consumption).sort()).toEqual([
      'BLOCKED', 'COMMITTED_UNVERIFIED_OWNER_AUTHORITY',
    ]);
    expect(f.log.filter(x => x.sql === SAJU_SINGLE_PROJECT_CONSUME_SQL_V1))
      .toHaveLength(2);
  });

  it.each([
    ['invalid permit UUID', {...scope, permitId: 'invalid'}],
    ['permit and audit ID same', {...scope, auditEventId: scope.permitId}],
    ['invalid revision SHA', {...scope, myeonghaCommitSha:'z'.repeat(40)}],
    ['uppercase scope digest', {...scope, scopeDigest:'F'.repeat(64)}],
    ['missing owner approval digest', {...scope, ownerIntentDigest:''}],
    ['unrecognized key', {...scope, unexpected: 'field'}],
    ['missing field', {permitId:scope.permitId}],
    ['array', [scope]],
    ['null', null],
  ])('rejects %s before a DB connection exists', (_name, candidate) => {
    const f = fixture();
    expect(() => parseSajuSingleProjectPermitScopeV1(candidate)).toThrow(TypeError);
    expect(() => createSajuSingleProjectPermitConsumerV1({
      pool:f.pool, scope:candidate,
    })).toThrow(TypeError);
    expect(f.connect).not.toHaveBeenCalled();
  });

  it('rejects getter/proxy input before any trust or connection allocation', () => {
    const candidate = Object.fromEntries(
      Object.entries(scope).map(([k,v]) => [k,v]),
    );
    Object.defineProperty(candidate, 'scopeDigest', {
      enumerable:true, get() { throw Error('secret getter'); },
    });
    expect(() => parseSajuSingleProjectPermitScopeV1(candidate)).toThrow(TypeError);
  });

  it.each(['connect','begin','role','consume','commit','rollback'] as const)(
    'fails closed on %s without retry or secret leakage', async fail => {
      const f = fixture({fail, dbResult: fail === 'rollback' ? false : true});
      const result = await f.consumer.consumeOnce();
      expect(result.consumption).toBe('BLOCKED');
      expect(result.canRunOnce).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(/SECRET|connection string|COMMIT reply/);
      expect((await f.consumer.consumeOnce()).consumption).toBe('BLOCKED');
      expect(f.connect).toHaveBeenCalledOnce();
      if (fail === 'commit') {
        expect(f.log.map(x => x.sql)).toContain('COMMIT');
        expect(f.log.map(x => x.sql)).toContain('ROLLBACK');
        expect(f.release.mock.calls[0]?.[0]).toBeDefined();
      }
      if (fail === 'rollback') expect(f.release.mock.calls[0]?.[0]).toBeDefined();
    },
  );

  it.each(['wrong-row','many-rows','string-true'] as const)(
    'rejects %s instead of inferring authority', async dbResult => {
      const f = fixture({dbResult});
      const result = await f.consumer.consumeOnce();
      expect(result.consumption).toBe('BLOCKED');
      expect(result.ownerAuthority).toBe('NOT_VERIFIED');
      expect(f.log.map(x=>x.sql)).toContain('ROLLBACK');
      expect(f.log.map(x=>x.sql)).not.toContain('COMMIT');
    },
  );

  it('rejects an unissued/revoked/expired/drifted permit from DB', async () => {
    const f = fixture({dbResult:false});
    const result = await f.consumer.consumeOnce();
    expect(result.consumption).toBe('BLOCKED');
    expect(result.canExecute).toBe(false);
    expect(f.log.map(x=>x.sql)).toEqual([
      'BEGIN ISOLATION LEVEL READ COMMITTED',
      'SET LOCAL ROLE myeongha_saju_bridge_permit_executor',
      SAJU_SINGLE_PROJECT_CONSUME_SQL_V1,
      'ROLLBACK',
    ]);
  });
});
