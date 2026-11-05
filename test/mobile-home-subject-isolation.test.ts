import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createMobileHomeControllerV1, MOBILE_HOME_BLANK_SNAPSHOT_V1 }
  from '../apps/mobile/src/features/home/mobile-home-controller.js';
import type { MobileHomeServiceV1 } from '../apps/mobile/src/features/home/mobile-home-service.js';

describe('mobile Home ownership isolation', () => {
  it('clears all previous owner facts before a new Subject request and discards late old responses', async () => {
    let subject = 'old-member';
    let releaseOld!: () => void;
    const oldGate = new Promise<void>(resolve => { releaseOld = resolve; });
    const service: MobileHomeServiceV1 = {
      async readProfile() {
        const owner = subject;
        if (owner === 'old-member') await oldGate;
        return {
          subjectId: owner,
          subjectKind: 'member' as const,
          subjectStatus: 'active' as const,
          profile: { displayName: owner, locale: 'ko-KR', timezone: 'Asia/Seoul', onboardingState: null, updatedAt: '2026-11-05T00:00:00.000Z' },
        };
      },
      async readBirth() { return null; },
      async readLatestReading() { return null; },
      async calculateCurrentSaju() { throw new Error('No birth profile'); },
    };
    const controller = createMobileHomeControllerV1({ service });
    const oldRequest = controller.load();
    const blank = controller.reset();
    expect(blank).toEqual(MOBILE_HOME_BLANK_SNAPSHOT_V1);
    expect(blank.state.profile.kind).toBe('loading');
    expect(blank.hasLoaded).toBe(false);

    subject = 'new-member';
    const current = await controller.load({ force: true });
    expect(current.state.profile.kind).toBe('ready');
    if (current.state.profile.kind === 'ready') {
      expect(current.state.profile.profile.subjectId).toBe('new-member');
      expect(current.state.profile.profile.profile?.displayName).toBe('new-member');
    }
    releaseOld();
    await oldRequest;
    const final = controller.getSnapshot();
    expect(final).toBe(current);
    expect(final.state.profile.kind).toBe('ready');
    if (final.state.profile.kind === 'ready') {
      expect(final.state.profile.profile.subjectId).toBe('new-member');
    }
  });

  it('preserves an in-flight same-Subject refresh but clears the projection on reset', async () => {
    const service: MobileHomeServiceV1 = {
      async readProfile() {
        return { subjectId: 'user-1', subjectKind: 'guest' as const, subjectStatus: 'active' as const, profile: null };
      },
      async readBirth() { return null; },
      async readLatestReading() { return null; },
      async calculateCurrentSaju() { throw new Error('Not requested'); },
    };
    const controller = createMobileHomeControllerV1({ service });
    const loaded = await controller.load();
    expect(loaded.hasLoaded).toBe(true);
    const refreshing = controller.load({ force: true });
    expect(controller.getSnapshot().state).toBe(loaded.state);
    await refreshing;
    expect(controller.reset()).toBe(MOBILE_HOME_BLANK_SNAPSHOT_V1);
  });

  it('starts with a blank screen, subscribes to verified credential changes and suppresses blurred responses', async () => {
    const [hook, controller] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/home/use-mobile-home.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/home/mobile-home-controller.ts', import.meta.url), 'utf8'),
    ]);
    expect(hook).toContain('useState(() => MOBILE_HOME_BLANK_SNAPSHOT_V1)');
    expect(hook).toContain('subscribeMobileSubjectCredentialChangesV1(restartForCurrentSubject)');
    expect(hook).toContain('mobileHomeControllerV1.reset()');
    expect(hook).toContain('focused.current && epoch === focusEpoch.current');
    expect(hook).toContain('unsubscribe()');
    expect(controller).toContain('if (requestGeneration !== generation) return snapshot');
    expect(hook).not.toContain('useState(() => mobileHomeControllerV1.getSnapshot())');
  });
});
