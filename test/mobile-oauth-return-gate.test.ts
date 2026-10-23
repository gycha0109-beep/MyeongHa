import { describe, expect, it } from 'vitest';

import { MobileSocialAuthReturnGateV1 } from '../apps/mobile/src/core/auth/mobile-social-auth-return-gate.js';

describe('Android external OAuth browser resume', () => {
  it('detects browser back with no auth callback and allows the pending state to cancel', () => {
    const gate = new MobileSocialAuthReturnGateV1();
    const id = gate.begin();
    expect(gate.returnedWithoutCallback()).toBeNull();
    gate.leaveApp();
    expect(gate.returnedWithoutCallback()).toBe(id);
    expect(gate.mayCancelOnReturn(id)).toBe(true);
    gate.finish();
    expect(gate.returnedWithoutCallback()).toBeNull();
  });

  it('never cancels a pending login when a deep link callback has been observed', () => {
    const gate = new MobileSocialAuthReturnGateV1();
    const id = gate.begin();
    gate.leaveApp();
    gate.callback();
    expect(gate.returnedWithoutCallback()).toBeNull();
    expect(gate.mayCancelOnReturn(id)).toBe(false);
    expect(gate.mayEnterPending(id)).toBe(false);
  });

  it('allows return cancellation after an invalid callback was rejected', () => {
    const gate = new MobileSocialAuthReturnGateV1();
    const id = gate.begin();
    gate.leaveApp();
    gate.callback();
    gate.callbackRejected();
    expect(gate.returnedWithoutCallback()).toBe(id);
  });

  it('does not let a stale browser-return timeout clear a newer OAuth attempt', () => {
    const gate = new MobileSocialAuthReturnGateV1();
    const first = gate.begin();
    gate.leaveApp();
    const second = gate.begin();
    expect(second).not.toBe(first);
    expect(gate.mayCancelOnReturn(first)).toBe(false);
    expect(gate.mayEnterPending(second)).toBe(true);
    gate.leaveApp();
    expect(gate.mayCancelOnReturn(second)).toBe(true);
  });

  it('does not treat a foreground callback-free login before opening the browser as cancelled', () => {
    const gate = new MobileSocialAuthReturnGateV1();
    const attempt = gate.begin();
    expect(gate.mayEnterPending(attempt)).toBe(true);
    expect(gate.mayCancelOnReturn(attempt)).toBe(false);
  });
});
