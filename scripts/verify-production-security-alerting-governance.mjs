import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const rulePath = 'config/security/vercel-production-5xx-error-anomaly-rule-v1.json';
const authorityPath = 'config/security/production-security-alerting-v1.json';
const workflowPath = '.github/workflows/production-security-alerting-activate.yml';
const operationPath = 'scripts/operations/ensure-vercel-security-alert-rule.mjs';
const runbookPath = 'docs/operations/PRODUCTION_SECURITY_ALERTING_RUNBOOK_V1.md';
const responsibilityPath = 'docs/ci/workflow-responsibility-map.json';
const governancePath = '.github/workflows/governance.yml';

const rule = JSON.parse(readFileSync(resolve(root, rulePath), 'utf8'));
const authority = JSON.parse(readFileSync(resolve(root, authorityPath), 'utf8'));
const workflow = readFileSync(resolve(root, workflowPath), 'utf8');
const operation = readFileSync(resolve(root, operationPath), 'utf8');
const runbook = readFileSync(resolve(root, runbookPath), 'utf8');
const responsibility = JSON.parse(
  readFileSync(resolve(root, responsibilityPath), 'utf8'),
);
const governance = readFileSync(resolve(root, governancePath), 'utf8');

const failures = [];

function expectEqual(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${label}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
    );
  }
}

function requireFragment(value, fragment, label) {
  if (!value.includes(fragment)) {
    failures.push(`${label}: missing ${JSON.stringify(fragment)}`);
  }
}

function forbidFragment(value, fragment, label) {
  if (value.includes(fragment)) {
    failures.push(`${label}: forbidden ${JSON.stringify(fragment)}`);
  }
}

expectEqual('rule.type', rule.type, 'built-in');
expectEqual('rule.name', rule.name, 'MyeongHa Production 5xx Error Anomalies');
expectEqual(
  'rule.ruleScope',
  rule.ruleScope,
  {
    type: 'include',
    projectIds: ['prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP'],
  },
);
expectEqual(
  'rule.triggers',
  rule.triggers,
  {
    mode: 'selected',
    items: [
      {
        type: 'error_anomaly',
        filter: 'statusGroup:5xx',
      },
    ],
  },
);
expectEqual('rule.matchMinimumSeverityLevel', rule.matchMinimumSeverityLevel, 'high');

for (const forbiddenKey of [
  'alertTypes',
  'projectId',
  'autosubscribeOwnersInKnock',
  'customAlert',
  'triggerThreshold',
  'minThreshold',
  'triggerOperator',
]) {
  if (Object.hasOwn(rule, forbiddenKey)) {
    failures.push(`rule: forbidden legacy/application-owned field ${forbiddenKey}`);
  }
}

expectEqual(
  'authority.schemaVersion',
  authority.schemaVersion,
  'myeongha-production-security-alerting-v1',
);
expectEqual('authority.owasp', authority.owasp, ['A09:2025']);
expectEqual('authority.provider', authority.provider, 'vercel');
expectEqual(
  'authority.team',
  authority.team,
  {
    id: 'team_xuYA9OhCWlJETaYFOmeVodgS',
    slug: 'johnny-self',
  },
);
expectEqual(
  'authority.project',
  authority.project,
  {
    id: 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP',
    slug: 'myeongha',
    productionDomain: 'myeongha.vercel.app',
  },
);
expectEqual(
  'authority.serverFailures',
  authority.detection?.serverFailures,
  {
    providerRuleType: 'error_anomaly',
    filter: 'statusGroup:5xx',
    numericThresholdOwnedBy: 'vercel-native-anomaly-model',
    repositoryNumericThreshold: null,
  },
);
expectEqual(
  'authority.activation.providerInterface',
  authority.activation?.providerInterface,
  'alerts-rules-cli',
);
expectEqual(
  'authority.activation.providerTransport',
  authority.activation?.providerTransport,
  'official-vercel-cli',
);
expectEqual(
  'authority.activation.providerCliPackage',
  authority.activation?.providerCliPackage,
  'vercel@59.19.1',
);
expectEqual(
  'authority.activation.teamScopedCredentialRequired',
  authority.activation?.teamScopedCredentialRequired,
  true,
);
if (Object.hasOwn(authority.activation ?? {}, 'providerApi')) {
  failures.push(
    'authority.activation.providerApi: undocumented Alert Rules REST endpoint must not be pinned',
  );
}
expectEqual(
  'authority.accessDenied.alertingState',
  authority.detection?.accessDenied?.alertingState,
  'BASELINE_REQUIRED',
);
expectEqual(
  'authority.rateLimited.alertingState',
  authority.detection?.rateLimited?.alertingState,
  'BASELINE_REQUIRED',
);
expectEqual(
  'authority.activation.requiredConfirmation',
  authority.activation?.requiredConfirmation,
  'ACTIVATE_PRODUCTION_SECURITY_ALERTING_A09',
);
expectEqual(
  'authority.activation.requiredTrack',
  authority.activation?.requiredTrack,
  'security',
);
expectEqual(
  'authority.activation.credentialSecret',
  authority.activation?.credentialSecret,
  'VERCEL_SECURITY_ALERTS_TOKEN',
);
expectEqual(
  'authority.activation.state',
  authority.activation?.state,
  'ACTIVE',
);
expectEqual(
  'authority.activation.providerRuleId',
  authority.activation?.providerRuleId,
  'ar_01a0fb72-ee7b-723e-943c-7fd428917c2e',
);

for (const fragment of [
  'workflow_dispatch:',
  'ACTIVATE_PRODUCTION_SECURITY_ALERTING_A09',
  'watchtower_track:',
  'default: security',
  'environment: production',
  'VERCEL_SECURITY_ALERTS_TOKEN',
  'Activate and verify governed Vercel alert rule',
  'ensure-vercel-security-alert-rule.mjs',
  'config/security/vercel-production-5xx-error-anomaly-rule-v1.json',
  'config/security/production-security-alerting-v1.json',
  'provider_interface=alerts-rules-cli',
  'provider_transport=official-vercel-cli',
  'provider_cli=vercel@59.19.1',
  'credential_material_emitted=false',
  'user_payload_emitted=false',
]) {
  requireFragment(workflow, fragment, workflowPath);
}

for (const fragment of [
  '\npush:',
  '\npull_request:',
  '\nschedule:',
  'echo "$VERCEL_TOKEN"',
  'set -x',
  '/alerts/v3/alert-rules',
  'direct-bearer-api',
]) {
  forbidFragment(workflow, fragment, workflowPath);
}

for (const fragment of [
  "spawnSync(",
  "'npm'",
  "'exec'",
  "'vercel'",
  "'--scope'",
  "'alerts'",
  "'rules'",
  "'ls'",
  "'add'",
  "'inspect'",
  "'--project'",
  "'--type'",
  "'built-in'",
  "'--format'",
  "'json'",
  'CREDENTIAL_SCOPE_INCOMPATIBLE',
  'team/account access token',
  'provider_interface=alerts-rules-cli',
  'official-vercel-cli',
]) {
  requireFragment(operation, fragment, operationPath);
}

for (const fragment of [
  'console.log(token)',
  'console.error(token)',
  'JSON.stringify(process.env)',
  'https://api.vercel.com',
  '/alerts/v3/alert-rules',
  'Authorization:',
  'Bearer',
  'fetch(',
]) {
  forbidFragment(operation, fragment, operationPath);
}

const workflowResponsibility =
  responsibility.workflows?.['production-security-alerting-activate.yml'];
expectEqual(
  'workflow responsibility',
  workflowResponsibility,
  {
    responsibility: 'production-security-alerting',
    prMode: 'none',
    mainMode: 'manual',
    workTrackAttribution: 'dispatch-input',
  },
);

for (const fragment of [
  'A09:2025',
  'error_anomaly',
  'statusGroup:5xx',
  'BASELINE_REQUIRED',
  'VERCEL_SECURITY_ALERTS_TOKEN',
  'vercel alerts rules',
  'official Vercel CLI',
  'vercel@59.19.1',
  'project-scoped',
  'team/account',
  'Do not create numeric alert thresholds',
  'MYEONGHA_SECURITY_EVENT',
]) {
  requireFragment(runbook, fragment, runbookPath);
}

for (const fragment of [
  '/alerts/v3/alert-rules',
  'direct bearer API',
]) {
  forbidFragment(runbook, fragment, runbookPath);
}

requireFragment(
  governance,
  'node scripts/verify-production-security-alerting-governance.mjs',
  governancePath,
);

if (failures.length > 0) {
  console.error('Production security alerting governance failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  'Production security alerting governance passed: provider=vercel interface=alerts-rules-cli transport=official-vercel-cli cli=vercel@59.19.1 project=myeongha alert=5xx-error-anomaly numeric-threshold=provider-owned access-denied=baseline-required rate-limit=baseline-required activation=manual-fail-closed.',
);
