import { describe, expect, it } from 'vitest';
import { FORTUNE_COOKIE_MESSAGES_V1, pickFortuneCookieIndexV1 } from './fortune-cookie.js';

describe('entertainment-only fortune cookie', () => {
  it('has exactly 100 unique readable Korean messages', () => {
    expect(FORTUNE_COOKIE_MESSAGES_V1).toHaveLength(100);
    expect(new Set(FORTUNE_COOKIE_MESSAGES_V1).size).toBe(100);
    expect(FORTUNE_COOKIE_MESSAGES_V1.every(message => message.length >= 10)).toBe(true);
  });
  it('draws across the whole pool without repeating the previous message', () => {
    expect(pickFortuneCookieIndexV1(-1, () => 0)).toBe(0);
    expect(pickFortuneCookieIndexV1(-1, () => 0.999999)).toBe(99);
    expect(pickFortuneCookieIndexV1(0, () => 0)).toBe(1);
    expect(pickFortuneCookieIndexV1(99, () => 0.999999)).toBe(98);
    for (let previous = 0; previous < 100; previous++) {
      for (const draw of [0, 0.1, 0.5, 0.9, 0.999999]) {
        const next = pickFortuneCookieIndexV1(previous, () => draw);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(100);
        expect(next).not.toBe(previous);
      }
    }
  });
});
