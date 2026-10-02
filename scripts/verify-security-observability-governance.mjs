import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const securityPath = resolve(root, 'apps/api/src/security-observability.ts');
const governancePath = resolve(root, '.github/workflows/governance.yml');

const fetchBoundaryPaths = [
  'api/auth/promote-guest.ts',
  'api/auth/refresh.ts',
  'api/auth/sign-in.ts',
  'api/auth/sign-out.ts',
  'api/auth/sign-up.ts',
  'api/health.ts',
  'api/me.ts',
  'api/me/birth-profile.ts',
  'api/me/saju/calculation.ts',
  'api/readiness.ts',
  'api/session/bootstrap.ts',
];

const source = readFileSync(securityPath, 'utf8');
const governance = readFileSync(governancePath, 'utf8');
const failures = [];

function requireFragment(value, fragment, label) {
  if (!value.includes(fragment)) failures.push(`${label}: missing ${JSON.stringify(fragment)}`);
}

function forbidFragment(value, fragment, label) {
  if (value.includes(fragment)) failures.push(`${label}: forbidden ${JSON.stringify(fragment)}`);
}

for (const fragment of [
  "myeongha-security-event-v1",
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

for (const path of fetchBoundaryPaths) {
  const route = readFileSync(resolve(root, path), 'utf8');
  requireFragment(
    route,
    'executeSecurityObservedRequestV1',
    `Fetch security boundary ${path}`,
  );
  forbidFragment(
    route,
    "console.error('MyeongHa",
    `Fetch security boundary ${path}`,
  );
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
  `Security observability governance passed: fetch_boundaries=${fetchBoundaryPaths.length} structured_events=true privacy_safe_fields=true unexpected_exception_fail_safe=true node_adapter_followup=api/birth-profiles.ts`,
);
