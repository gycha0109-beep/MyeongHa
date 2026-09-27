import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const paths = {
  registry: 'config/operations/vercel-waf-managed-rate-limit-rules-v1.json',
  guestPolicy: 'config/operations/guest-bootstrap-abuse-policy-v1.json',
  memberPolicy: 'config/operations/member-auth-abuse-policy-v1.json',
  common: 'scripts/operations/vercel-waf-managed-rule-common.sh',
};

execFileSync('bash', ['-n', paths.common], { stdio: 'inherit' });

const [registryRaw, guestRaw, memberRaw] = await Promise.all([
  readFile(paths.registry, 'utf8'),
  readFile(paths.guestPolicy, 'utf8'),
  readFile(paths.memberPolicy, 'utf8'),
]);

const registry = JSON.parse(registryRaw);
const guestPolicy = JSON.parse(guestRaw);
const memberPolicy = JSON.parse(memberRaw);

if (registry.contractVersion !== 'myeongha-vercel-waf-managed-rate-limit-rules-v1') {
  throw new Error('Unexpected WAF managed-rule registry contractVersion.');
}
for (const [key, expected] of Object.entries({
  vercelProjectId: 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP',
  vercelTeamId: 'team_xuYA9OhCWlJETaYFOmeVodgS',
  vercelProjectName: 'myeongha',
})) {
  if (registry[key] !== expected) throw new Error('Registry has unexpected ' + key + '.');
}
if (!Array.isArray(registry.managedRules) || registry.managedRules.length !== 4) {
  throw new Error('Registry must contain exactly four governed rate-limit rules in Phase A.');
}

const policyIds = registry.managedRules.map((rule) => rule.policyId);
const ruleNames = registry.managedRules.map((rule) => rule.ruleName);
if (new Set(policyIds).size !== policyIds.length || new Set(ruleNames).size !== ruleNames.length) {
  throw new Error('Registry policyId and ruleName values must be unique.');
}

const expectedRegistry = new Map([
  ['guest-bootstrap-v1', ['myeongha-guest-bootstrap-rate-limit-v1', 'config/operations/guest-bootstrap-abuse-policy-v1.json', 'production-active']],
  ['member-auth-sign-in-v1', ['myeongha-auth-sign-in-rate-limit-v1', 'config/operations/member-auth-abuse-policy-v1.json', 'hold']],
  ['member-auth-sign-up-v1', ['myeongha-auth-sign-up-rate-limit-v1', 'config/operations/member-auth-abuse-policy-v1.json', 'hold']],
  ['member-auth-refresh-v1', ['myeongha-auth-refresh-rate-limit-v1', 'config/operations/member-auth-abuse-policy-v1.json', 'hold']],
]);
for (const rule of registry.managedRules) {
  const expected = expectedRegistry.get(rule.policyId);
  if (!expected || JSON.stringify([rule.ruleName, rule.policyFile, rule.activationAuthority]) !== JSON.stringify(expected)) {
    throw new Error('Unexpected registry entry for ' + rule.policyId + '.');
  }
}

const memberById = new Map(memberPolicy.rules.map((rule) => [rule.policyId, rule]));
for (const entry of registry.managedRules) {
  const contract = entry.policyId === 'guest-bootstrap-v1' ? guestPolicy : memberById.get(entry.policyId);
  if (!contract || contract.ruleName !== entry.ruleName) {
    throw new Error('Registry entry ' + entry.policyId + ' does not resolve to its governed policy rule.');
  }
}

function makeRule(policy, action = policy.enforceRateLimitAction) {
  return {
    id: 'rule_' + (policy.policyId || 'guest'),
    name: policy.ruleName,
    active: true,
    valid: true,
    validationErrors: [],
    conditionGroup: [{
      conditions: [
        { type: 'path', op: 'eq', neg: false, value: policy.route },
        { type: 'method', op: 'eq', neg: false, value: policy.method },
      ],
    }],
    action: {
      mitigate: {
        action: 'rate_limit',
        rateLimit: {
          algo: policy.algorithm,
          window: policy.windowSeconds,
          limit: policy.requestLimit,
          keys: policy.keys,
          action,
        },
        redirect: null,
        actionDuration: null,
      },
    },
  };
}

const temp = await mkdtemp(join(tmpdir(), 'myeongha-waf-registry-'));
try {
  const safe = join(temp, 'safe.json');
  const foreign = join(temp, 'foreign.json');
  const held = join(temp, 'held.json');

  await writeFile(safe, JSON.stringify({
    active: { firewallEnabled: true, rules: [makeRule(guestPolicy)] },
  }));
  await writeFile(foreign, JSON.stringify({
    active: {
      firewallEnabled: true,
      rules: [
        makeRule(guestPolicy),
        { ...makeRule(guestPolicy), id: 'foreign', name: 'foreign-rate-limit' },
      ],
    },
  }));
  await writeFile(held, JSON.stringify({
    active: {
      firewallEnabled: true,
      rules: [
        makeRule(guestPolicy),
        makeRule(memberById.get('member-auth-sign-in-v1')),
      ],
    },
  }));

  const runFixture = (fixture, shouldPass) => {
    try {
      execFileSync('bash', [
        '-c',
        'source "$1"; assert_managed_rate_limit_registry_live_safety "$2" "" "$3"',
        'bash',
        paths.common,
        fixture,
        paths.registry,
      ], { stdio: shouldPass ? 'inherit' : 'ignore' });
      if (!shouldPass) throw new Error('Fixture unexpectedly passed: ' + fixture);
    } catch (error) {
      if (shouldPass) throw error;
    }
  };

  runFixture(safe, true);
  runFixture(foreign, false);
  runFixture(held, false);
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log('MyeongHa Vercel WAF managed rate-limit registry verification passed.');
