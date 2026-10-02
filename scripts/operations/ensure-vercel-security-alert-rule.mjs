import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function emit(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
  console.log(`${name}=${value}`);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function sanitizeCliOutput(value) {
  return String(value ?? '')
    .replace(/\u001b\[[0-9;]*m/gu, '')
    .replace(/vcp_[A-Za-z0-9._-]+/gu, '[REDACTED_TOKEN]')
    .replace(/Authorization:\s*Bearer\s+\S+/giu, 'Authorization: Bearer [REDACTED]')
    .trim()
    .slice(0, 1200);
}

function classifyCliFailure(detail) {
  if (/User not found/iu.test(detail)) return 'CREDENTIAL_SCOPE_INCOMPATIBLE';
  if (/not authorized|unauthorized|forbidden|permission/iu.test(detail)) {
    return 'PROVIDER_PERMISSION_DENIED';
  }
  if (/Observability Plus|not available|unsupported plan|upgrade/iu.test(detail)) {
    return 'PROVIDER_CAPABILITY_UNAVAILABLE';
  }
  return 'PROVIDER_CLI_FAILURE';
}

function runCli(authority, args) {
  const cliPackage = authority.activation?.providerCliPackage;
  const teamSlug = authority.team?.slug;

  if (typeof cliPackage !== 'string' || !/^vercel@\d+\.\d+\.\d+$/u.test(cliPackage)) {
    fail('Alert authority must pin an exact Vercel CLI package version.');
  }
  if (typeof teamSlug !== 'string' || teamSlug.length === 0) {
    fail('Alert authority is missing the governed Vercel team slug.');
  }

  const result = spawnSync(
    'npm',
    [
      'exec',
      '--yes',
      `--package=${cliPackage}`,
      '--',
      'vercel',
      '--scope',
      teamSlug,
      ...args,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        NO_COLOR: '1',
      },
      maxBuffer: 4 * 1024 * 1024,
    },
  );

  if (result.error) {
    fail(`Vercel Alert CLI could not start: code=CLI_START_FAILURE`);
  }

  if (result.status !== 0) {
    const detail = sanitizeCliOutput(result.stderr || result.stdout);
    const code = classifyCliFailure(detail);
    const suffix =
      code === 'CREDENTIAL_SCOPE_INCOMPATIBLE'
        ? ' Replace the project-scoped credential with a team/account access token that can resolve the governed team and manage Alert Rules.'
        : detail
          ? ` detail=${detail}`
          : '';
    fail(
      `Vercel Alert CLI failed: command=${args.slice(0, 4).join(' ')} exit=${result.status} code=${code}.${suffix}`,
    );
  }

  return result.stdout;
}

function runJson(authority, args) {
  const raw = runCli(authority, args);
  try {
    return JSON.parse(raw);
  } catch {
    fail(
      `Vercel Alert CLI returned invalid JSON: command=${args.slice(0, 4).join(' ')}`,
    );
  }
}

async function listRules(authority) {
  const projectId = authority.project?.id;
  if (typeof projectId !== 'string') {
    fail('Alert authority is missing the governed Vercel project id.');
  }

  const page = runJson(authority, [
    'alerts',
    'rules',
    'ls',
    '--project',
    projectId,
    '--type',
    'built-in',
    '--format',
    'json',
  ]);

  if (!Array.isArray(page.rules)) {
    fail('Vercel Alert CLI list response is missing rules[].');
  }

  return page.rules;
}

function validateRule(rule, desired) {
  const fields = [
    'name',
    'type',
    'ruleScope',
    'triggers',
    'matchMinimumSeverityLevel',
  ];

  for (const key of fields) {
    if (!same(rule[key], desired[key])) {
      fail(`Vercel security alert rule drift detected at field ${key}.`);
    }
  }

  if (rule.notificationSettings?.enableTeamOwnerNotifications !== true) {
    fail('Vercel security alert rule does not enable team-owner notifications.');
  }

  if (typeof rule.id !== 'string' || !/^ar_[A-Za-z0-9_-]+$/u.test(rule.id)) {
    fail('Activated Vercel security alert rule did not expose a stable rule id.');
  }

  return rule.id;
}

function selectRule(rules, desired) {
  const candidates = rules.filter((rule) => rule?.name === desired.name);

  if (candidates.length > 1) {
    fail(
      `Expected at most one alert rule named ${desired.name}; found ${candidates.length}.`,
    );
  }

  return candidates[0] ?? null;
}

function createRule(authority, desiredPath) {
  const result = runJson(authority, [
    'alerts',
    'rules',
    'add',
    '--body',
    desiredPath,
    '--format',
    'json',
  ]);

  if (!result || typeof result !== 'object' || !result.rule) {
    fail('Vercel Alert CLI create response is missing rule.');
  }

  return result.rule;
}

function inspectRule(authority, ruleId) {
  const result = runJson(authority, [
    'alerts',
    'rules',
    'inspect',
    ruleId,
    '--format',
    'json',
  ]);

  if (!result || typeof result !== 'object' || !result.rule) {
    fail('Vercel Alert CLI inspect response is missing rule.');
  }

  return result.rule;
}

const [mode, desiredPath, authorityPath] = process.argv.slice(2);
if (!['preflight', 'activate', 'require'].includes(mode ?? '')) {
  fail(
    'Usage: ensure-vercel-security-alert-rule.mjs <preflight|activate|require> <desired-json> <authority-json>',
  );
}
if (!desiredPath || !authorityPath) {
  fail('Missing alert rule or authority input path.');
}

const token = process.env.VERCEL_TOKEN;
if (!token) fail('VERCEL_SECURITY_ALERTS_TOKEN is not available to the workflow.');

const desired = JSON.parse(readFileSync(desiredPath, 'utf8'));
const authority = JSON.parse(readFileSync(authorityPath, 'utf8'));

if (authority.activation?.providerInterface !== 'alerts-rules-cli') {
  fail('Alert authority does not pin the official Vercel Alert Rules CLI interface.');
}
if (authority.activation?.providerTransport !== 'official-vercel-cli') {
  fail('Alert authority does not permit official Vercel CLI activation.');
}
if (authority.activation?.teamScopedCredentialRequired !== true) {
  fail('Alert authority must require a team/account-capable credential.');
}
if (Object.hasOwn(authority.activation ?? {}, 'providerApi')) {
  fail('Alert authority must not pin an undocumented Alert Rules REST endpoint.');
}

let rules = await listRules(authority);
let rule = selectRule(rules, desired);

if (rule === null) {
  emit('rule_present_before', 'false');

  if (mode === 'preflight') {
    emit('rule_id', '');
    process.exit(0);
  }
  if (mode === 'require') {
    fail('Required Vercel security alert rule is absent.');
  }

  const created = createRule(authority, desiredPath);
  validateRule(created, desired);

  rules = await listRules(authority);
  rule = selectRule(rules, desired);

  if (rule === null) {
    fail('Vercel security alert rule was not visible after creation.');
  }
} else {
  emit('rule_present_before', 'true');
}

const listedRuleId = validateRule(rule, desired);
const inspectedRule = inspectRule(authority, listedRuleId);
const ruleId = validateRule(inspectedRule, desired);

if (ruleId !== listedRuleId) {
  fail('Vercel security alert rule inspection returned an unexpected rule id.');
}

emit('rule_present_after', 'true');
emit('rule_id', ruleId);
console.log(
  `vercel_security_alert_rule=pass provider_interface=alerts-rules-cli transport=official-vercel-cli cli=${authority.activation.providerCliPackage}`,
);
