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
      Object.keys(value).sort().map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function collectRuleObjects(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRuleObjects(item, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;

  if (
    typeof value.name === 'string' &&
    Array.isArray(value.alertTypes)
  ) {
    out.push(value);
  }

  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object') collectRuleObjects(nested, out);
  }
  return out;
}

const [mode, actualPath, desiredPath] = process.argv.slice(2);
if (!['preflight', 'require'].includes(mode ?? '')) {
  fail('Usage: ensure-vercel-security-alert-rule.mjs <preflight|require> <actual-json> <desired-json>');
}
if (!actualPath || !desiredPath) fail('Missing alert rule input path.');

const actual = JSON.parse(readFileSync(actualPath, 'utf8'));
const desired = JSON.parse(readFileSync(desiredPath, 'utf8'));

const candidates = collectRuleObjects(actual).filter(
  (rule) => rule.name === desired.name,
);

if (candidates.length === 0) {
  emit('rule_present', 'false');
  emit('rule_id', '');
  if (mode === 'require') fail('Required Vercel security alert rule is absent.');
  process.exit(0);
}

if (candidates.length !== 1) {
  fail(`Expected exactly one alert rule named ${desired.name}; found ${candidates.length}.`);
}

const rule = candidates[0];
for (const key of ['name', 'projectId', 'alertTypes', 'autosubscribeOwnersInKnock']) {
  if (JSON.stringify(stable(rule[key])) !== JSON.stringify(stable(desired[key]))) {
    fail(`Vercel security alert rule drift detected at field ${key}.`);
  }
}

const ruleId =
  typeof rule.id === 'string'
    ? rule.id
    : typeof rule.ruleId === 'string'
      ? rule.ruleId
      : '';

if (mode === 'require' && !ruleId) {
  fail('Activated Vercel security alert rule did not expose a stable rule id.');
}

emit('rule_present', 'true');
emit('rule_id', ruleId);
console.log('vercel_security_alert_rule=pass');
