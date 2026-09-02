import { describe, expect, it } from 'vitest';
import {
  NodePostgresSubjectPoolErrorV1,
  normalizeNodePostgresConnectionStringV1,
} from '../apps/api/src/node-postgres-subject-pool.js';

const BASE_URL =
  'postgresql://myeongha_runtime.example:encoded%3Fpassword@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';

describe('node-postgres production pooler TLS semantics', () => {
  it('pins sslmode=require to explicit libpq-compatible encrypted transport semantics', () => {
    const normalized = normalizeNodePostgresConnectionStringV1(
      `${BASE_URL}?sslmode=require`,
    );
    const url = new URL(normalized);

    expect(url.protocol).toBe('postgresql:');
    expect(url.hostname).toBe('aws-0-ap-southeast-1.pooler.supabase.com');
    expect(url.port).toBe('6543');
    expect(decodeURIComponent(url.username)).toBe('myeongha_runtime.example');
    expect(decodeURIComponent(url.password)).toBe('encoded?password');
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.get('uselibpqcompat')).toBe('true');
  });

  it('keeps an already explicit compatible sslmode=require stable', () => {
    const normalized = normalizeNodePostgresConnectionStringV1(
      `${BASE_URL}?sslmode=require&uselibpqcompat=true`,
    );
    const url = new URL(normalized);

    expect(url.searchParams.getAll('uselibpqcompat')).toEqual(['true']);
    expect(url.searchParams.get('sslmode')).toBe('require');
  });

  it('never downgrades verify-full to require compatibility semantics', () => {
    const source = `${BASE_URL}?sslmode=verify-full&sslrootcert=%2Ftmp%2Fsupabase-ca.crt`;

    expect(normalizeNodePostgresConnectionStringV1(source)).toBe(source);
  });

  it('never rewrites verify-ca to require compatibility semantics', () => {
    const source = `${BASE_URL}?sslmode=verify-ca&sslrootcert=%2Ftmp%2Fsupabase-ca.crt`;

    expect(normalizeNodePostgresConnectionStringV1(source)).toBe(source);
  });

  it('fails closed when sslmode=require explicitly disables libpq compatibility', () => {
    expect(() =>
      normalizeNodePostgresConnectionStringV1(
        `${BASE_URL}?sslmode=require&uselibpqcompat=false`,
      ),
    ).toThrowError(NodePostgresSubjectPoolErrorV1);

    try {
      normalizeNodePostgresConnectionStringV1(
        `${BASE_URL}?sslmode=require&uselibpqcompat=false`,
      );
      throw new Error('expected TLS compatibility rejection');
    } catch (error) {
      expect(error).toMatchObject({ code: 'TLS_MODE_UNSUPPORTED' });
    }
  });
});
