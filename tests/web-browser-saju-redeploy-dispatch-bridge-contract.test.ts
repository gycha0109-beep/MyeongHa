import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const browserWorkflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/web-browser-render-smoke.yml'),
  'utf8',
);
const sentinelWorkflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/production-saju-redeploy-sentinel-dispatch.yml'),
  'utf8',
);

const RECOVERY_DISPATCH_PATH =
  'actions/workflows/production-saju-redeploy-recovery.yml/dispatches';

describe('single Saju redeploy dispatcher authority contract', () => {
  it('keeps the browser smoke limited to browser verification', () => {
    expect(browserWorkflow).toContain('name: Web Browser Render Smoke');
    expect(browserWorkflow).toContain('pull_request:');
    expect(browserWorkflow).toContain('push:');
    expect(browserWorkflow).toContain('- main');
    expect(browserWorkflow).toContain('web-browser-render:');
    expect(browserWorkflow).not.toContain('dispatch-saju-redeploy-recovery:');
    expect(browserWorkflow).not.toContain('[saju-redeploy-dispatch-v1]');
    expect(browserWorkflow).not.toContain(RECOVERY_DISPATCH_PATH);
  });

  it('does not grant actions write permission to the browser workflow', () => {
    expect(browserWorkflow).toContain('permissions:\n  contents: read');
    expect(browserWorkflow).not.toContain('actions: write');
  });

  it('keeps the sentinel dispatcher as the sole governed dispatch authority', () => {
    expect(sentinelWorkflow).toContain('name: Production Saju Redeploy Sentinel Dispatch');
    expect(sentinelWorkflow).toContain('- .github/production-saju-redeploy.trigger');
    expect(sentinelWorkflow).toContain('actions: write');
    expect(sentinelWorkflow).toContain('contents: read');
    expect(sentinelWorkflow).toContain(RECOVERY_DISPATCH_PATH);
    expect(sentinelWorkflow).toContain(
      '{ref: "main", inputs: {confirm: "REDEPLOY_SAJU_PRODUCTION"}}',
    );
    expect(sentinelWorkflow).toContain("[[ \"$http_code\" != '204' ]]");
  });

  it('keeps the sentinel dispatcher free of production mutation and token output', () => {
    const forbidden = [
      'VERCEL_TOKEN',
      '/env?upsert=true',
      'supabase',
      'gcloud run deploy',
      'gcloud run services update',
      'alter table',
      'alter role',
      'insert into',
      'update subjects',
      'delete from',
      'echo "$GH_TOKEN"',
      'cat "$payload_file"',
    ];
    for (const fragment of forbidden) {
      expect(sentinelWorkflow.toLowerCase()).not.toContain(fragment.toLowerCase());
    }
  });
});
