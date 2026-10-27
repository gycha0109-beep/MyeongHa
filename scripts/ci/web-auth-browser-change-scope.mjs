import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED = new Set([
  'package.json', 'package-lock.json',
  '.github/workflows/ci.yml',
  '.github/workflows/web-browser-auth-regression.yml',
  'scripts/ci/web-auth-browser-change-scope.mjs',
  'test/web-auth-browser-change-scope.test.mjs',
]);

function adminPackageRemoved(value) {
  const copy = structuredClone(value);
  if (copy.scripts !== null && typeof copy.scripts === 'object') {
    delete copy.scripts['dev:admin'];
    delete copy.scripts['build:admin'];
    for (const [key, fragment] of [
      ['typecheck', ' && npm run typecheck -w @myeongha/admin'],
      ['check', ' && npm run build:admin'],
    ]) {
      if (typeof copy.scripts[key] === 'string') {
        copy.scripts[key] = copy.scripts[key].replace(fragment, '');
      }
    }
  }
  return copy;
}

function adminLockRemoved(value) {
  const copy = structuredClone(value);
  if (copy.packages) {
    delete copy.packages['apps/admin'];
    delete copy.packages['node_modules/@myeongha/admin'];
  }
  return copy;
}

export function mustRunAuthBrowserV1(input) {
  const {changed,basePackage,headPackage,baseLock,headLock}=input;
  const admin = changed.some(p =>
    p.startsWith('apps/admin/') || /^apps\/api\/src\/admin-[^/]+\.ts$/u.test(p));
  if (!admin) return true;
  if (!changed.every(p =>
    p.startsWith('apps/admin/') ||
    /^apps\/api\/src\/admin-[^/]+\.ts$/u.test(p) || ALLOWED.has(p))) return true;
  if (changed.includes('package.json') &&
    JSON.stringify(adminPackageRemoved(basePackage)) !==
    JSON.stringify(adminPackageRemoved(headPackage))) return true;
  if (changed.includes('package-lock.json') &&
    JSON.stringify(adminLockRemoved(baseLock)) !==
    JSON.stringify(adminLockRemoved(headLock))) return true;
  return false;
}

function gitJson(sha,path) {
  return JSON.parse(execFileSync('git',['show',sha+':'+path],{encoding:'utf8'}));
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const base=process.argv[2], head=process.argv[3];
  if (!/^[0-9a-f]{40}$/u.test(base??'') || !/^[0-9a-f]{40}$/u.test(head??'')) {
    throw new Error('Missing pinned comparison commits.');
  }
  const changed=execFileSync('git',['diff','--name-only',base+'...'+head],{encoding:'utf8'})
    .trim().split(/\r?\n/u).filter(Boolean);
  const flag=mustRunAuthBrowserV1({
    changed,
    basePackage:gitJson(base,'package.json'),
    headPackage:gitJson(head,'package.json'),
    baseLock:gitJson(base,'package-lock.json'),
    headLock:gitJson(head,'package-lock.json'),
  });
  process.stdout.write('run_browser='+flag+'\n');
}
