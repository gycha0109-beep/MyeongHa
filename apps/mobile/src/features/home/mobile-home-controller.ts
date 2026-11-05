import {
  MOBILE_HOME_LOADING_STATE_V1,
  loadMobileHomeV1,
  type MobileHomeStateV1,
} from './mobile-home-loader.js';
import type { MobileHomeServiceV1 } from './mobile-home-service.js';

export interface MobileHomeControllerSnapshotV1 {
  readonly state: MobileHomeStateV1;
  readonly hasLoaded: boolean;
  readonly refreshing: boolean;
  readonly loadedAtEpochMs: number | null;
}

export interface MobileHomeControllerV1 {
  getSnapshot(): MobileHomeControllerSnapshotV1;
  load(options?: Readonly<{ force?: boolean }>): Promise<MobileHomeControllerSnapshotV1>;
  invalidate(): MobileHomeControllerSnapshotV1;
  reset(): MobileHomeControllerSnapshotV1;
}

/** Blank screen-safe state. Never mount a screen using a module-global
 * controller snapshot that may belong to a previous login Subject. */
export const MOBILE_HOME_BLANK_SNAPSHOT_V1: MobileHomeControllerSnapshotV1 = Object.freeze({
  state: MOBILE_HOME_LOADING_STATE_V1,
  hasLoaded: false,
  refreshing: false,
  loadedAtEpochMs: null,
});

export function createMobileHomeControllerV1(input: {
  readonly service: MobileHomeServiceV1;
  readonly cacheTtlMs?: number;
  readonly nowEpochMs?: () => number;
}): MobileHomeControllerV1 {
  const cacheTtlMs = input.cacheTtlMs ?? 60_000;
  if (!Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 0) {
    throw new RangeError('Mobile Home cache TTL must be a non-negative integer.');
  }
  const nowEpochMs = input.nowEpochMs ?? Date.now;

  let snapshot: MobileHomeControllerSnapshotV1 = MOBILE_HOME_BLANK_SNAPSHOT_V1;
  let inFlight: Promise<MobileHomeControllerSnapshotV1> | null = null;
  let generation = 0;

  function publish(next: MobileHomeControllerSnapshotV1) {
    snapshot = Object.freeze(next);
    return snapshot;
  }

  function cacheFresh(): boolean {
    return (
      snapshot.hasLoaded &&
      snapshot.loadedAtEpochMs !== null &&
      nowEpochMs() - snapshot.loadedAtEpochMs <= cacheTtlMs
    );
  }

  async function load(
    options: Readonly<{ force?: boolean }> = {},
  ): Promise<MobileHomeControllerSnapshotV1> {
    if (inFlight !== null) return inFlight;
    if (!options.force && cacheFresh()) return snapshot;

    publish({
      state: snapshot.hasLoaded ? snapshot.state : MOBILE_HOME_LOADING_STATE_V1,
      hasLoaded: snapshot.hasLoaded,
      refreshing: snapshot.hasLoaded,
      loadedAtEpochMs: snapshot.loadedAtEpochMs,
    });

    const requestGeneration = generation;
    const pending = (async () => {
      const state = await loadMobileHomeV1(input.service);
      // A credential change invalidates every earlier owner-scoped result.
      if (requestGeneration !== generation) return snapshot;
      return publish({
        state,
        hasLoaded: true,
        refreshing: false,
        loadedAtEpochMs: nowEpochMs(),
      });
    })();
    inFlight = pending;
    try {
      return await pending;
    } finally {
      if (inFlight === pending) inFlight = null;
    }
  }

  /** Clear owner-scoped projection and detach any previous in-flight read.
   * A late response from the previous Subject cannot repopulate Home. */
  function reset(): MobileHomeControllerSnapshotV1 {
    generation += 1;
    inFlight = null;
    return publish(MOBILE_HOME_BLANK_SNAPSHOT_V1);
  }

  function invalidate(): MobileHomeControllerSnapshotV1 {
    return publish({
      ...snapshot,
      loadedAtEpochMs: null,
    });
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    load,
    invalidate,
    reset,
  });
}
