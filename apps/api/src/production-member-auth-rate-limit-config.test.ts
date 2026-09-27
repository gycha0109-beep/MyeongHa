import { describe, expect, it } from 'vitest';
import { parseProductionMemberAuthRateLimitConfigV1 } from './production-member-auth-rate-limit-config.js';

function baseEnv(secret = 'r'.repeat(32)) {
  return {
    MYEONGHA_DATABASE_URL:
      'postgresql://myeongha_login:secret@db.example.test:5432/postgres?sslmode=require',
    MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_login',
    MYEONGHA_AUTH_RATE_LIMIT_SECRET: secret,
  };
}

describe('Production Member Auth rate-limit config', () => {
  it('parses only the Postgres authority and dedicated HMAC secret', () => {
    const config = parseProductionMemberAuthRateLimitConfigV1(baseEnv());
    expect(config.databasePrincipal).toBe('myeongha_login');
    expect(config.databaseExecutionRole).toBe('myeongha_api_executor');
    expect(config.authRateLimitSecret).toHaveLength(32);
  });

  it('does not require Supabase or Guest secrets', () => {
    expect(() => parseProductionMemberAuthRateLimitConfigV1(baseEnv())).not.toThrow();
  });

  it('rejects a short dedicated secret', () => {
    expect(() => parseProductionMemberAuthRateLimitConfigV1(baseEnv('too-short')))
      .toThrow('MYEONGHA_AUTH_RATE_LIMIT_SECRET');
  });
});
