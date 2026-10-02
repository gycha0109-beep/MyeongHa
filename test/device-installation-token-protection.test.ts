import { describe, expect, it } from 'vitest';
import {
  protectProductionExpoPushTokenV1,
} from '../apps/api/src/device-installation-token-protection.js';

describe('Production Device Installation token protection', () => {
  it('never persists the raw token and produces stable fingerprint with randomized ciphertext', () => {
    const input = {
      rawToken: 'ExpoPushToken[abcdefghijklmnopqrstuvwxyz012345]',
      encryptionSecret: 'e'.repeat(48),
      fingerprintSecret: 'f'.repeat(48),
    };
    const first = protectProductionExpoPushTokenV1(input);
    const second = protectProductionExpoPushTokenV1(input);

    expect(first.keyId).toBe('k1');
    expect(first.fingerprint).toMatch(/^hmac-sha256:k1:[0-9a-f]{64}$/u);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.encryptedToken).toMatch(
      /^aes-256-gcm:k1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/u,
    );
    expect(first.encryptedToken).not.toBe(second.encryptedToken);
    expect(first.encryptedToken).not.toContain(input.rawToken);
  });

  it('requires independent production-strength secrets', () => {
    expect(() => protectProductionExpoPushTokenV1({
      rawToken: 'ExpoPushToken[abcdefghijklmnopqrstuvwxyz012345]',
      encryptionSecret: 'short',
      fingerprintSecret: 'f'.repeat(48),
    })).toThrow();
    expect(() => protectProductionExpoPushTokenV1({
      rawToken: 'ExpoPushToken[abcdefghijklmnopqrstuvwxyz012345]',
      encryptionSecret: 'e'.repeat(48),
      fingerprintSecret: 'short',
    })).toThrow();
  });
});
