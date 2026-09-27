import { describe, expect, it } from 'vitest';
import {
  fingerprintMemberAuthClientV1,
  MemberAuthClientNetworkKeyErrorV1,
  readTrustedVercelClientIpV1,
} from './member-auth-client-network-key.js';

const SECRET = 's'.repeat(32);

describe('Member Auth client network key', () => {
  it('accepts exactly one trusted IPv4 or IPv6 literal', () => {
    expect(readTrustedVercelClientIpV1(new Request('https://example.test', {
      headers: { 'x-forwarded-for': '203.0.113.9' },
    }))).toBe('203.0.113.9');
    expect(readTrustedVercelClientIpV1(new Request('https://example.test', {
      headers: { 'x-forwarded-for': '2001:db8::1' },
    }))).toBe('2001:db8::1');
  });

  it('rejects missing, forwarded chains, and non-IP values', () => {
    for (const value of [null, '203.0.113.9, 198.51.100.1', 'client.example']) {
      const request = new Request('https://example.test', {
        ...(value === null ? {} : { headers: { 'x-forwarded-for': value } }),
      });
      expect(() => readTrustedVercelClientIpV1(request))
        .toThrow(MemberAuthClientNetworkKeyErrorV1);
    }
  });

  it('derives deterministic endpoint-separated 32-byte fingerprints', () => {
    const signIn = fingerprintMemberAuthClientV1({
      clientIp: '203.0.113.9',
      action: 'sign-in',
      secret: SECRET,
    });
    const signInAgain = fingerprintMemberAuthClientV1({
      clientIp: '203.0.113.9',
      action: 'sign-in',
      secret: SECRET,
    });
    const signUp = fingerprintMemberAuthClientV1({
      clientIp: '203.0.113.9',
      action: 'sign-up',
      secret: SECRET,
    });

    expect(signIn.byteLength).toBe(32);
    expect(Buffer.from(signIn).equals(Buffer.from(signInAgain))).toBe(true);
    expect(Buffer.from(signIn).equals(Buffer.from(signUp))).toBe(false);
  });

  it('rejects short secrets', () => {
    expect(() => fingerprintMemberAuthClientV1({
      clientIp: '203.0.113.9',
      action: 'refresh',
      secret: 'short',
    })).toThrow(MemberAuthClientNetworkKeyErrorV1);
  });
});
