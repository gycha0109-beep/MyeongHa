import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const WORKFLOW =
  '.github/workflows/production-member-auth-rate-limit-canary.yml';
const TRIGGER =
  '.github/production-member-auth-rate-limit-canary.trigger';

describe('Production Member Auth rate-limit canary protected-main trigger', () => {
  it('allows only workflow dispatch or the dedicated main push trigger path', () => {
    const workflow = readFileSync(WORKFLOW, 'utf8');

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('branches:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain(
      "- '.github/production-member-auth-rate-limit-canary.trigger'",
    );
    expect(workflow).toContain('workflow_dispatch|push');
    expect(workflow).toContain('[[ "$GITHUB_REF" == \'refs/heads/main\' ]]');
  });

  it('maps protected-main push to the existing governed confirm and ops track', () => {
    const workflow = readFileSync(WORKFLOW, 'utf8');

    expect(workflow).toContain(
      "github.event_name == 'push' && 'ops' || inputs.watchtower_track",
    );
    expect(workflow).toContain(
      "github.event_name == 'push' && 'VERIFY_MEMBER_AUTH_RATE_LIMIT_CANARY_V2' || inputs.confirm",
    );
    expect(workflow).toContain(
      '[[ "$MYEONGHA_WATCHTOWER_TRACK" == \'ops\' ]]',
    );
    expect(workflow).toContain(
      '[[ "$MYEONGHA_MEMBER_AUTH_RATE_LIMIT_CANARY_CONFIRM" == \'VERIFY_MEMBER_AUTH_RATE_LIMIT_CANARY_V2\' ]]',
    );
  });

  it('keeps the trigger explicit and one-shot auditable', () => {
    const trigger = readFileSync(TRIGGER, 'utf8').trim();

    expect(trigger).toBe(
      'fire-2026-10-03-a09-rate-limited-observability-v1',
    );
  });
});
