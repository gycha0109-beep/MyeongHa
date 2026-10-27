import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { waitForCiVerifyRegistration } from '../scripts/ci/integration-candidate.mjs';

describe('frozen-head CI Integration registration race guard', () => {
  it('allows normal CI more than 3 minutes to publish its required check', () => {
    const yaml = readFileSync('.github/workflows/ci-integration.yml', 'utf8');
    const admission = yaml.slice(yaml.indexOf('  admission:'), yaml.indexOf('  full:'));
    const verify = yaml.slice(yaml.indexOf('  verify:'));
    expect(admission).toContain('timeout-minutes: 15');
    expect(verify).toContain('timeout-minutes: 15');
    expect(admission).toContain('scripts/ci/integration-candidate.mjs guard');
    expect(verify).toContain('scripts/ci/integration-candidate.mjs guard');
  });
  it('retries only the exact missing CI Verify registration and then admits full guard', async () => {
    let checks = 0;
    const sleep = vi.fn(async (ms) => {
      expect(ms).toBe(8000);
    });
    const result = await waitForCiVerifyRegistration(() => {
      checks += 1;
      if (checks < 3) throw new Error('Required check is missing: CI Verify');
      return Object.freeze({ approvedPinnedHead: true });
    }, { maxRetries: 2, sleep });
    expect(result).toEqual({ approvedPinnedHead: true });
    expect(checks).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('handles a CI Verify registration appearing after the prior 96-second limit', async () => {
    let attempts = 0;
    const sleep = vi.fn(async () => {});
    const result = await waitForCiVerifyRegistration(() => {
      attempts += 1;
      if (attempts <= 32) throw new Error('Required check is missing: CI Verify');
      return 'verified';
    }, { sleep });
    expect(result).toBe('verified');
    expect(attempts).toBe(33);
    expect(sleep).toHaveBeenCalledTimes(32);
  });

  it('does not retry a failed CI Verify, a wrong app, another missing check, or a changed PR', async () => {
    for (const reason of [
      'Required check is not successful: CI Verify',
      'Required check is missing: Governance',
      'Candidate must match the immutable PR submission event',
      'PR head changed; request a new candidate',
      'Staged CI requires CI Integration Verify from GitHub Actions in the default-branch ruleset',
    ]) {
      const guard = vi.fn(() => { throw new Error(reason); });
      const sleep = vi.fn();
      await expect(waitForCiVerifyRegistration(guard, { sleep })).rejects.toThrow(reason);
      expect(guard).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it('keeps a finite bound on missing-check retries without inventing a pass', async () => {
    const guard = vi.fn(() => { throw new Error('Required check is missing: CI Verify'); });
    const sleep = vi.fn(async () => {});
    await expect(waitForCiVerifyRegistration(guard, {
      maxRetries: 2, sleep,
    })).rejects.toThrow('Required check is missing: CI Verify');
    expect(guard).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('disallows invalid, unbounded, or negative retry policies', async () => {
    for (const option of [
      { maxRetries: 100 },
      { maxRetries: -1 },
      { maxRetries: 1.5 },
      { intervalMs: -1 },
      { intervalMs: 90_000 },
    ]) {
      await expect(waitForCiVerifyRegistration(() => true, option)).rejects.toThrow('Invalid CI registration retry policy');
    }
    await expect(waitForCiVerifyRegistration(null)).rejects.toThrow('Invalid CI registration retry policy');
  });
});
