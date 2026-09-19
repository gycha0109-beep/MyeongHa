import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const browserWorkflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/web-browser-render-smoke.yml'),
  'utf8',
);
const recoveryWorkflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/production-saju-redeploy-recovery.yml'),
  'utf8',
);

describe('direct Saju redeploy authority contract', () => {
  it('keeps the browser smoke limited to browser verification', () => {
    expect(browserWorkflow).toContain('name: Web Browser Smoke');
    expect(browserWorkflow).toContain('pull_request:');
    expect(browserWorkflow).toContain('push:');
    expect(browserWorkflow).toContain('- main');
    expect(browserWorkflow).toContain('web-browser-smoke:');
    expect(browserWorkflow).not.toContain('production-saju-redeploy.trigger');
    expect(browserWorkflow).not.toContain('VERCEL_TOKEN');
    expect(browserWorkflow).not.toContain('actions: write');
  });

  it('routes the governed trigger directly to the recovery workflow', () => {
    expect(recoveryWorkflow).toContain('name: Production Saju Redeploy Recovery');
    expect(recoveryWorkflow).toContain('workflow_dispatch:');
    expect(recoveryWorkflow).toContain('REDEPLOY_SAJU_PRODUCTION');
    expect(recoveryWorkflow).toContain('push:');
    expect(recoveryWorkflow).toContain('- main');
    expect(recoveryWorkflow).toContain('- .github/production-saju-redeploy.trigger');
    expect(recoveryWorkflow).not.toContain('actions: write');
    expect(recoveryWorkflow).not.toContain('/dispatches');
  });

  it('keeps production mutation authority inside the governed production environment', () => {
    expect(recoveryWorkflow).toContain('environment: production');
    expect(recoveryWorkflow).toContain('VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}');
    expect(recoveryWorkflow).toContain('production-saju-redeploy-recovery');
    expect(recoveryWorkflow).toContain('cancel-in-progress: false');
  });
});
