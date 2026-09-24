import { describe, expect, it, vi } from 'vitest';
import {
  createPwnedPasswordCompromiseGuardV1,
  PASSWORD_COMPROMISE_GUARD_V1,
} from './breached-password-guard.js';

describe('Password Compromise Guard v1', () => {
  it('sends only the five-character SHA-1 prefix to the HIBP range endpoint', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe('https://api.pwnedpasswords.com/range/5BAA6');
      expect(url).not.toContain('password');
      expect(url).not.toContain('1E4C9B93F3F0682250B6CF8331B7EE68FD8');
      expect(init?.method).toBe('GET');
      expect(init?.headers).toMatchObject({
        Accept: 'text/plain',
        'Add-Padding': 'true',
        'User-Agent': 'MyeongHa-Password-Compromise-Guard/1.0',
      });
      expect(init?.body).toBeUndefined();
      return new Response(
        [
          '00000000000000000000000000000000000:0',
          '1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493',
        ].join('\r\n'),
        { status: 200, headers: { 'Content-Type': 'text/plain' } },
      );
    });

    const guard = createPwnedPasswordCompromiseGuardV1({ fetchImpl });
    const result = await guard.check('password');

    expect(result).toEqual({ status: 'compromised', occurrenceCount: 3861493 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(PASSWORD_COMPROMISE_GUARD_V1.requestAuthority).toBe('SHA1_PREFIX_5_ONLY');
    expect(PASSWORD_COMPROMISE_GUARD_V1.plaintextPasswordExternalTransmission).toBe(false);
    expect(PASSWORD_COMPROMISE_GUARD_V1.fullSha1ExternalTransmission).toBe(false);
  });

  it('returns clear when the exact suffix is absent', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      [
        '00000000000000000000000000000000000:0',
        'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:123',
      ].join('\n'),
      { status: 200 },
    ));

    const guard = createPwnedPasswordCompromiseGuardV1({ fetchImpl });
    await expect(guard.check('password')).resolves.toEqual({ status: 'clear' });
  });

  it('fails unavailable on malformed range data instead of treating it as clear', async () => {
    const fetchImpl = vi.fn(async () => new Response('malformed-range-response', { status: 200 }));
    const guard = createPwnedPasswordCompromiseGuardV1({ fetchImpl });

    await expect(guard.check('password')).resolves.toEqual({ status: 'unavailable' });
  });

  it('fails unavailable on provider error or timeout without exposing the password', async () => {
    const providerError = createPwnedPasswordCompromiseGuardV1({
      fetchImpl: vi.fn(async () => new Response('unavailable', { status: 503 })),
    });
    await expect(providerError.check('secret-password')).resolves.toEqual({ status: 'unavailable' });

    const timeoutGuard = createPwnedPasswordCompromiseGuardV1({
      timeoutMs: 5,
      fetchImpl: vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      })),
    });
    await expect(timeoutGuard.check('secret-password')).resolves.toEqual({ status: 'unavailable' });
  });

  it('fails unavailable when the range response exceeds the governed byte ceiling', async () => {
    const oversized = 'A'.repeat(PASSWORD_COMPROMISE_GUARD_V1.responseBodyMaxBytes + 1);
    const guard = createPwnedPasswordCompromiseGuardV1({
      fetchImpl: vi.fn(async () => new Response(oversized, {
        status: 200,
        headers: { 'Content-Length': String(oversized.length) },
      })),
    });

    await expect(guard.check('password')).resolves.toEqual({ status: 'unavailable' });
  });
});
