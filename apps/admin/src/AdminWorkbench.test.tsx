import { describe, expect, it } from 'vitest';
import { buildListPath } from './AdminWorkbench.js';

describe('administrator investigation navigation', () => {
  it('carries user and exact receipt filters into paginated entitlement history', () => {
    const subject = '123e4567-e89b-42d3-a456-426614174002';
    const receipt = '123e4567-e89b-42d3-a456-426614174003';
    const path = buildListPath('commerce', subject, '20', 'entitlement-events', null, null,
      'all', 'all', 'all', 'all', '', 'all', 'all', '', '', 'all', '', 'all', 'all', 'all', 'all', 'all', 'all', false, receipt);
    const url = new URL(path, 'https://admin.invalid');
    expect(url.pathname).toBe('/api/admin/entitlement-events');
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '20', cursor: '20', subjectId: subject, receiptId: receipt });
  });
});
