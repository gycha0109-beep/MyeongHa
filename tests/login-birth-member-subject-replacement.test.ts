import { describe, expect, it } from 'vitest';
import { shouldReloadBirthForMemberSessionStorageChange } from '../apps/web/product-auth-surface.js';

function session(id: string, accessToken = 'access') {
  return JSON.stringify({
    accessToken,
    refreshToken: `${accessToken}-refresh`,
    expiresAt: '2026-09-11T12:00:00.000Z',
    tokenType: 'bearer',
    user: { id, email: `${id}@example.com` },
  });
}

describe('Birth Member subject replacement surface authority', () => {
  it('reloads birth.html when Member A is replaced by Member B', () => {
    expect(shouldReloadBirthForMemberSessionStorageChange({
      pathname: '/birth.html',
      oldValue: session('member-a', 'a-1'),
      newValue: session('member-b', 'b-1'),
    })).toBe(true);
  });

  it('does not reload birth.html for same-Member token rotation', () => {
    expect(shouldReloadBirthForMemberSessionStorageChange({
      pathname: '/birth.html',
      oldValue: session('member-a', 'a-1'),
      newValue: session('member-a', 'a-2'),
    })).toBe(false);
  });

  it('reloads birth.html when Member authority is removed', () => {
    expect(shouldReloadBirthForMemberSessionStorageChange({
      pathname: '/birth.html',
      oldValue: session('member-a'),
      newValue: null,
    })).toBe(true);
  });

  it('reloads birth.html when Member authority appears', () => {
    expect(shouldReloadBirthForMemberSessionStorageChange({
      pathname: '/birth.html',
      oldValue: null,
      newValue: session('member-b'),
    })).toBe(true);
  });

  it('does not reload birth.html for malformed-to-empty storage noise', () => {
    expect(shouldReloadBirthForMemberSessionStorageChange({
      pathname: '/birth.html',
      oldValue: '{malformed',
      newValue: null,
    })).toBe(false);
  });

  it('does not apply the Birth policy to another page', () => {
    expect(shouldReloadBirthForMemberSessionStorageChange({
      pathname: '/my.html',
      oldValue: session('member-a'),
      newValue: session('member-b'),
    })).toBe(false);
  });
});
