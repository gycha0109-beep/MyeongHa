import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADMIN_ANALYTICS_EVENT_REGISTRY_V1, isRegisteredAdminAnalyticsEventV1, readAdminAnalyticsEvidenceV1 } from './admin-analytics-read-v1.js';
import { parseAdminReadFiltersV1, createAdminReadHttpHandlerV1 } from './admin-read-http-v1.js';
import { projectAdminRowsV1 } from './admin-read-contract-v1.js';

const filters = () => parseAdminReadFiltersV1(new URL('https://admin.invalid/api/admin/analytics?from=2026-10-01&to=2026-10-27'));

describe('source-backed, unmeasured beta analytics read model', () => {
  it('matches the exact documented registry and refuses unregistered purchase/view aliases', () => {
    const spec = readFileSync(new URL('../../../docs/ANALYTICS_EXPERIMENT_SPEC.md', import.meta.url), 'utf8');
    const baseline = spec.split('## 3. Baseline Event Registry')[1]!.split('```text')[1]!.split('```')[0]!.trim().split(/\r?\n/u);
    expect(ADMIN_ANALYTICS_EVENT_REGISTRY_V1).toEqual(baseline);
    for (const invalid of ['PRODUCT_DETAIL_VIEWED','CHECKOUT_ATTEMPTED','PAYMENT_SUCCESS','RESULT_VIEWED',null]) {
      expect(isRegisteredAdminAnalyticsEventV1(invalid)).toBe(false);
    }
  });
  it('never substitutes zero or a receipt count for an unobserved unique visitor cohort', () => {
    const f = filters();
    const rows = projectAdminRowsV1('analytics', readAdminAnalyticsEvidenceV1(f), f.limit).rows;
    expect(rows).toHaveLength(11);
    for (const row of rows) {
      expect(row).toMatchObject({ value: null, numerator: null, denominator: null, sampleSize: null,
        sampleStatus: 'unknown', measurementStatus: 'unmeasured', campaignKey: 'unknown',
        periodFrom: '2026-10-01', periodTo: '2026-10-27', timezone: 'UTC' });
      expect(row.definition).toBeTruthy();
    }
    expect(rows.find(row => row.metricKey === 'verified_purchasers')).toMatchObject({ eventName: 'READING_PURCHASED', registryStatus: 'registered' });
    expect(rows.find(row => row.metricKey === 'valid_visitors')).toMatchObject({ eventName: null, registryStatus: 'contract_missing' });
    const next = readAdminAnalyticsEvidenceV1({ ...f, limit: 2 });
    expect(next.nextCursor).toBe('2');
    expect(readAdminAnalyticsEvidenceV1({ ...f, limit: 2, cursor: '2' }).rows[0]?.metricKey).toBe('checkout_attempts');
  });
  it('requires Owner and a successful audit even though the read model collects no events', async () => {
    const make = (owner: boolean, auditWorks: boolean) => createAdminReadHttpHandlerV1({
      auth: { async verifyOwner() { return owner ? { authUserId: '123e4567-e89b-42d3-a456-426614174000' } : null; } },
      reads: { async read() { throw new Error('No analytics data store is authorized'); } },
      audit: { async append() { if (!auditWorks) throw new Error('Audit unavailable'); } },
    });
    const request = () => new Request('https://admin.invalid/api/admin/analytics?from=2026-10-01&to=2026-10-27');
    expect((await make(false,true)(request())).status).toBe(403);
    expect((await make(true,false)(request())).status).toBe(503);
    const response = await make(true,true)(request());
    expect(response.status).toBe(200);
    expect((await response.json() as { rows: unknown[] }).rows).toHaveLength(11);
  });
});
