import { describe, expect, it } from 'vitest';
import {
  memberSubjectIdFromStoredSession,
  shouldReloadSajuForMemberSessionStorageChange,
} from '../apps/web/product-auth-surface.js';

function session(id: string, accessToken = 'access') {
  return JSON.stringify({
    accessToken,
    refreshToken: `${accessToken}-refresh`,
    expiresAt: '2026-09-11T12:00:00.000Z',
    tokenType: 'bearer',
    user: { id, email: `${id}@example.com` },
  });
}

describe('Saju Member subject replacement surface authority', () => {
  it('extracts only a valid stored Member subject id', () => {
    expect(memberSubjectIdFromStoredSession(session('member-a'))).toBe('member-a');
    expect(memberSubjectIdFromStoredSession('{malformed')).toBeNull();
    expect(memberSubjectIdFromStoredSession(JSON.stringify({ user: { id: '   ' } }))).toBeNull();
  });

  it('reloads reading.html when Member A is replaced by Member B', () => {
    expect(shouldReloadSajuForMemberSessionStorageChange({
      pathname: '/reading.html',
      oldValue: session('member-a', 'a-1'),
      newValue: session('member-b', 'b-1'),
    })).toBe(true);
  });

  it('does not reload reading.html for same-Member token rotation', () => {
    expect(shouldReloadSajuForMemberSessionStorageChange({
      pathname: '/reading.html',
      oldValue: session('member-a', 'a-1'),
      newValue: session('member-a', 'a-2'),
    })).toBe(false);
  });

  it('reloads reading.html when Member authority is removed', () => {
    expect(shouldReloadSajuForMemberSessionStorageChange({
      pathname: '/reading.html',
      oldValue: session('member-a'),
      newValue: null,
    })).toBe(true);
  });

  it('reloads reading.html when Member authority replaces a guest or anonymous surface', () => {
    expect(shouldReloadSajuForMemberSessionStorageChange({
      pathname: '/reading.html',
      oldValue: null,
      newValue: session('member-b'),
    })).toBe(true);
  });

  it('does not reload non-Saju pages for a Member replacement', () => {
    expect(shouldReloadSajuForMemberSessionStorageChange({
      pathname: '/records.html',
      oldValue: session('member-a'),
      newValue: session('member-b'),
    })).toBe(false);
  });
});
