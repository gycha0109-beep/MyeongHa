import { describe, expect, it } from 'vitest';
import { resolveWorkTrackPlan } from '../scripts/ci/work-track-plan.mjs';
import { resolveDbPrRouting } from '../scripts/ci/db-pr-router.mjs';
import { resolvePrGates } from '../scripts/ci/pr-gate-router.mjs';

describe('Watchtower CI plan', () => {
  it('attributes Character work without pulling in Web or Mobile', () => {
    expect(resolveWorkTrackPlan(['apps/api/src/character-chat-orchestration.ts'], {
      pull_request: { body: 'Watchtower-Track: character-memory' },
    })).toEqual({ track: 'character-memory', full: false, web: false, mobile: false });
  });
  it('selects real cross-track dependencies regardless of the attribution', () => {
    expect(resolveWorkTrackPlan(['apps/web/src/chat/ChatPage.tsx', 'apps/mobile/src/session.ts'], {
      pull_request: { body: 'Watchtower-Track: character-memory' },
    })).toMatchObject({ web: true, mobile: true, full: false });
  });
  it('requires full regression for shared contracts and dependency changes', () => {
    for (const path of ['packages/contracts/src/index.ts', 'package-lock.json', 'vitest.config.ts', 'scripts/ci/work-track-plan.mjs']) {
      expect(resolveWorkTrackPlan([path])).toMatchObject({ full: true, web: true, mobile: true });
    }
  });
  it('keeps main full regression and does not guess missing or ambiguous track metadata', () => {
    expect(resolveWorkTrackPlan([], { eventName: 'push' })).toEqual({ track: 'unattributed', full: true, web: true, mobile: true });
    expect(resolveWorkTrackPlan([], { pull_request: { body: 'Watchtower-Track: ui\nWatchtower-Track: security' } })).toMatchObject({ track: 'unattributed' });
  });
  it('regresses every DB suite when the common DB runner or workflow changes', () => {
    for (const path of ['scripts/ci/run-db-track.mjs', '.github/workflows/ci-db-track.yml']) {
      expect(resolvePrGates([path]).db).toBe(true);
      expect(resolveDbPrRouting([path]).suites).toHaveLength(5);
    }
  });
});
