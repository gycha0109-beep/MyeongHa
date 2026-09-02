import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_GUEST_BOOTSTRAP_ENV_V1,
  PRODUCTION_GUEST_BEARER_PREFIX_V1,
  ProductionGuestBootstrapActivationConfigErrorV1,
  createProductionGuestBootstrapCredentialIssuerPortV1,
  parseProductionGuestBootstrapActivationConfigV1,
} from '../apps/api/src/production-guest-bootstrap-credential-issuer.js';
import { fingerprintProductionGuestBearerTokenV1 } from '../apps/api/src/production-request-identity-verifier.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const GUEST_SESSION_ID = '22222222-2222-4222-8222-222222222222';
const OPAQUE_BEARER = `${PRODUCTION_GUEST_BEARER_PREFIX_V1}${'x'.repeat(40)}`;

function env(ttl?: string): Readonly<Record<string, string | undefined>> {
  return ttl === undefined
    ? {}
    : { [PRODUCTION_GUEST_BOOTSTRAP_ENV_V1.sessionTtlSeconds]: ttl };
}

describe('production Guest bootstrap credential issuer', () => {
  it('has no implicit Guest session TTL default', () => {
    expect(() => parseProductionGuestBootstrapActivationConfigV1(env())).toThrow(
      ProductionGuestBootstrapActivationConfigErrorV1,
    );
    expect(() => parseProductionGuestBootstrapActivationConfigV1(env())).toThrow(
      'MYEONGHA_GUEST_SESSION_TTL_SECONDS',
    );
  });

  it.each(['0', '-1', '1.5', '1e3', 'NaN', 'Infinity']) (
    'rejects non-positive or non-whole TTL policy value %s',
    (ttl) => {
      expect(() => parseProductionGuestBootstrapActivationConfigV1(env(ttl))).toThrow(
        ProductionGuestBootstrapActivationConfigErrorV1,
      );
    },
  );

  it('accepts only an explicitly supplied positive whole-number TTL', () => {
    expect(parseProductionGuestBootstrapActivationConfigV1(env(' 3600 '))).toEqual({
      guestSessionTtlSeconds: 3600,
    });
  });

  it('issues server-owned UUID identities, opaque bearer, and exact policy expiry', async () => {
    const uuids = [SUBJECT_ID, GUEST_SESSION_ID];
    const issuer = createProductionGuestBootstrapCredentialIssuerPortV1({
      config: { guestSessionTtlSeconds: 3600 },
      now: () => new Date('2026-09-02T00:00:00.000Z'),
      generateUuid: () => {
        const value = uuids.shift();
        if (value === undefined) throw new Error('unexpected UUID request');
        return value;
      },
      generateBearerToken: () => OPAQUE_BEARER,
    });

    await expect(issuer.issueGuestBootstrapCredential()).resolves.toEqual({
      subjectId: SUBJECT_ID,
      guestSessionId: GUEST_SESSION_ID,
      bearerToken: OPAQUE_BEARER,
      expiresAt: '2026-09-02T01:00:00.000Z',
    });
  });

  it('default bearer generation stays compatible with the production Guest verifier contract', async () => {
    const issuer = createProductionGuestBootstrapCredentialIssuerPortV1({
      config: { guestSessionTtlSeconds: 1 },
    });
    const issued = await issuer.issueGuestBootstrapCredential();

    expect(issued.bearerToken.startsWith(PRODUCTION_GUEST_BEARER_PREFIX_V1)).toBe(true);
    expect(issued.bearerToken).not.toContain('.');
    expect(
      fingerprintProductionGuestBearerTokenV1({
        rawBearerToken: issued.bearerToken,
        secret: 's'.repeat(32),
      }),
    ).toMatch(/^myeongha-guest-bearer-hmac-sha256-v1:[0-9a-f]{64}$/u);
  });

  it('fails closed if an injected generator emits a JWT-shaped bearer', async () => {
    const issuer = createProductionGuestBootstrapCredentialIssuerPortV1({
      config: { guestSessionTtlSeconds: 60 },
      generateUuid: (() => {
        const uuids = [SUBJECT_ID, GUEST_SESSION_ID];
        return () => uuids.shift() ?? SUBJECT_ID;
      })(),
      generateBearerToken: () =>
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.cccccccccccccccccccccccccccccccc',
    });

    await expect(issuer.issueGuestBootstrapCredential()).rejects.toThrow(
      'outside the Guest transport contract',
    );
  });

  it('fails closed when an explicit TTL cannot be represented as a Date expiry', async () => {
    const issuer = createProductionGuestBootstrapCredentialIssuerPortV1({
      config: { guestSessionTtlSeconds: Number.MAX_SAFE_INTEGER },
      now: () => new Date('2026-09-02T00:00:00.000Z'),
      generateUuid: (() => {
        const uuids = [SUBJECT_ID, GUEST_SESSION_ID];
        return () => uuids.shift() ?? SUBJECT_ID;
      })(),
      generateBearerToken: () => OPAQUE_BEARER,
    });

    await expect(issuer.issueGuestBootstrapCredential()).rejects.toThrow(
      'cannot be represented as an expiry instant',
    );
  });
});
