import { describe, expect, it } from 'vitest';
import { adminRoutes, getAdminRoute, normalizeAdminPath } from './routes.js';

describe('admin navigation', () => {
  it('provides the six planned destinations without duplicates', () => {
    expect(adminRoutes).toHaveLength(6);
    expect(new Set(adminRoutes.map((route) => route.path)).size).toBe(6);
    expect(adminRoutes.map((route) => route.section)).toEqual([
      'overview', 'users', 'commerce', 'readings', 'analytics', 'issues',
    ]);
  });

  it('recognizes only routes inside the admin shell', () => {
    expect(getAdminRoute('/admin/')?.section).toBe('overview');
    expect(getAdminRoute('/admin/users/')?.section).toBe('users');
    expect(getAdminRoute('/admin/readings')?.section).toBe('readings');
    expect(getAdminRoute('/admin/other')).toBeNull();
    expect(getAdminRoute('/')).toBeNull();
    expect(getAdminRoute('//admin')).toBeNull();
    expect(normalizeAdminPath('admin')).toBe('');
  });
});
