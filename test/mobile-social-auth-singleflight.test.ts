import { describe, expect, it } from 'vitest';

import {
  createMobileSocialAuthServiceV1,
} from '../apps/mobile/src/core/auth/mobile-social-auth.js';
import type { MyeongHaApiClientV1 } from '../packages/api-client/src/index.js';

const callbackUrl = 'myeongha://auth/callback?state=abcdefghijklmnop';

function createHeldCallbackService() {
  let releaseRead!: () => void;
  const holdRead = new Promise<void>((resolve) => { releaseRead = resolve; });
  let reads = 0;

  const service = createMobileSocialAuthServiceV1({
    client: {} as MyeongHaApiClientV1,
    subjectSession: {
      acquireGuestCredential: async () => { throw new Error('not called'); },
    },
    guestStore: {
      read: async () => null,
      clear: async () => {},
    },
    memberStore: {
      write: async () => { throw new Error('not called'); },
    },
    pendingStore: {
      read: async () => {
        reads += 1;
        if (reads === 1) await holdRead;
        return null;
      },
      write: async () => { throw new Error('not called'); },
      clear: async () => true,
    },
    openAuthorizationUrl: async () => {},
  });

  return { service, releaseRead, getReads: () => reads };
}

describe('mobile OAuth callback concurrency', () => {
  it('single-flights an identical callback before the first pending-store read finishes', async () => {
    const { service, releaseRead, getReads } = createHeldCallbackService();
    const first = service.complete(callbackUrl);
    const duplicate = service.complete(callbackUrl);

    // In particular, duplicate delivery must not allocate a second
    // guest promotion, durable Member write or pending-state read.
    expect(duplicate).toBe(first);
    expect(getReads()).toBe(1);

    releaseRead();
    await expect(first).rejects.toMatchObject({
      code: 'MOBILE_SOCIAL_AUTH_PENDING_EXPIRED',
    });
    await expect(duplicate).rejects.toMatchObject({
      code: 'MOBILE_SOCIAL_AUTH_PENDING_EXPIRED',
    });

    // A settled failure releases the in-memory lock for a later retry.
    await expect(service.complete(callbackUrl)).rejects.toMatchObject({
      code: 'MOBILE_SOCIAL_AUTH_PENDING_EXPIRED',
    });
    expect(getReads()).toBe(2);
  });

  it('does not coalesce a different callback into an in-flight verified session', async () => {
    const { service, releaseRead, getReads } = createHeldCallbackService();
    const first = service.complete(callbackUrl);

    await expect(service.complete(
      'myeongha://auth/callback?state=qrstuvwxyz123456',
    )).rejects.toMatchObject({
      code: 'MOBILE_SOCIAL_AUTH_CALLBACK_IN_FLIGHT',
    });
    expect(getReads()).toBe(1);

    releaseRead();
    await expect(first).rejects.toMatchObject({
      code: 'MOBILE_SOCIAL_AUTH_PENDING_EXPIRED',
    });
  });
});
