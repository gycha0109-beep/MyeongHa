import { describe, expect, it } from 'vitest';
import {
  shouldReloadChatForMemberSessionStorageChange,
  shouldReloadMyForMemberSessionStorageChange,
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

describe('My Member subject replacement surface authority', () => {
  it('reloads my.html when Member A is replaced by Member B', () => {
    expect(shouldReloadMyForMemberSessionStorageChange({
      pathname: '/my.html',
      oldValue: session('member-a', 'a-1'),
      newValue: session('member-b', 'b-1'),
    })).toBe(true);
  });

  it('does not reload my.html for same-Member token rotation', () => {
    expect(shouldReloadMyForMemberSessionStorageChange({
      pathname: '/my.html',
      oldValue: session('member-a', 'a-1'),
      newValue: session('member-a', 'a-2'),
    })).toBe(false);
  });

  it('reloads my.html when Member authority is removed', () => {
    expect(shouldReloadMyForMemberSessionStorageChange({
      pathname: '/my.html',
      oldValue: session('member-a'),
      newValue: null,
    })).toBe(true);
  });

  it('reloads my.html when Member authority appears', () => {
    expect(shouldReloadMyForMemberSessionStorageChange({
      pathname: '/my.html',
      oldValue: null,
      newValue: session('member-b'),
    })).toBe(true);
  });

  it('does not reload my.html for malformed-to-empty storage noise', () => {
    expect(shouldReloadMyForMemberSessionStorageChange({
      pathname: '/my.html',
      oldValue: '{malformed',
      newValue: null,
    })).toBe(false);
  });

  it('does not apply the My policy to another page', () => {
    expect(shouldReloadMyForMemberSessionStorageChange({
      pathname: '/reading.html',
      oldValue: session('member-a'),
      newValue: session('member-b'),
    })).toBe(false);
  });
});

describe('Chat Member subject replacement surface authority', () => {
  it('reloads chat.html when Member A is replaced by Member B', () => {
    expect(shouldReloadChatForMemberSessionStorageChange({
      pathname: '/chat.html',
      oldValue: session('member-a', 'a-1'),
      newValue: session('member-b', 'b-1'),
    })).toBe(true);
  });

  it('does not reload chat.html for same-Member token rotation', () => {
    expect(shouldReloadChatForMemberSessionStorageChange({
      pathname: '/chat.html',
      oldValue: session('member-a', 'a-1'),
      newValue: session('member-a', 'a-2'),
    })).toBe(false);
  });

  it('reloads chat.html when Member authority is removed', () => {
    expect(shouldReloadChatForMemberSessionStorageChange({
      pathname: '/chat.html',
      oldValue: session('member-a'),
      newValue: null,
    })).toBe(true);
  });

  it('reloads chat.html when Member authority appears', () => {
    expect(shouldReloadChatForMemberSessionStorageChange({
      pathname: '/chat.html',
      oldValue: null,
      newValue: session('member-b'),
    })).toBe(true);
  });

  it('does not reload chat.html for malformed-to-empty storage noise', () => {
    expect(shouldReloadChatForMemberSessionStorageChange({
      pathname: '/chat.html',
      oldValue: '{malformed',
      newValue: null,
    })).toBe(false);
  });

  it('does not apply the Chat policy to another page', () => {
    expect(shouldReloadChatForMemberSessionStorageChange({
      pathname: '/records.html',
      oldValue: session('member-a'),
      newValue: session('member-b'),
    })).toBe(false);
  });
});
