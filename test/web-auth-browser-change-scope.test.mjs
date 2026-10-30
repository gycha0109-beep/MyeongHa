import { describe, expect, it } from 'vitest';
import { mustRunAuthBrowserV1 } from '../scripts/ci/web-auth-browser-change-scope.mjs';

const basePackage = {
  scripts: { typecheck: 'tsc', check: 'npm run test' },
  dependencies: { react: '19.3.0' },
};
const headPackage = {
  scripts: {
    typecheck: 'tsc && npm run typecheck -w @myeongha/admin',
    check: 'npm run test && npm run build:admin',
    'dev:admin': 'npm run dev -w @myeongha/admin',
    'build:admin': 'npm run build -w @myeongha/admin',
  },
  dependencies: { react: '19.3.0' },
};
const baseLock = { packages: {
  'apps/admin': { name: '@myeongha/admin', version: '0.0.0' },
  'node_modules/react': { version: '19.3.0' },
}};
const headLock = { packages: {
  'apps/admin': { name: '@myeongha/admin', version: '0.0.0', dependencies: { react: '19.3.0' } },
  'node_modules/react': { version: '19.3.0' },
}};
const baseline = {
  changed: [
    'apps/admin/src/App.tsx',
    'apps/api/src/admin-auth-v1.ts',
    '.github/workflows/ci.yml',
    '.github/workflows/web-browser-auth-regression.yml',
    'scripts/ci/web-auth-browser-change-scope.mjs',
    'test/web-auth-browser-change-scope.test.mjs',
    'package.json',
    'package-lock.json',
  ],
  basePackage, headPackage, baseLock, headLock,
};

describe('Web auth browser gating for Admin-only changes', () => {
  it('does not run legacy Web auth suites for strictly Admin-only changes', () => {
    expect(mustRunAuthBrowserV1(baseline)).toBe(false);
  });
  it('must run for a changed member authentication file', () => {
    expect(mustRunAuthBrowserV1({
      ...baseline, changed: [...baseline.changed, 'apps/web/product-auth.js'],
    })).toBe(true);
  });
  it('must run when a shared package version changes', () => {
    expect(mustRunAuthBrowserV1({
      ...baseline,
      headPackage: { ...headPackage, dependencies: { react: '19.4.0' } },
    })).toBe(true);
    expect(mustRunAuthBrowserV1({
      ...baseline,
      headLock: { packages: { ...headLock.packages, 'node_modules/react': { version: '19.4.0' } } },
    })).toBe(true);
  });
  it('must run if the patch is not an Admin change', () => {
    expect(mustRunAuthBrowserV1({ ...baseline, changed: ['package.json'] })).toBe(true);
    expect(mustRunAuthBrowserV1({
      ...baseline, changed: [...baseline.changed, 'scripts/auth-changes.mjs'],
    })).toBe(true);
  });
});
