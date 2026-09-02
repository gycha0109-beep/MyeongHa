import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createNodePostgresDriverPoolConfigV1 } from '../apps/api/src/node-postgres-subject-pool.js';
import {
  SUPABASE_ROOT_CA_2021_PEM,
  SUPABASE_ROOT_CA_2021_SHA256_FINGERPRINT,
} from '../apps/api/src/supabase-root-ca-2021.js';

describe('node-postgres production TLS configuration', () => {
  it('pins the expected Supabase Root 2021 CA certificate', () => {
    const certificate = new X509Certificate(SUPABASE_ROOT_CA_2021_PEM);

    expect(certificate.fingerprint256).toBe(
      SUPABASE_ROOT_CA_2021_SHA256_FINGERPRINT,
    );
    expect(certificate.subject).toContain('CN=Supabase Root 2021 CA');
    expect(certificate.issuer).toContain('CN=Supabase Root 2021 CA');
  });

  it('removes connection-string SSL overrides and keeps explicit CA plus hostname verification', () => {
    const config = createNodePostgresDriverPoolConfigV1(
      'postgresql://myeongha_runtime:password@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require&sslrootcert=%2Ftmp%2Funtrusted.crt&sslcert=%2Ftmp%2Fclient.crt&sslkey=%2Ftmp%2Fclient.key&uselibpqcompat=true&application_name=myeongha',
    );

    const sanitizedUrl = new URL(String(config.connectionString));
    expect(sanitizedUrl.searchParams.get('sslmode')).toBeNull();
    expect(sanitizedUrl.searchParams.get('sslrootcert')).toBeNull();
    expect(sanitizedUrl.searchParams.get('sslcert')).toBeNull();
    expect(sanitizedUrl.searchParams.get('sslkey')).toBeNull();
    expect(sanitizedUrl.searchParams.get('uselibpqcompat')).toBeNull();
    expect(sanitizedUrl.searchParams.get('application_name')).toBe('myeongha');

    expect(config.ssl).toEqual({
      ca: SUPABASE_ROOT_CA_2021_PEM,
      rejectUnauthorized: true,
    });
    expect(config.max).toBe(4);
    expect(config.connectionTimeoutMillis).toBe(5_000);
    expect(config.idleTimeoutMillis).toBe(10_000);
    expect(config.allowExitOnIdle).toBe(true);
  });
});
