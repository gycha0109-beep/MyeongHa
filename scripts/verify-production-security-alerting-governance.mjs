import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const rulePath = 'config/security/vercel-production-5xx-error-anomaly-rule-v1.json';
const authorityPath = 'config/security/production-security-alerting-v1.json';
const workflowPath = '.github/workflows/production-security-alerting-activate.yml';
const runbookPath = 'docs/operations/PRODUCTION_SECURITY_ALERTING_RUNBOOK_V1.md';
const responsibilityPath = 'docs/ci/workflow-responsibility-map.json';
const governancePath = '.github/workflows/governance.yml';

const rule = JSON.parse(readFileSync(resolve(root, rulePath), 'utf8'));
const authority = JSON.parse(readFileSync(resolve(root, authorityPath), 'utf8'));
const workflow = readFileSync(resolve(root, workflowPath), 'utf8');
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

expectEqual('rule.name', rule.name, 'MyeongHa Production 5xx Error Anomalies');
expectEqual('rule.alertTypes', rule.alertTypes, [
  {
    type: 'error_anomaly',
    filter: "statusGroup eq '5xx'",
  },
]);
expectEqual(
  'rule.projectId',
  rule.projectId,
  "projectId in ('prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP')",
);
expectEqual('rule.autosubscribeOwnersInKnock', rule.autosubscribeOwnersInKnock, true);
for (const forbiddenKey of [
  'customAlert',
  'triggerThreshold',
  'minThreshold',
  'triggerOperator',
]) {
  if (Object.hasOwn(rule, forbiddenKey)) {
    failures.push(`rule: forbidden application-owned threshold field ${forbiddenKey}`);
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
  'authority.runtimeSecurityEventSchema',
  authority.runtimeSecurityEventSchema,
  'myeongha-security-event-v1',
);
expectEqual(
  'authority.serverFailures',
  authority.detection?.serverFailures,
  {
    providerRuleType: 'error_anomaly',
    filter: "statusGroup eq '5xx'",
    numericThresholdOwnedBy: 'vercel-native-anomaly-model',
    repositoryNumericThreshold: null,
  },
);
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
  'PENDING_ACTIVATION',
);
expectEqual('authority.activation.providerRuleId', authority.activation?.providerRuleId, null);

for (const fragment of [
  'workflow_dispatch:',
  'ACTIVATE_PRODUCTION_SECURITY_ALERTING_A09',
  'watchtower_track:',
  'default: security',
  'environment: production',
  'VERCEL_SECURITY_ALERTS_TOKEN',
  'vercel@59.19.1',
  '--ignore-scripts',
  'alerts rules ls',
  'alerts rules add',
  'ensure-vercel-security-alert-rule.mjs',
  'vercel-production-5xx-error-anomaly-rule-v1.json',
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
]) {
  forbidFragment(workflow, fragment, workflowPath);
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
  "statusGroup eq '5xx'",
  'BASELINE_REQUIRED',
  'VERCEL_SECURITY_ALERTS_TOKEN',
  'Do not create numeric alert thresholds',
  'MYEONGHA_SECURITY_EVENT',
]) {
  requireFragment(runbook, fragment, runbookPath);
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
  'Production security alerting governance passed: provider=vercel project=myeongha alert=5xx-error-anomaly numeric-threshold=provider-owned access-denied=baseline-required rate-limit=baseline-required activation=manual-fail-closed.',
);
