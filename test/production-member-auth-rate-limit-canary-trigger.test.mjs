import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const WORKFLOW =
  '.github/workflows/production-member-auth-rate-limit-canary.yml';
const TRIGGER =
  '.github/production-member-auth-rate-limit-canary.trigger';
const SCRIPT =
  'scripts/operations/run-production-member-auth-rate-limit-canary.mjs';

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
      'fire-2026-10-04-a09-rate-limited-observability-v4',
    );
  });

  it('pins endpoint-specific local pre-limit responses before the shared 429 boundary', () => {
    const script = readFileSync(SCRIPT, 'utf8');

    expect(script).toContain("action: 'sign-in'");
    expect(script).toContain("action: 'sign-up'");
    expect(script).toContain("action: 'refresh'");
    expect(script).toContain("expectedPreLimitStatus: 400");
    expect(script).toContain("expectedPreLimitCode: 'INVALID_REQUEST'");
    expect(script).toContain("expectedPreLimitStatus: 401");
    expect(script).toContain("expectedPreLimitCode: 'SESSION_EXPIRED'");
    expect(script).toContain("body.error.code !== endpoint.expectedPreLimitCode");
    expect(script).toContain("first_rate_limited_attempt");
  });
});
