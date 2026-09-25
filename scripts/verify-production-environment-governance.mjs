import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const probePath = resolve(root, '.github/workflows/production-environment-policy-probe.yml');
const policyPath = resolve(root, 'docs/operations/GITHUB_PRODUCTION_ENVIRONMENT_POLICY_V1.md');
const governancePath = resolve(root, '.github/workflows/governance.yml');

const probe = readFileSync(probePath, 'utf8').replace(/\r\n/g, '\n');
const policy = readFileSync(policyPath, 'utf8').replace(/\r\n/g, '\n');
const governance = readFileSync(governancePath, 'utf8').replace(/\r\n/g, '\n');

const failures = [];

function requireFragment(source, fragment, label) {
  if (!source.includes(fragment)) failures.push(`${label}: missing ${JSON.stringify(fragment)}`);
}

function forbidPattern(source, pattern, label) {
  if (pattern.test(source)) failures.push(`${label}: forbidden pattern ${pattern}`);
}

requireFragment(probe, 'run-name: "[WT:ops] Production Environment Policy Probe"', 'probe');
requireFragment(probe, '  workflow_dispatch:', 'probe');
requireFragment(probe, "description: 'Type PROBE_PRODUCTION_ENVIRONMENT to test only the GitHub Environment gate.'", 'probe');
requireFragment(probe, 'permissions:\n  contents: read', 'probe');
requireFragment(probe, 'environment: production', 'probe');
requireFragment(probe, "[[ \"$DISPATCH_CONFIRM\" == 'PROBE_PRODUCTION_ENVIRONMENT' ]]", 'probe');
requireFragment(probe, "[[ \"${{ github.event_name }}\" == 'workflow_dispatch' ]]", 'probe');
requireFragment(probe, "printf 'production_environment_probe=admitted\\n'", 'probe');

forbidPattern(probe, /^\s{2}(push|pull_request|pull_request_target|schedule|repository_dispatch|workflow_run):/mu, 'probe trigger');
forbidPattern(probe, /\bsecrets\./u, 'probe secret access');
forbidPattern(probe, /\bvars\./u, 'probe environment variable access');
forbidPattern(probe, /^\s{2,}[a-z-]+:\s*write\s*$/mu, 'probe write permission');
forbidPattern(probe, /\b(curl|wget|psql|supabase|vercel|gh\s+api|gh\s+workflow|npm\s+publish)\b/iu, 'probe external or mutating command');
forbidPattern(probe, /uses:\s*/u, 'probe external action');

requireFragment(policy, 'Deployment branches and tags: **Selected branches and tags**', 'policy');
requireFragment(policy, 'Allowed branch: **main**', 'policy');
requireFragment(policy, 'Allowed tags: **none**', 'policy');
requireFragment(policy, 'Required reviewers: **none while MyeongHa is effectively single-operator**', 'policy');
requireFragment(policy, 'Administrator bypass: **prevent bypass when the repository/account plan exposes that control**', 'policy');
requireFragment(policy, 'a non-main feature branch as the workflow ref', 'policy');
requireFragment(policy, 'The probe step MUST NOT execute.', 'policy');
requireFragment(policy, 'Dispatch the same probe from `main`.', 'policy');

requireFragment(
  governance,
  'node scripts/verify-production-environment-governance.mjs',
  'governance',
);

if (failures.length > 0) {
  console.error('Production Environment governance failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  'Production Environment governance passed: probe=workflow_dispatch-only permissions=contents:read environment=production secrets=0 writes=0 network=0 policy=main-only-control-plane-required',
);
