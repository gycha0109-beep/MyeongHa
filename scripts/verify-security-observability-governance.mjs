import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';

const root = process.cwd();
const apiRoot = resolve(root, 'api');
const securityPath = resolve(root, 'apps/api/src/security-observability.ts');
const governancePath = resolve(root, '.github/workflows/governance.yml');

const fetchBoundaryRoutes = new Map([
  ['api/auth/promote-guest.ts', 'api.auth.promote-guest'],
  ['api/auth/refresh.ts', 'api.auth.refresh'],
  ['api/auth/sign-in.ts', 'api.auth.sign-in'],
  ['api/auth/sign-out.ts', 'api.auth.sign-out'],
  ['api/auth/sign-up.ts', 'api.auth.sign-up'],
  ['api/health.ts', 'api.health'],
  ['api/me.ts', 'api.me.dispatch'],
  ['api/me/birth-profile.ts', 'api.me.birth-profile'],
  ['api/me/saju/calculation.ts', 'api.me.saju.calculation'],
  ['api/readiness.ts', 'api.readiness'],
  ['api/session/bootstrap.ts', 'api.session.bootstrap'],
]);

const nodeBoundaryRoutes = new Map([
  ['api/birth-profiles.ts', 'api.birth-profiles'],
]);

const source = readFileSync(securityPath, 'utf8');
const governance = readFileSync(governancePath, 'utf8');
const failures = [];

function requireFragment(value, fragment, label) {
  if (!value.includes(fragment)) failures.push(`${label}: missing ${JSON.stringify(fragment)}`);
}

function forbidFragment(value, fragment, label) {
  if (value.includes(fragment)) failures.push(`${label}: forbidden ${JSON.stringify(fragment)}`);
}

function collectApiTypeScriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectApiTypeScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(relative(root, fullPath).split(sep).join('/'));
    }
  }
  return files.sort();
}

const expectedApiFiles = [
  ...fetchBoundaryRoutes.keys(),
  ...nodeBoundaryRoutes.keys(),
].sort();
const discoveredApiFiles = collectApiTypeScriptFiles(apiRoot);
if (JSON.stringify(discoveredApiFiles) !== JSON.stringify(expectedApiFiles)) {
  failures.push(
    `public API inventory drift: expected=${JSON.stringify(expectedApiFiles)} actual=${JSON.stringify(discoveredApiFiles)}`,
  );
}

for (const fragment of [
  'myeongha-security-event-v1',
  "'ACCESS_DENIED'",
  "'RATE_LIMITED'",
  "'SERVER_FAILURE'",
  "'UNEXPECTED_EXCEPTION'",
  "'A09:2025'",
  "'A10:2025'",
  'MYEONGHA_SECURITY_EVENT',
  "'Cache-Control': NO_STORE",
  'routeId',
  'requestId',
  'durationMs',
  'writeEventBestEffort',
  'executeSecurityObservedNodeRequestV1',
]) {
  requireFragment(source, fragment, 'security observability');
}

for (const fragment of [
  'input.request.url',
  'input.request.headers',
  'input.request.body',
  'error.message',
  'error.stack',
  'String(error)',
  "'authorization'",
  "'cookie'",
  "'set-cookie'",
  "'email'",
  "'birthDate'",
  "'password'",
  "'token'",
  "'databaseUrl'",
]) {
  forbidFragment(source, fragment, 'security observability');
}

for (const [path, routeId] of fetchBoundaryRoutes) {
  const route = readFileSync(resolve(root, path), 'utf8');
  requireFragment(route, 'executeSecurityObservedRequestV1', `Fetch security boundary ${path}`);
  requireFragment(route, `routeId: '${routeId}'`, `Fetch security boundary ${path}`);
  forbidFragment(route, 'console.error(', `Fetch security boundary ${path}`);
  forbidFragment(route, 'console.warn(', `Fetch security boundary ${path}`);
}

for (const [path, routeId] of nodeBoundaryRoutes) {
  const route = readFileSync(resolve(root, path), 'utf8');
  requireFragment(route, 'executeSecurityObservedNodeRequestV1', `Node security boundary ${path}`);
  requireFragment(route, `routeId: '${routeId}'`, `Node security boundary ${path}`);
  forbidFragment(route, 'console.error(', `Node security boundary ${path}`);
  forbidFragment(route, 'console.warn(', `Node security boundary ${path}`);
}

requireFragment(
  governance,
  'node scripts/verify-security-observability-governance.mjs',
  'governance workflow',
);

if (failures.length > 0) {
  console.error('Security observability governance failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Security observability governance passed: api_inventory=${expectedApiFiles.length} fetch_boundaries=${fetchBoundaryRoutes.size} node_boundaries=${nodeBoundaryRoutes.size} structured_events=true privacy_safe_fields=true logger_failure_isolated=true unexpected_exception_fail_safe=true`,
);
