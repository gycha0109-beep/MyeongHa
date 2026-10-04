import { describe, expect, it } from 'vitest';
import {
  resolveMeDispatchTargetForTestV1,
  toCanonicalMeRequestForTestV1,
} from '../api/me.js';

const INSTALLATION_ID = 'd2000000-0000-4000-8000-00000000b001';

describe('Device Installation Vercel dispatch', () => {
  it('canonicalizes the register rewrite without trusting a client subject id', async () => {
    const request = new Request(
      'https://myeongha.example/api/me?__myeongha_device_installation_action=register',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          installationKey: 'mobile-key-a',
          platform: 'android',
          expoPushToken: 'ExpoPushToken[abcdefghijklmnopqrstuvwxyz012345]',
          appVersion: '0.1.0',
          clientCapability: 'mobile-push-registration-v1',
        }),
      },
    );

    const target = resolveMeDispatchTargetForTestV1(request);
    expect(target).toEqual({
      kind: 'device-installation-register',
      route: '/api/device-installations/register',
    });
    const canonical = toCanonicalMeRequestForTestV1(request, target ?? undefined);
    expect(canonical.url).toBe(
      'https://myeongha.internal/api/device-installations/register',
    );
    expect(canonical.method).toBe('POST');
    expect(await canonical.json()).not.toHaveProperty('subjectId');
  });

  it('accepts the Vercel-preserved public register path', () => {
    const request = new Request(
      'https://myeongha.example/api/device-installations/register?__myeongha_device_installation_action=register',
      { method: 'POST' },
    );

    expect(resolveMeDispatchTargetForTestV1(request)).toEqual({
      kind: 'device-installation-register',
      route: '/api/device-installations/register',
    });
  });

  it('canonicalizes only a valid revoke installation id', () => {
    const request = new Request(
      `https://myeongha.example/api/me?__myeongha_device_installation_action=revoke&__myeongha_device_installation_id=${INSTALLATION_ID}`,
      { method: 'POST' },
    );
    const target = resolveMeDispatchTargetForTestV1(request);
    expect(target).toEqual({
      kind: 'device-installation-revoke',
      route: `/api/device-installations/${INSTALLATION_ID}/revoke`,
      installationId: INSTALLATION_ID,
    });
  });

  it('accepts a Vercel-preserved revoke path only when every id agrees', () => {
    const request = new Request(
      `https://myeongha.example/api/device-installations/${INSTALLATION_ID}/revoke?__myeongha_device_installation_action=revoke&__myeongha_device_installation_id=${INSTALLATION_ID}&id=${INSTALLATION_ID}`,
      { method: 'POST' },
    );

    expect(resolveMeDispatchTargetForTestV1(request)).toEqual({
      kind: 'device-installation-revoke',
      route: `/api/device-installations/${INSTALLATION_ID}/revoke`,
      installationId: INSTALLATION_ID,
    });
  });

  it('fails closed on orphan ids, conflicting source paths, and mixed dispatch metadata', () => {
    expect(resolveMeDispatchTargetForTestV1(new Request(
      `https://myeongha.example/api/me?__myeongha_device_installation_id=${INSTALLATION_ID}`,
      { method: 'POST' },
    ))).toBeNull();

    expect(resolveMeDispatchTargetForTestV1(new Request(
      'https://myeongha.example/api/me?__myeongha_device_installation_action=register&__myeongha_records_read=readings',
      { method: 'POST' },
    ))).toBeNull();

    expect(resolveMeDispatchTargetForTestV1(new Request(
      `https://myeongha.example/api/device-installations/${INSTALLATION_ID}/revoke?__myeongha_device_installation_action=revoke&__myeongha_device_installation_id=d2000000-0000-4000-8000-00000000b002&id=${INSTALLATION_ID}`,
      { method: 'POST' },
    ))).toBeNull();
  });
});
