import { describe, expect, it } from 'vitest';
import {
  buildNodePostgresPoolConfigV1,
  NODE_POSTGRES_SUBJECT_POOL_DEFAULTS_V1,
  NodePostgresSubjectPoolErrorV1,
} from './node-postgres-subject-pool.js';

const DATABASE_URL =
  'postgresql://myeongha_login:secret@db.example.test:5432/postgres?sslmode=require';

describe('Node PostgreSQL subject pool timeout profiles', () => {
  it('preserves existing defaults when no profile is supplied', () => {
    const config = buildNodePostgresPoolConfigV1(DATABASE_URL);
    expect(config.max).toBe(
      NODE_POSTGRES_SUBJECT_POOL_DEFAULTS_V1.maxConnectionsPerRuntime,
    );
    expect(config.connectionTimeoutMillis).toBe(
      NODE_POSTGRES_SUBJECT_POOL_DEFAULTS_V1.connectionTimeoutMs,
    );
    expect(config.idleTimeoutMillis).toBe(
      NODE_POSTGRES_SUBJECT_POOL_DEFAULTS_V1.idleTimeoutMs,
    );
    expect(config.statement_timeout).toBe(
      NODE_POSTGRES_SUBJECT_POOL_DEFAULTS_V1.statementTimeoutMs,
    );
  });

  it('allows a narrower Member Auth admission profile without changing defaults', () => {
    const config = buildNodePostgresPoolConfigV1(DATABASE_URL, {
      maxConnectionsPerRuntime: 4,
      connectionTimeoutMs: 1_500,
      idleTimeoutMs: 5_000,
      statementTimeoutMs: 1_500,
    });
    expect(config.max).toBe(4);
    expect(config.connectionTimeoutMillis).toBe(1_500);
    expect(config.idleTimeoutMillis).toBe(5_000);
    expect(config.statement_timeout).toBe(1_500);
  });

  it('rejects non-positive timeout/profile values', () => {
    expect(() => buildNodePostgresPoolConfigV1(DATABASE_URL, {
      connectionTimeoutMs: 0,
    })).toThrow(NodePostgresSubjectPoolErrorV1);
  });
});
