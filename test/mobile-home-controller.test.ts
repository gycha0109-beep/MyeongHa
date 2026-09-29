import { describe, expect, it } from 'vitest';

import { createMobileHomeControllerV1 } from '../apps/mobile/src/features/home/mobile-home-controller.js';
import type { MobileHomeServiceV1 } from '../apps/mobile/src/features/home/mobile-home-service.js';

function service(counter: { reads: number }): MobileHomeServiceV1 {
  return {
    async readProfile() {
      counter.reads += 1;
      return {
        subjectId: 'subject-1',
        subjectKind: 'guest',
        subjectStatus: 'active',
        profile: null,
      };
    },
    async readBirth() {
      counter.reads += 1;
      return null;
    },
    async readLatestReading() {
      counter.reads += 1;
      return null;
    },
    async calculateCurrentSaju() {
      throw new Error('Saju must not run without Birth.');
    },
  };
}

describe('mobile Home controller', () => {
  it('reuses a fresh in-memory projection within the 60-second cache window', async () => {
    const counter = { reads: 0 };
    let now = 1_000;
    const controller = createMobileHomeControllerV1({
      service: service(counter),
      cacheTtlMs: 60_000,
      nowEpochMs: () => now,
    });

    await controller.load();
    expect(counter.reads).toBe(3);
    await controller.load();
    expect(counter.reads).toBe(3);

    now += 60_001;
    await controller.load();
    expect(counter.reads).toBe(6);
  });

  it('keeps stale data visible while a forced revalidation is in flight', async () => {
    const counter = { reads: 0 };
    let release!: () => void;
    let gated = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const base = service(counter);
    const controller = createMobileHomeControllerV1({
      service: {
        ...base,
        async readProfile() {
          const result = await base.readProfile();
          if (gated) await gate;
          return result;
        },
      },
    });

    await controller.load();
    const first = controller.getSnapshot();
    expect(first.hasLoaded).toBe(true);

    gated = true;
    const pending = controller.load({ force: true });
    const refreshing = controller.getSnapshot();
    expect(refreshing.hasLoaded).toBe(true);
    expect(refreshing.refreshing).toBe(true);
    expect(refreshing.state).toBe(first.state);

    release();
    await pending;
    expect(controller.getSnapshot().refreshing).toBe(false);
  });

  it('invalidates freshness without discarding the current projection', async () => {
    const counter = { reads: 0 };
    const controller = createMobileHomeControllerV1({ service: service(counter) });

    await controller.load();
    const before = controller.getSnapshot();
    controller.invalidate();
    const invalidated = controller.getSnapshot();

    expect(invalidated.state).toBe(before.state);
    expect(invalidated.loadedAtEpochMs).toBeNull();

    await controller.load();
    expect(counter.reads).toBe(6);
  });

  it('single-flights concurrent Home loads', async () => {
    const counter = { reads: 0 };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const base = service(counter);
    const controller = createMobileHomeControllerV1({
      service: {
        ...base,
        async readProfile() {
          const result = await base.readProfile();
          await gate;
          return result;
        },
      },
    });

    const first = controller.load();
    const second = controller.load();
    release();
    await Promise.all([first, second]);

    expect(counter.reads).toBe(3);
  });
});
