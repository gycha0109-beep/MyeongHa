import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1,
  withCloudflareDirectPostgresSubjectTransactionV1,
} from '../apps/api/src/cloudflare-direct-postgres-candidate.js';
import {
  MYEONGHA_API_EXECUTION_ROLE,
  type ProductionUserDataRuntimeEnvV1,
} from '../apps/api/src/production-user-data-runtime-config.js';

const syntheticUrl = new URL('postgresql://db.example.invalid:5432/postgres?sslmode=verify-full');
syntheticUrl.username = 'myeongha_runtime';
syntheticUrl.password = randomBytes(24).toString('hex');

const synthetic = Object.freeze({
  MYEONGHA_DATABASE_URL: syntheticUrl.toString(),
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime',
  MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
  // Deliberately INVALID certificate: never use a real Production CA in tests.
  MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM:
    '-----BEGIN CERTIFICATE-----\ninvalid-test-only-cert\n-----END CERTIFICATE-----',
});

async function denyBeforeAuthorityCallback(
  environment: ProductionUserDataRuntimeEnvV1,
): Promise<string> {
  let executed = false;
  let caught: unknown;
  try {
    await withCloudflareDirectPostgresSubjectTransactionV1({
      environment,
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: '91000000-0000-0000-0000-000000000001',
      },
      execute: () => {
        executed = true;
        return 'must-not-run';
      },
    });
  } catch (error) {
    caught = error;
  }
  expect(executed).toBe(false);
  expect(caught).toBeInstanceOf(Error);
  const message = (caught as Error).message;
  expect(message).not.toContain(syntheticUrl.password);
  expect(message).not.toContain('invalid-test-only-cert');
  return message;
}

describe('Cloudflare Direct TCP candidate, without database access', () => {
  it('limits each request to one independently disposable connection', () => {
    expect(CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1).toEqual({
      maxConnectionsPerRuntime: 1,
      connectionTimeoutMs: 5_000,
      idleTimeoutMs: 1_000,
      statementTimeoutMs: 5_000,
    });
    expect(Object.isFrozen(CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1)).toBe(true);
  });

  it('rejects missing credentials or partially configured environments before any DB work', async () => {
    expect(await denyBeforeAuthorityCallback({})).toContain('MYEONGHA_DATABASE_URL');
    expect(await denyBeforeAuthorityCallback({
      MYEONGHA_DATABASE_URL: synthetic.MYEONGHA_DATABASE_URL,
    })).toContain('MYEONGHA_DATABASE_PRINCIPAL');
    expect(await denyBeforeAuthorityCallback({
      ...synthetic,
      MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM: '',
    })).toContain('MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM');
  });

  it.each([
    ['disabled TLS', 'disable'],
    ['opportunistic TLS', 'prefer'],
    ['CA-only TLS', 'verify-ca'],
    ['no declared TLS', ''],
  ])('denies %s before creating a PostgreSQL client', async (_name, mode) => {
    const url = new URL(synthetic.MYEONGHA_DATABASE_URL);
    if (!mode) url.searchParams.delete('sslmode');
    else url.searchParams.set('sslmode', mode);
    const message = await denyBeforeAuthorityCallback({
      ...synthetic,
      MYEONGHA_DATABASE_URL: url.toString(),
    });
    expect(message).toMatch(/TLS|verify-full|sslmode|database/i);
  });

  it('denies unsupported TLS peer mode rather than accepting require-only', async () => {
    const message = await denyBeforeAuthorityCallback({
      ...synthetic,
      MYEONGHA_DATABASE_TLS_PEER_MODE: 'require',
    });
    expect(message).toContain('verify-full');
  });

  it('denies default PostgreSQL superuser or execution NOLOGIN role as login', async () => {
    for (const principal of ['postgres', 'supabase_admin', MYEONGHA_API_EXECUTION_ROLE]) {
      const message = await denyBeforeAuthorityCallback({
        ...synthetic,
        MYEONGHA_DATABASE_PRINCIPAL: principal,
      });
      expect(message).toMatch(/MYEONGHA_DATABASE_PRINCIPAL|role/i);
    }
  });

  it('rejects a certificate without the governed SHA256 pin before any client is created', async () => {
    const message = await denyBeforeAuthorityCallback({ ...synthetic });
    expect(message).toContain('PostgreSQL verify-full runtime authority validation failed');
  });

  it('does not accept a Hyperdrive binding in place of approved direct TLS credentials', async () => {
    const message = await denyBeforeAuthorityCallback({
      HYPERDRIVE: 'synthetic-binding-not-a-connection',
    });
    expect(message).toContain('MYEONGHA_DATABASE_URL');
  });

  it('never uses an environment that has a redirectable non-PostgreSQL URL', async () => {
    const message = await denyBeforeAuthorityCallback({
      ...synthetic,
      MYEONGHA_DATABASE_URL: 'https://db.example.invalid/postgres',
    });
    expect(message).toMatch(/postgres/i);
  });
});
