import { describe, expect, it } from 'vitest';
import {
  captureReadingResponseOwnerV1,
  isReadingResponseOwnerCurrentV1,
} from '../apps/web/reading-response-owner-guard.js';

const member = (id: string, accessToken: string) => ({ user: { id }, accessToken });
const credential = (kind: 'member' | 'guest', token: string) => ({ kind, token });

describe('Reading response display isolation', () => {
  it('keeps the same account across credential renewal', () => {
    const first = captureReadingResponseOwnerV1(
      credential('member', 'alpha'), member('person-a', 'alpha'), null,
    );
    expect(first).toEqual({ kind: 'member', key: 'person-a' });
    expect(isReadingResponseOwnerCurrentV1(first, member('person-a', 'beta'), null)).toBe(true);
  });

  it('rejects replaced Member and sign-out responses', () => {
    const first = captureReadingResponseOwnerV1(
      credential('member', 'alpha'), member('person-a', 'alpha'), null,
    );
    expect(isReadingResponseOwnerCurrentV1(first, member('person-b', 'gamma'), null)).toBe(false);
    expect(isReadingResponseOwnerCurrentV1(first, null, null)).toBe(false);
  });

  it('rejects changed Guest and Guest-to-Member transitions', () => {
    const first = captureReadingResponseOwnerV1(credential('guest', 'guest-a'), null, 'guest-a');
    expect(isReadingResponseOwnerCurrentV1(first, null, 'guest-a')).toBe(true);
    expect(isReadingResponseOwnerCurrentV1(first, null, 'guest-b')).toBe(false);
    expect(isReadingResponseOwnerCurrentV1(first, member('person-a', 'alpha'), 'guest-a')).toBe(false);
  });

  it('cannot capture already-replaced browser credentials', () => {
    expect(captureReadingResponseOwnerV1(credential('member', 'old'), member('person-a', 'new'), null)).toBeNull();
    expect(captureReadingResponseOwnerV1(credential('guest', 'old'), null, 'new')).toBeNull();
    expect(captureReadingResponseOwnerV1(credential('guest', 'guest-a'), member('person-a', 'alpha'), 'guest-a')).toBeNull();
  });
});
