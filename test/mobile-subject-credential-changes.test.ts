import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import type {
  GuestCredentialV1,
  MemberSessionV1,
} from '../packages/api-client/src/index.js';
import {
  createMobileGuestCredentialStoreV1,
  type SecureKeyValueStoreV1,
} from '../apps/mobile/src/core/auth/guest-credential-store.js';
import {
  createMobileMemberSessionStoreV1,
} from '../apps/mobile/src/core/auth/member-session-store.js';
import {
  subscribeMobileSubjectCredentialChangesV1,
} from '../apps/mobile/src/core/session/mobile-subject-credential-changes.js';

const guest: GuestCredentialV1 = Object.freeze({
  kind: 'guest',
  subjectId: 'subject-guest-one',
  guestSessionId: 'guest-session-one',
  bearerToken: 'guest-token-one',
  expiresAt: '2026-10-30T00:00:00.000Z',
});
const member: MemberSessionV1 = Object.freeze({
  accessToken: 'member.access.token',
  refreshToken: 'member-refresh',
  expiresAt: '2026-10-30T00:00:00.000Z',
  tokenType: 'bearer',
  user: Object.freeze({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'member@example.com',
  }),
});

function fixture() {
  const values = new Map<string, string>();
  const storage: SecureKeyValueStoreV1 = {
    async getItemAsync(key) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      values.set(key, value);
    },
    async deleteItemAsync(key) {
      values.delete(key);
    },
  };
  return { values, storage };
}

describe('M3-beta-2b device-local archive invalidation on confirmed auth changes', () => {
  it('signals only after a verified Member sign-in write and exposes no identity in event', async () => {
    const { storage } = fixture();
    const store = createMobileMemberSessionStoreV1(storage);
    const observations: Array<{ arguments: number; member: MemberSessionV1 | null }> = [];
    let observed: MemberSessionV1 | null = null;
    const unsubscribe = subscribeMobileSubjectCredentialChangesV1(function () {
      observations.push({ arguments: arguments.length, member: observed });
    });
    // The store verifies its durable readback before publishing.
    const p = store.write(member);
    await p;
    observed = await store.read();
    // A subscriber sees a committed write even when called synchronously;
    // no bearer or Subject fields were given to the callback.
    expect(observations).toHaveLength(1);
    expect(observations[0]?.arguments).toBe(0);
    expect(observed).toEqual(member);
    unsubscribe();
  });

  it('invalidates on verified Member logout but not a stale-token clear or empty clear', async () => {
    const store = createMobileMemberSessionStoreV1(fixture().storage);
    await store.write(member);
    let calls = 0;
    const unsub = subscribeMobileSubjectCredentialChangesV1(() => { calls += 1; });
    expect(await store.clear('stale-token')).toBe(false);
    expect(calls).toBe(0);
    expect(await store.clear(member.accessToken)).toBe(true);
    expect(calls).toBe(1);
    expect(await store.clear()).toBe(true);
    expect(calls).toBe(1);
    unsub();
  });

  it('notifies after Guest bootstrap replacement and verified Guest logout only', async () => {
    const store = createMobileGuestCredentialStoreV1(fixture().storage);
    let calls = 0;
    const unsubscribe = subscribeMobileSubjectCredentialChangesV1(() => { calls += 1; });
    try {
      expect(await store.write(guest)).toEqual(guest);
      expect(calls).toBe(1);
      expect(await store.clear('other-guest')).toBe(false);
      expect(calls).toBe(1);
      expect(await store.write({ ...guest, bearerToken: 'next-guest' })).toMatchObject({
        bearerToken: 'next-guest',
      });
      expect(calls).toBe(2);
      expect(await store.clear('next-guest')).toBe(true);
      expect(calls).toBe(3);
    } finally {
      unsubscribe();
    }
  });

  it('never broadcasts a failed Member write or failed Guest clear', async () => {
    const base = fixture();
    let rejectWrite = false;
    let rejectDelete = false;
    const storage: SecureKeyValueStoreV1 = {
      ...base.storage,
      async setItemAsync(key, value) {
        if (rejectWrite) throw new Error('write failed');
        return base.storage.setItemAsync(key, value);
      },
      async deleteItemAsync(key) {
        if (rejectDelete) throw new Error('delete failed');
        return base.storage.deleteItemAsync(key);
      },
    };
    const memberStore = createMobileMemberSessionStoreV1(storage);
    const guestStore = createMobileGuestCredentialStoreV1(storage);
    let calls = 0;
    const unsubscribe = subscribeMobileSubjectCredentialChangesV1(() => { calls += 1; });
    try {
      rejectWrite = true;
      await expect(memberStore.write(member)).rejects.toMatchObject({
        code: 'MOBILE_MEMBER_SESSION_WRITE_FAILED',
      });
      expect(calls).toBe(0);
      rejectWrite = false;
      await guestStore.write(guest);
      expect(calls).toBe(1);
      rejectDelete = true;
      await expect(guestStore.clear(guest.bearerToken)).rejects.toMatchObject({
        code: 'MOBILE_GUEST_CREDENTIAL_CLEAR_FAILED',
      });
      expect(calls).toBe(1);
    } finally {
      unsubscribe();
    }
  });

  it('isolates a crashing subscriber and continues invalidating other screens', async () => {
    let seen = 0;
    const broken = subscribeMobileSubjectCredentialChangesV1(() => {
      throw new Error('closed screen');
    });
    const good = subscribeMobileSubjectCredentialChangesV1(() => { seen += 1; });
    try {
      await createMobileMemberSessionStoreV1(fixture().storage).write(member);
      expect(seen).toBe(1);
    } finally {
      broken();
      good();
    }
  });

  it('unsubscribed screens receive no further credential notifications', async () => {
    let calls = 0;
    const unsubscribe = subscribeMobileSubjectCredentialChangesV1(() => { calls += 1; });
    const store = createMobileGuestCredentialStoreV1(fixture().storage);
    await store.write(guest);
    expect(calls).toBe(1);
    unsubscribe();
    await store.clear(guest.bearerToken);
    expect(calls).toBe(1);
  });

  it('wires both focused archive surfaces without deriving Reader access', async () => {
    const read = (name: string) =>
      readFile(new URL('../' + name, import.meta.url), 'utf8');
    const [list, detail, entry, native] = await Promise.all([
      read('apps/mobile/src/features/records/use-mobile-records.tsx'),
      read('apps/mobile/src/app/reading/[readingId].tsx'),
      read('apps/mobile/src/features/reading/MobileOfficialReadingReaderEntry.tsx'),
      read('apps/mobile/src/features/reading/native-mobile-reader-interpretation-service.ts'),
    ]);
    expect(list).toContain('subscribeMobileSubjectCredentialChangesV1(');
    expect(list).toContain('restartForCurrentSubject');
    expect(list).toContain('mobileRecordsControllerV1.reset()');
    expect(list).toContain('unsubscribe()');
    expect(detail).toContain('subscribeMobileSubjectCredentialChangesV1(');
    expect(detail).toContain('requestEpoch.current += 1');
    expect(detail).toContain('unsubscribe()');
    expect(detail).toContain('setState(Object.freeze({ kind: \'loading\' as const }))');
    expect(entry).not.toContain('mobileReaderInterpretationServiceV1');
    expect(native).not.toContain('publicRouteActivated: true');
  });
});
