import { appendFileSync, readFileSync } from 'node:fs';

const API_ORIGIN = 'https://api.vercel.com';

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

function safeProviderCode(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/u.test(value)
    ? value
    : 'UNKNOWN';
}

async function providerRequest(token, path, init = {}) {
  const method = init.method ?? 'GET';
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  const raw = await response.text();
  let payload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      if (!response.ok) {
        fail(
          `Vercel Alert API failed: method=${method} status=${response.status} code=NON_JSON_RESPONSE`,
        );
      }
      fail('Vercel Alert API returned invalid JSON.');
    }
  }

  if (!response.ok) {
    const code =
      payload && typeof payload === 'object'
        ? safeProviderCode(payload.error?.code ?? payload.code)
        : 'UNKNOWN';
    fail(
      `Vercel Alert API failed: method=${method} status=${response.status} code=${code}`,
    );
  }

  return payload;
}

async function listRules(token, authority) {
  const teamId = authority.team?.id;
  const projectId = authority.project?.id;
  if (typeof teamId !== 'string' || typeof projectId !== 'string') {
    fail('Alert authority is missing the governed Vercel team or project id.');
  }

  const rules = [];
  let cursor = '';

  do {
    const params = new URLSearchParams({
      teamId,
      projectId,
      limit: '100',
    });
    if (cursor) params.set('cursor', cursor);

    const page = await providerRequest(
      token,
      `/alerts/v3/alert-rules?${params.toString()}`,
    );

    if (!Array.isArray(page.rules)) {
      fail('Vercel Alert API list response is missing rules[].');
    }

    rules.push(...page.rules);
    cursor =
      typeof page.pagination?.next === 'string' ? page.pagination.next : '';
  } while (cursor);

  return rules;
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

async function createRule(token, authority, desired) {
  const teamId = authority.team?.id;
  if (typeof teamId !== 'string') {
    fail('Alert authority is missing the governed Vercel team id.');
  }

  const params = new URLSearchParams({ teamId });
  await providerRequest(
    token,
    `/alerts/v3/alert-rules?${params.toString()}`,
    {
      method: 'POST',
      body: JSON.stringify(desired),
    },
  );
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

if (authority.activation?.providerApi !== '/alerts/v3/alert-rules') {
  fail('Alert authority does not pin the Vercel Alert Rules v3 API.');
}
if (authority.activation?.providerTransport !== 'direct-bearer-api') {
  fail('Alert authority does not permit direct bearer API activation.');
}

let rules = await listRules(token, authority);
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

  await createRule(token, authority, desired);
  rules = await listRules(token, authority);
  rule = selectRule(rules, desired);

  if (rule === null) {
    fail('Vercel security alert rule was not visible after creation.');
  }
} else {
  emit('rule_present_before', 'true');
}

const ruleId = validateRule(rule, desired);
emit('rule_present_after', 'true');
emit('rule_id', ruleId);
console.log(
  'vercel_security_alert_rule=pass provider_api=v3 transport=direct-bearer-api',
);
